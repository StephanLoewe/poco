import { TZ, withTimeout } from "./helpers.js"

// ─── Google OAuth (GIS token model) ───────────────────────────
let _tokenClient = null
let _accessToken = null

const SCOPES = "https://www.googleapis.com/auth/calendar"

export function getTokenClient() {
  if (_tokenClient) return _tokenClient
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: () => {},
  })
  return _tokenClient
}

// Set the access token directly — used by the doLogin callback (user gesture).
export function setAccessToken(token) { _accessToken = token }

// Waits for the GIS script to finish loading (it has async attribute).
function waitForGoogle(timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return }
    const start = Date.now()
    const id = setInterval(() => {
      if (window.google?.accounts?.oauth2) { clearInterval(id); resolve() }
      else if (Date.now() - start > timeout) { clearInterval(id); reject(new Error("GIS not loaded")) }
    }, 100)
  })
}

// Acquire an OAuth token. The ONLY place that opens the GIS flow.
// prompt: "" = silent (reuse existing session), "consent" = force dialog.
// Silent calls are timeout-guarded so a non-firing callback can't hang.
export function acquireToken(prompt) {
  return waitForGoogle().then(() => {
    const p = new Promise((resolve, reject) => {
      const client = getTokenClient()
      client.callback = (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return }
        _accessToken = resp.access_token
        resolve(resp)
      }
      client.requestAccessToken({ prompt })
    })
    // Don't timeout the consent dialog — the user needs time to interact.
    return prompt === "consent" ? p : withTimeout(p, 10000, "auth_timeout")
  })
}

// Pure API wrapper: uses the already-acquired token, never opens a popup.
// Throws "not_authed" if there is no token yet (caller should log in first).
async function withAuth(fn) {
  await waitForGoogle()
  if (!_accessToken) throw new Error("not_authed")
  return fn()
}

// ─── Google Calendar REST API ─────────────────────────────────
async function calApi(method, path, body) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${_accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (r.status === 401) { _accessToken = null; throw new Error("token_expired") }
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
  // "fetch failed" apart from "no events".
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
