import { withAuth, getAccessToken, clearAccessToken } from "./googleAuth.js"
import { TZ } from "./helpers.js"

// ─── Google Calendar REST API ─────────────────────────────────
async function calApi(method, path, body) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (r.status === 401) { clearAccessToken(); throw new Error("token_expired") }
  if (!r.ok) throw new Error(`Calendar API ${r.status}`)
  if (r.status === 204) return { ok: true }
  return r.json()
}

export const gCals = () => withAuth(async () => {
  const d = await calApi("GET", "/users/me/calendarList")
  return (d.items || []).map(c => ({ id: c.id, summary: c.summary }))
})

export const gEvents = (id, a, b) => withAuth(async () => {
  const p = new URLSearchParams({ timeMin: a, timeMax: b, singleEvents: "true", maxResults: "250", eventTypes: "default" })
  const pFocus = new URLSearchParams({ timeMin: a, timeMax: b, singleEvents: "true", maxResults: "250", eventTypes: "focusTime" })
  const [r1, r2] = await Promise.allSettled([
    calApi("GET", `/calendars/${encodeURIComponent(id)}/events?${p}`),
    calApi("GET", `/calendars/${encodeURIComponent(id)}/events?${pFocus}`),
  ])
  // If the primary (default) fetch failed, return null so the caller can tell
  // "fetch failed" apart from "no events" — critical to avoid wrongly deleting
  // tasks for a calendar that just had a transient error (401/403/network).
  if (r1.status !== "fulfilled") {
    console.warn("gEvents default fetch failed:", r1.reason?.message)
    return null
  }
  const raw = [
    ...(r1.value.items || []),
    ...(r2.status === "fulfilled" ? r2.value.items || [] : []),
  ]
  // Deduplicate by id within this calendar (can appear in both default + focusTime)
  const seen = new Set()
  const items = raw.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true })
  return items.map(e => ({ id: e.id, summary: e.summary || (e.eventType === "focusTime" ? "Fokuszeit" : "Unbenannt"), start: e.start, end: e.end, eventType: e.eventType }))
})

export const gCreate = (id, title, s, e) => withAuth(() =>
  calApi("POST", `/calendars/${encodeURIComponent(id)}/events`, {
    summary: title,
    start: { dateTime: s, timeZone: TZ },
    end:   { dateTime: e, timeZone: TZ },
  })
)

export const gUpdate = (id, eid, title, s, e) => withAuth(() =>
  calApi("PUT", `/calendars/${encodeURIComponent(id)}/events/${eid}`, {
    summary: title,
    start: { dateTime: s, timeZone: TZ },
    end:   { dateTime: e, timeZone: TZ },
  })
)

export const gDel = (id, eid) => withAuth(() =>
  calApi("DELETE", `/calendars/${encodeURIComponent(id)}/events/${eid}`)
)
