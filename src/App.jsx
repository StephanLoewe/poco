import { useState, useEffect } from "react"
import "./tokens.css"
import "./styles/global.css"
import "./styles/components.css"

import { useWidth } from "./lib/hooks.js"
import { T, COL_W } from "./lib/constants.js"
import { uid, dKey, nowT, eAdd } from "./lib/helpers.js"
import { acquireToken, getTokenClient, setAccessToken } from "./lib/googleAuth.js"
import { gCals, gCreate, gUpdate, gDel } from "./lib/googleCalendar.js"
import { store, persist, apiSecret } from "./lib/storage.js"
import { useSync } from "./lib/useSync.js"

import { Header } from "./components/Header.jsx"
import { TabBar } from "./components/TabBar.jsx"
import { Toast } from "./components/Toast.jsx"
import { TaskModal } from "./components/TaskModal.jsx"
import { CalendarMapModal } from "./components/CalendarMapModal.jsx"
import { EnergyBar } from "./components/EnergyBar.jsx"
import { LabelLegend } from "./components/LabelLegend.jsx"

import { MultiDayView } from "./views/MultiDayView.jsx"
import { DayView } from "./views/DayView.jsx"
import { WeekView } from "./views/WeekView.jsx"
import { ListView } from "./views/ListView.jsx"
import { InboxView } from "./views/InboxView.jsx"

