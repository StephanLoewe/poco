import { useState, useEffect, useRef } from "react"
import { uid, pad, dKey, getMon, dPlus, withTimeout } from "./helpers.js"
import { DURS } from "./constants.js"
import { gEvents } from "./googleCalendar.js"
import { store, persist, apiSecret, apiRead } from "./storage.js"

export function useSync({ tasks, setTasks, cals, authed, setAuthed, setNeedsSecret, showToast, connectCalendars }) {
  const [syncing, setSyncing] = useState(false)
  const doSyncRef = useRef(null)

  const doSync = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      let calMap = cals
      if (Object.keys(calMap).length === 0) {
        calMap = await connectCalendars()
        if (!calMap) { setSyncing(false); return }
      }

      showToast("Synchronisiere …", 15000)

      // Load latest state from the backend first (picks up other devices).
      // Timeout-guarded so a stalled request can't freeze the sync.
      let remoteData = null; let remoteErr = null
      if (apiSecret()) {
        try { remoteData = await withTimeout(apiRead(), 12000) }
        catch (e) { console.warn("Backend read:", e?.message); remoteErr = e?.message }
      } else {
        remoteErr = "no_secret"
      }
      const remoteOk = !!remoteData
      const localTasks = store.load().tasks
      // Merge: backend is source of truth for status/prio/energy, but keep any
      // local tasks the backend doesn't know yet (first sync on a new device)
      let base
      if (remoteData?.tasks) {
        const remoteIds = new Set(remoteData.tasks.map(t => t.id))
        const localOnly = localTasks.filter(t => !remoteIds.has(t.id))
        base = [...remoteData.tasks, ...localOnly]
      } else {
        base = localTasks
      }
      // Deduplicate base by gcalId — same calendar event may have been imported
      // independently on different devices with different app-internal ids
      const seenGcal = new Set()
      base = base.filter(t => {
        if (!t.gcalId) return true          // inbox/manual tasks: keep all
        if (seenGcal.has(t.gcalId)) return false
        seenGcal.add(t.gcalId); return true
      })
      let current = [...base]; let added = 0; let updated = 0; let removed = 0

      // ±2 Wochen um heute
      const winStart = dPlus(getMon(new Date()), -14)
      const winEnd   = dPlus(getMon(new Date()),  21)

      // Collect all gcalIds seen in this sync run (per calendar label)
      const seenByLabel = {} // label → Set of gcalIds

      for (const [lbl, id] of Object.entries(calMap)) {
        if (!id) continue
        const evs = await gEvents(id, winStart.toISOString(), winEnd.toISOString())
        if (!Array.isArray(evs)) continue
        seenByLabel[lbl] = new Set()
        for (const ev of evs) {
          seenByLabel[lbl].add(ev.id)
          const isAllDay = !ev.start?.dateTime
          const s = isAllDay
            ? new Date(ev.start.date + "T00:00:00")
            : new Date(ev.start.dateTime)
          const e = isAllDay
            ? new Date(ev.end.date + "T00:00:00")
            : new Date(ev.end.dateTime)
          const rawDur = Math.round((e - s) / 60000)
          const dur    = rawDur > 240 ? rawDur : DURS.reduce((p, c) => Math.abs(c - rawDur) < Math.abs(p - rawDur) ? c : p)
          const newDate = dKey(s)
          const newTime = `${pad(s.getHours())}:${pad(s.getMinutes())}`
          const newTitle = ev.summary || "Unbenannt"

          // Primary dedup: gcalId. Fallback: title+date+time catches the same event
          // appearing with different IDs in connected/shared Workspace calendars.
          const byId    = current.findIndex(t => t.gcalId === ev.id)
          const byMatch = byId === -1
            ? current.findIndex(t => t.date === newDate && t.time === newTime && t.title === newTitle)
            : -1
          const idx = byId !== -1 ? byId : byMatch
          if (idx === -1) {
            current.push({ id: uid(), title: newTitle, date: newDate, time: newTime, duration: dur, label: lbl, priority: "P3", energy: 0, status: "open", gcalId: ev.id, allDay: isAllDay || undefined })
            added++
          } else {
            const existing = current[idx]
            const changed = existing.title !== newTitle || existing.date !== newDate || existing.time !== newTime || existing.duration !== dur
            if (changed) {
              current[idx] = { ...existing, title: newTitle, date: newDate, time: newTime, duration: dur, allDay: isAllDay || undefined }
              updated++
            }
          }
        }
      }

      // Remove tasks whose GCal event was deleted — only within the sync window
      // and only for calendars that were successfully fetched
      current = current.filter(t => {
        if (!t.gcalId || !t.date) return true           // manual/inbox tasks: keep
        const lbl = t.label
        if (!seenByLabel[lbl]) return true              // calendar not fetched: keep
        const taskDate = new Date(t.date + "T00:00:00")
        if (taskDate < winStart || taskDate > winEnd) return true  // outside window: keep
        if (seenByLabel[lbl].has(t.gcalId)) return true           // still exists: keep
        removed++
        return false
      })

      setAuthed(true)
      setTasks(current)
      const res = await persist(current, calMap)
      if (res?.unauthorized) setNeedsSecret(true)
      
      const parts = [added > 0 && `${added} neu`, updated > 0 && `${updated} aktualisiert`, removed > 0 && `${removed} entfernt`].filter(Boolean)
      // Only prompt for the secret on explicit 401 — not on timeout/network errors
      const wrongSecret = remoteErr === "api_unauthorized"
      const noSecret   = remoteErr === "no_secret"
      if (remoteOk) setNeedsSecret(false)
      else if (wrongSecret || noSecret) setNeedsSecret(true)
      const remoteMsg = remoteOk ? "" : (wrongSecret || noSecret)
        ? " · Sync-Passwort nötig"
        : remoteErr === "Timeout" ? " · Sync-Timeout" : " · Sync offline"
      showToast(parts.length > 0 ? `${parts.join(", ")} ✓${remoteMsg}` : `${current.length} Einträge · alles aktuell${remoteMsg}`, remoteOk ? 3000 : 8000)
    } catch (e) {
      console.error(e)
      if (e.message === "token_expired" || e.message === "not_authed" || e.message === "auth_timeout") {
        setAuthed(false)
        showToast("Bitte neu anmelden", 6000)
      } else {
        showToast(e.message || "Sync-Fehler", 8000)
      }
    } finally {
      setSyncing(false)
    }
  }

  // Update ref and interval
  useEffect(() => { doSyncRef.current = doSync }, [doSync])
  
  useEffect(() => {
    if (!authed || Object.keys(cals).length === 0) return
    doSyncRef.current?.()
    const id = setInterval(() => doSyncRef.current?.(), 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [authed, cals])

  return { syncing, doSync, doSyncRef }
}