export default function App() {
  const w = useWidth()
  const isMobile = w < 700
  // On desktop: how many days fit in the calendar area (minus time label column)
  const calW    = w - (isMobile ? 0 : 32) // subtract page padding on desktop
  const dayViewDays = isMobile ? 1 : Math.min(7, Math.max(3, Math.floor((calW - COL_W) / 160)))
  const weekDayW    = isMobile ? 110 : Math.floor((calW - COL_W) / 7)

  const [tasks,   setTasks  ] = useState([])
  const [cals,    setCals   ] = useState({})
  const [budget,  setBudget ] = useState(8)
  const [view,    setView   ] = useState("day")
  const [date,    setDate   ] = useState(new Date())
  const [modal,   setModal  ] = useState(null)
  const [toast,   setToast  ] = useState("")
  const [authed,  setAuthed ] = useState(false)
  const [needsSecret, setNeedsSecret] = useState(!localStorage.getItem("poco-secret"))
  const [calPicker, setCalPicker] = useState(null) // list of google cals for mapping UI

  const showToast = (m, ms = 3000) => { setToast(m); setTimeout(() => setToast(""), ms) }

  useEffect(() => {
    const { tasks: t, cals: c, budget: b } = store.load()
    setTasks(t); setBudget(b)
    if (Object.keys(c).length > 0) {
      setCals(c)
      // Try a SILENT token (reuses an existing Google session, no popup).
      // On success authed flips → the [authed,cals] effect runs doSync.
      // On failure the "Anmelden" banner stays visible.
      acquireToken("")
        .then(() => setAuthed(true))
        .catch(() => showToast("Zum Synchronisieren anmelden", 4000))
    } else {
      showToast("Anmelden um Google Kalender zu verbinden", 5000)
    }
  }, [])

  // Connect calendars: fetch list, then show mapping UI
  const connectCalendars = async () => {
    showToast("Verbinde Google Kalender …", 10000)
    const list = await gCals()
    setAuthed(true)
    if (!list || !Array.isArray(list)) { showToast("Kalender-Verbindung fehlgeschlagen"); return null }
    // Return a Promise that resolves when the user saves the mapping
    return new Promise((resolve) => {
      setCalPicker({ list, resolve })
    })
  }

  const { syncing, doSync, doSyncRef } = useSync({
    tasks, setTasks, cals, authed, setAuthed, setNeedsSecret, showToast, connectCalendars
  })

  // Direkt aus User-Gesture aufrufen — kein await davor, sonst blockt Mobile Safari den Popup.
  // Nur noch für den (read-only) Google-Kalender — Daten-Sync läuft übers Backend.
  const doLogin = () => {
    if (!window.google?.accounts?.oauth2) { showToast("App lädt noch, kurz warten …", 3000); return }
    const client = getTokenClient()
    client.callback = (resp) => {
      if (resp.error) { showToast("Anmeldung fehlgeschlagen: " + resp.error, 5000); return }
      setAccessToken(resp.access_token)
      setAuthed(true) // triggers the [authed,cals] effect → doSync
      showToast("Angemeldet, synchronisiere …", 3000)
    }
    client.requestAccessToken({ prompt: "" })
  }

  const handleCalMapSave = async (map) => {
    const filtered = Object.fromEntries(Object.entries(map).filter(([, v]) => v))
    setCals(filtered)
    const res = await persist(null, filtered)
    if (res?.unauthorized) setNeedsSecret(true)
    setCalPicker(null)
    showToast(`${Object.keys(filtered).length} Kalender verbunden ✓`)
    calPicker.resolve(filtered)
  }

  const handleCalMapSkip = () => {
    setCalPicker(null)
    showToast("Sync übersprungen")
    calPicker.resolve(null)
  }

  const handleSave = async (f) => {
    const existing = tasks.find(t => t.id === f.id)
    let gcalId = f.gcalId
    const calId = cals[f.label]
    if (calId && authed && f.date) {
      const s = `${f.date}T${f.time}:00`
      const e = `${f.date}T${eAdd(f.time, f.duration)}:00`
      try {
        if (!existing || !gcalId) {
          const res = await gCreate(calId, f.title, s, e)
          if (res?.id) gcalId = res.id
        } else {
          await gUpdate(calId, gcalId, f.title, s, e)
        }
      } catch { /* save locally even if calendar fails */ }
    }
    const fin     = { ...f, gcalId }
    const updated = existing ? tasks.map(t => t.id === f.id ? fin : t) : [...tasks, fin]
    setTasks(updated)
    const res = await persist(updated)
    if (res?.unauthorized) setNeedsSecret(true)
    setModal(null); showToast(existing ? "Gespeichert ✓" : "Aufgabe erstellt ✓")
  }

  const handleDelete = async (id) => {
    const t = tasks.find(x => x.id === id)
    if (t?.gcalId && cals[t.label] && authed) {
      try { await gDel(cals[t.label], t.gcalId) } catch {}
    }
    const updated = tasks.filter(x => x.id !== id)
    setTasks(updated)
    const res = await persist(updated)
    if (res?.unauthorized) setNeedsSecret(true)
    setModal(null); showToast("Gelöscht")
  }

  const handleBudget = async (v) => { 
    setBudget(v)
    const res = await persist(null, null, v)
    if (res?.unauthorized) setNeedsSecret(true)
  }

  const handleToggleDone = async (id) => {
    const updated = tasks.map(t => t.id === id ? { ...t, status: t.status === "done" ? "open" : "done" } : t)
    setTasks(updated)
    const res = await persist(updated)
    if (res?.unauthorized) setNeedsSecret(true)
  }

  // Ask for the shared sync password (POCO_SECRET) and re-sync
  const handleSetSecret = () => {
    const cur = apiSecret()
    const v = window.prompt("Sync-Passwort (auf allen Geräten gleich):", cur)
    if (v == null) return
    localStorage.setItem("poco-secret", v.trim())
    setNeedsSecret(false)
    showToast("Passwort gespeichert, synchronisiere …", 3000)
    setTimeout(() => doSyncRef.current?.(), 300)
  }

  return (
    <div className="app-container">
      {/* Centered chrome: header, login banner, legend, energy bar */}
      <div className="app-chrome" style={{ maxWidth: isMobile ? "none" : 1400 }}>
        <Header view={view} date={date} setDate={setDate} syncing={syncing} onSync={doSync} />
        {!authed && (
          <button onClick={doLogin} className="banner-btn banner-login">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            Mit Google anmelden & synchronisieren
          </button>
        )}
        {needsSecret && (
          <button onClick={handleSetSecret} className="banner-btn banner-secret">
            🔑 Sync-Passwort eingeben
          </button>
        )}
        {view !== "inbox" && <LabelLegend />}
        {view !== "inbox" && <EnergyBar tasks={tasks} date={date} budget={budget} onBudgetChange={handleBudget} />}
      </div>

      {/* Content area — list/inbox centered, calendar full width */}
      {view === "inbox" && (
        <div className="app-content">
          <div className="app-content-inner" style={{ maxWidth: isMobile ? "none" : 680 }}>
            <InboxView tasks={tasks}
              onTaskClick={t => setModal({ task: t })}
              onToggleDone={handleToggleDone}
              onAdd={partial => {
                const t = { id: uid(), priority: "P3", energy: 0, status: "open", duration: 30, label: "Arbeit", time: nowT(), ...partial }
                const updated = [...tasks, t]; setTasks(updated); store.tasks(updated)
              }} />
          </div>
        </div>
      )}
      {view === "day" && (
        <DayView tasks={tasks} date={date}
          onTaskClick={t => setModal({ task: t })}
          onTimeClick={t => setModal({ task: { time: t, date: dKey(date) } })} />
      )}
      {view === "week" && (
        <WeekView tasks={tasks} date={date} dayWidth={isMobile ? undefined : weekDayW}
          onTaskClick={t => setModal({ task: t })}
          onTimeClick={(t, d) => setModal({ task: { time: t, date: d } })} />
      )}
      {view === "list" && (
        <div className="app-content">
          <div className="app-content-inner" style={{ maxWidth: isMobile ? "none" : 680 }}>
            <ListView tasks={tasks} date={date}
              onTaskClick={t => setModal({ task: t })}
              onAdd={dk => setModal({ task: { date: dk } })}
              onToggleDone={handleToggleDone} />
          </div>
        </div>
      )}

      {modal && <TaskModal task={modal.task} onSave={handleSave} onDelete={handleDelete} onClose={() => setModal(null)} />}
      {calPicker && <CalendarMapModal googleCals={calPicker.list} onSave={handleCalMapSave} onSkip={handleCalMapSkip} />}
      <Toast msg={toast} />

      <TabBar view={view} setView={setView}
        onAdd={() => setModal({ task: view === "inbox" ? { date: "" } : {} })} />
    </div>
  )
}
