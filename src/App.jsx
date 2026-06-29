import { useState, useEffect, useRef, useCallback } from "react"

function useWidth() {
  const [w, setW] = useState(window.innerWidth)
  useEffect(() => {
    const fn = () => setW(window.innerWidth)
    window.addEventListener("resize", fn)
    return () => window.removeEventListener("resize", fn)
  }, [])
  return w
}

// ─── Design tokens ────────────────────────────────────────────
const T = {
  bg:      "#F4F6FB",
  surface: "#FFFFFF",
  border:  "#E6EAF4",
  subtle:  "#EFF2F9",
  text:    "#1A2340",
  muted:   "#8896B3",
  dim:     "#C8D2E4",
}

// ─── Constants ────────────────────────────────────────────────
const HOUR_H = 60
const COL_W  = 46

const LABELS = ["Arbeit", "Soziales", "Fun", "Tasks"]
const LC = {
  Arbeit:   { c: "#2563EB", bg: "#E8EEFB", brd: "#BACAF5" },
  Soziales: { c: "#DB2777", bg: "#FBEAF3", brd: "#F2AACD" },
  Fun:      { c: "#059669", bg: "#E5F5F0", brd: "#9ED9C5" },
  Tasks:    { c: "#6D28D9", bg: "#EDE8F9", brd: "#C5B0EF" },
}
const PC = {
  P1: { l: "Kritisch", c: "#EF4444" },
  P2: { l: "Hoch",     c: "#F97316" },
  P3: { l: "Normal",   c: "#EAB308" },
  P4: { l: "Niedrig",  c: "#94A3B8" },
}
const EC = [
  { v: -1, icon: "⚡", l: "Gibt Energie",     c: "#059669" },
  { v:  0, icon: "·",  l: "Neutral",           c: "#94A3B8" },
  { v:  1, icon: "▸",  l: "Leicht",            c: "#CA8A04" },
  { v:  2, icon: "▸▸", l: "Anstrengend",       c: "#EA580C" },
  { v:  3, icon: "▸▸▸",l: "Sehr anstrengend",  c: "#DC2626" },
]
const APP_VERSION = "1.1"
const DURS = [2, 15, 30, 45, 60, 90, 120, 150, 180, 240]
const DL   = { 2:"2min", 15:"15min", 30:"30min", 45:"45min", 60:"1h", 90:"1.5h", 120:"2h", 150:"2.5h", 180:"3h", 240:"4h" }
const WDAY = ["So","Mo","Di","Mi","Do","Fr","Sa"]
const MON  = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"]

// ─── Helpers ──────────────────────────────────────────────────
const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const pad   = (n) => String(n).padStart(2, "0")
const dKey  = (d) => { const dt = new Date(d); return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}` }
const nowT  = () => { const n = new Date(); return `${pad(n.getHours())}:${pad(n.getMinutes())}` }
const tPx   = (t) => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return (h + m / 60) * HOUR_H }
const dPx   = (m) => Math.max(22, (m / 60) * HOUR_H)
const eAdd  = (t, m) => { const [h, mn] = t.split(":").map(Number); const tot = h * 60 + mn + m; return `${pad(Math.floor(tot / 60) % 24)}:${pad(tot % 60)}` }
const eCnf  = (v) => EC.find(e => e.v === v) || EC[1]
const getMon= (d) => { const dt = new Date(d); dt.setHours(0,0,0,0); const dy = dt.getDay(); dt.setDate(dt.getDate() + (dy === 0 ? -6 : 1 - dy)); return dt }
const dPlus = (d, n) => { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt }
const TZ    = Intl.DateTimeFormat().resolvedOptions().timeZone

// ─── Google OAuth (GIS token model) ───────────────────────────
let _tokenClient = null
let _accessToken = null

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata"
const CAL_SCOPE   = "https://www.googleapis.com/auth/calendar"
const SCOPES      = [CAL_SCOPE, DRIVE_SCOPE].join(" ")

// Promise that rejects if it doesn't settle within ms — guards against
// blocked popups / stalled network that would otherwise hang sync forever.
const withTimeout = (p, ms, label = "Timeout") =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms))])

function getTokenClient() {
  if (_tokenClient) return _tokenClient
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: () => {},
  })
  return _tokenClient
}

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

// Wraps any Calendar API call: requests a token first if needed.
// Must be triggered from a user gesture (button click) on the first call.
async function withAuth(fn) {
  await waitForGoogle()
  return new Promise((resolve, reject) => {
    if (_accessToken) { fn().then(resolve).catch(reject); return }
    const client = getTokenClient()
    client.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return }
      _accessToken = resp.access_token
      fn().then(resolve).catch(reject)
    }
    client.requestAccessToken({ prompt: "" })
  })
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

const gCals = () => withAuth(async () => {
  const d = await calApi("GET", "/users/me/calendarList")
  return (d.items || []).map(c => ({ id: c.id, summary: c.summary }))
})

const gEvents = (id, a, b) => withAuth(async () => {
  const p = new URLSearchParams({ timeMin: a, timeMax: b, singleEvents: "true", maxResults: "250", eventTypes: "default" })
  const pFocus = new URLSearchParams({ timeMin: a, timeMax: b, singleEvents: "true", maxResults: "250", eventTypes: "focusTime" })
  const [r1, r2] = await Promise.allSettled([
    calApi("GET", `/calendars/${encodeURIComponent(id)}/events?${p}`),
    calApi("GET", `/calendars/${encodeURIComponent(id)}/events?${pFocus}`),
  ])
  const items = [
    ...(r1.status === "fulfilled" ? r1.value.items || [] : []),
    ...(r2.status === "fulfilled" ? r2.value.items || [] : []),
  ]
  return items.map(e => ({ id: e.id, summary: e.summary || (e.eventType === "focusTime" ? "Fokuszeit" : "Unbenannt"), start: e.start, end: e.end, eventType: e.eventType }))
})

const gCreate = (id, title, s, e) => withAuth(() =>
  calApi("POST", `/calendars/${encodeURIComponent(id)}/events`, {
    summary: title,
    start: { dateTime: s, timeZone: TZ },
    end:   { dateTime: e, timeZone: TZ },
  })
)

const gUpdate = (id, eid, title, s, e) => withAuth(() =>
  calApi("PUT", `/calendars/${encodeURIComponent(id)}/events/${eid}`, {
    summary: title,
    start: { dateTime: s, timeZone: TZ },
    end:   { dateTime: e, timeZone: TZ },
  })
)

const gDel = (id, eid) => withAuth(() =>
  calApi("DELETE", `/calendars/${encodeURIComponent(id)}/events/${eid}`)
)

// ─── Google Drive appdata sync ────────────────────────────────
const DRIVE_FILE = "poco-data.json"
let _driveFileId = null

async function driveAuthFetch(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${_accessToken}`, ...(opts.headers || {}) },
  })
  if (r.status === 401) { _accessToken = null; throw new Error("token_expired") }
  if (r.status === 403) { throw new Error("drive_forbidden") }
  if (!r.ok) {
    const txt = await r.text().catch(() => "")
    throw new Error(`Drive ${r.status}: ${txt.slice(0, 120)}`)
  }
  return r
}

async function driveReadInner() {
  const url = new URL("https://www.googleapis.com/drive/v3/files")
  url.searchParams.set("spaces", "appDataFolder")
  url.searchParams.set("q", `name = '${DRIVE_FILE}'`)
  url.searchParams.set("fields", "files(id)")
  const list = await (await driveAuthFetch(url)).json()
  if (!list.files?.length) return null
  _driveFileId = list.files[0].id
  const r = await driveAuthFetch(
    `https://www.googleapis.com/drive/v3/files/${_driveFileId}?alt=media`
  )
  return r.json()
}

async function driveRead() {
  // No consent popup here — scope is acquired at login (user gesture).
  // If the scope is missing this throws drive_forbidden and the caller
  // treats Drive as offline rather than hanging on a blocked popup.
  return withAuth(driveReadInner)
}

async function driveWriteInner(content) {
  if (_driveFileId) {
    await driveAuthFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${_driveFileId}?uploadType=media`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: content }
    )
  } else {
    const boundary = "poco_boundary"
    const multipart = [
      `--${boundary}`,
      "Content-Type: application/json",
      "",
      JSON.stringify({ name: DRIVE_FILE, parents: ["appDataFolder"] }),
      `--${boundary}`,
      "Content-Type: application/json",
      "",
      content,
      `--${boundary}--`,
    ].join("\r\n")
    const r = await driveAuthFetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: multipart }
    )
    _driveFileId = (await r.json()).id
  }
}

async function driveWrite(data) {
  return withAuth(() => driveWriteInner(JSON.stringify({ version: 1, ...data })))
}

// ─── Storage (localStorage) ───────────────────────────────────
const store = {
  load() {
    try {
      return {
        tasks:  JSON.parse(localStorage.getItem("sf-tasks")  || "null") ?? [],
        cals:   JSON.parse(localStorage.getItem("sf-cals")   || "null") ?? {},
        budget: JSON.parse(localStorage.getItem("sf-budget") || "null") ?? 8,
      }
    } catch { return { tasks: [], cals: {}, budget: 8 } }
  },
  tasks:  (v) => { try { localStorage.setItem("sf-tasks",  JSON.stringify(v)) } catch {} },
  cals:   (v) => { try { localStorage.setItem("sf-cals",   JSON.stringify(v)) } catch {} },
  budget: (v) => { try { localStorage.setItem("sf-budget", JSON.stringify(v)) } catch {} },
}

// ─── CalendarMapModal ─────────────────────────────────────────
function CalendarMapModal({ googleCals, onSave, onSkip }) {
  const [map, setMap] = useState(() => {
    const m = {}
    LABELS.forEach(l => { m[l] = googleCals[0]?.id || "" })
    return m
  })

  const sel = {
    fontFamily: "inherit", background: "#EFF2F9", color: "#1A2340",
    border: "1px solid #E6EAF4", borderRadius: 10, padding: "9px 12px",
    fontSize: 13, width: "100%", outline: "none",
  }

  return (
    <div onClick={onSkip} style={{ position: "fixed", inset: 0, background: "rgba(15,25,55,0.4)", backdropFilter: "blur(10px)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "22px 22px 0 0", width: "100%", maxWidth: 430, padding: "24px 20px 44px", boxShadow: "0 -8px 40px rgba(0,0,0,0.12)" }}>
        <div style={{ width: 36, height: 4, background: "#C8D2E4", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1A2340", marginBottom: 4 }}>Google Kalender zuordnen</div>
        <div style={{ fontSize: 12, color: "#8896B3", marginBottom: 20 }}>Welcher Google-Kalender gehört zu welchem Label?</div>

        {LABELS.map(l => (
          <div key={l} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: LC[l].c, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: LC[l].c, textTransform: "uppercase", letterSpacing: "0.08em" }}>{l}</span>
            </div>
            <select value={map[l]} onChange={e => setMap(p => ({ ...p, [l]: e.target.value }))} style={sel}>
              <option value="">— nicht synchronisieren —</option>
              {googleCals.map(c => <option key={c.id} value={c.id}>{c.summary}</option>)}
            </select>
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={onSkip} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #E6EAF4", background: "#EFF2F9", color: "#8896B3", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Überspringen</button>
          <button onClick={() => onSave(map)} style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", background: "#2563EB", color: "white", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>Speichern</button>
        </div>
      </div>
    </div>
  )
}

// ─── TaskModal ────────────────────────────────────────────────
function TaskModal({ task, onSave, onDelete, onClose }) {
  const isNew = !task.id
  const [f, setF] = useState({
    id:       task.id       || uid(),
    title:    task.title    || "",
    date:     task.date     || dKey(new Date()),
    time:     task.time     || nowT(),
    duration: task.duration || 30,
    label:    task.label    || "Arbeit",
    priority: task.priority || "P3",
    energy:   task.energy   ?? 0,
    status:   task.status   || "open",
    gcalId:   task.gcalId   || null,
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const inp = {
    fontFamily: "inherit", background: T.subtle, color: T.text,
    border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px",
    fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none",
  }
  const lbl = { fontSize: 10, color: T.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.1em", display: "block" }
  const chip = (active, col, bg) => ({
    padding: "7px 10px", borderRadius: 8,
    border: `1px solid ${active ? col : T.border}`,
    background: active ? bg : T.subtle,
    color: active ? col : T.muted,
    cursor: "pointer", fontSize: 12, fontFamily: "inherit", transition: "all 0.12s",
  })

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,25,55,0.35)", backdropFilter: "blur(10px)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: "22px 22px 0 0", width: "100%", maxWidth: 430, padding: "20px 20px 44px", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.12)" }}>
        <div style={{ width: 36, height: 4, background: T.dim, borderRadius: 2, margin: "0 auto 18px" }} />

        <input value={f.title} onChange={e => set("title", e.target.value)}
          placeholder="Was ist zu tun?" autoFocus
          style={{ ...inp, fontSize: 18, fontWeight: 600, background: "transparent", border: "none", borderBottom: `1px solid ${T.border}`, borderRadius: 0, padding: "4px 0", marginBottom: 18, color: T.text }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div><span style={lbl}>Datum</span><input type="date" value={f.date} onChange={e => set("date", e.target.value)} style={inp} /></div>
          <div><span style={lbl}>Uhrzeit</span><input type="time" value={f.time} onChange={e => set("time", e.target.value)} style={inp} /></div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>Dauer</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DURS.map(d => <button key={d} onClick={() => set("duration", d)} style={chip(f.duration === d, "#2563EB", "rgba(37,99,235,0.09)")}>{DL[d]}</button>)}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>Kalender</span>
          <div style={{ display: "flex", gap: 6 }}>
            {LABELS.map(l => <button key={l} onClick={() => set("label", l)} style={{ ...chip(f.label === l, LC[l].c, LC[l].bg), flex: 1, textAlign: "center" }}>{l}</button>)}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>Priorität</span>
          <div style={{ display: "flex", gap: 6 }}>
            {["P1","P2","P3","P4"].map(p => <button key={p} onClick={() => set("priority", p)} style={{ ...chip(f.priority === p, PC[p].c, PC[p].c + "18"), flex: 1, textAlign: "center" }}>{PC[p].l}</button>)}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <span style={lbl}>Energie</span>
          <div style={{ display: "flex", gap: 6 }}>
            {EC.map(e => (
              <button key={e.v} onClick={() => set("energy", e.v)} title={e.l}
                style={{ ...chip(f.energy === e.v, e.c, e.c + "18"), flex: 1, textAlign: "center", fontSize: 15, lineHeight: "1.4" }}>
                {e.icon}
              </button>
            ))}
          </div>
          <div style={{ textAlign: "center", fontSize: 11, color: T.muted, marginTop: 5 }}>{eCnf(f.energy).l}</div>
        </div>

        {!isNew && (
          <div style={{ marginBottom: 16 }}>
            <span style={lbl}>Status</span>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ v: "open", l: "Offen" }, { v: "done", l: "Erledigt ✓" }].map(s => (
                <button key={s.v} onClick={() => set("status", s.v)} style={{ ...chip(f.status === s.v, "#2563EB", "rgba(37,99,235,0.09)"), flex: 1, textAlign: "center" }}>{s.l}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {!isNew && <button onClick={() => onDelete(f.id)} style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid rgba(239,68,68,0.3)`, background: "rgba(239,68,68,0.06)", color: "#EF4444", cursor: "pointer", fontSize: 15 }}>✕</button>}
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${T.border}`, background: T.subtle, color: T.muted, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Abbrechen</button>
          <button onClick={() => f.title.trim() && onSave(f)}
            style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", background: f.title.trim() ? "#2563EB" : T.subtle, color: f.title.trim() ? "white" : T.muted, cursor: f.title.trim() ? "pointer" : "default", fontSize: 14, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s" }}>
            {isNew ? "Erstellen" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── TaskBlock (Timeline) ─────────────────────────────────────
function TaskBlock({ task, onClick }) {
  const lc   = LC[task.label] || LC.Arbeit
  const top  = tPx(task.time)
  const ht   = dPx(task.duration)
  const tiny = ht < 34
  const done = task.status === "done"
  const en   = eCnf(task.energy)
  const pr   = PC[task.priority]

  return (
    <div onClick={onClick} style={{
      position: "absolute", top, left: 4, right: 4, height: ht, minHeight: 22,
      background: done ? T.subtle : lc.bg,
      borderLeft: `3px solid ${done ? T.dim : lc.c}`,
      border: `1px solid ${done ? T.border : lc.brd}`,
      borderRadius: 8,
      padding: tiny ? "2px 7px" : "5px 8px",
      cursor: "pointer", overflow: "hidden", boxSizing: "border-box",
      opacity: done ? 0.55 : 1, transition: "opacity 0.2s",
      display: "flex", alignItems: tiny ? "center" : "flex-start",
      flexDirection: "column", justifyContent: tiny ? "center" : "flex-start",
    }}>
      <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 4 }}>
        <span style={{ flex: 1, fontSize: tiny ? 10 : 12, fontWeight: 600, color: done ? T.dim : lc.c, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", textDecoration: done ? "line-through" : "none" }}>
          {task.title}
        </span>
        <span style={{ fontSize: 10, color: en.c, flexShrink: 0 }}>{en.icon}</span>
        <span style={{ fontSize: 9, color: pr.c, fontWeight: 700, flexShrink: 0 }}>{task.priority}</span>
      </div>
      {!tiny && <span style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>{task.time} – {eAdd(task.time, task.duration)}</span>}
    </div>
  )
}

// ─── NowLine ──────────────────────────────────────────────────
function NowLine() {
  const [top, setTop] = useState(tPx(nowT()))
  useEffect(() => {
    const id = setInterval(() => setTop(tPx(nowT())), 30000)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ position: "absolute", top, left: 0, right: 0, pointerEvents: "none", zIndex: 8, display: "flex", alignItems: "center" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", marginLeft: -4, flexShrink: 0 }} />
      <div style={{ flex: 1, height: 1.5, background: "rgba(239,68,68,0.55)" }} />
    </div>
  )
}

// ─── HourGrid ─────────────────────────────────────────────────
function HourGrid() {
  return <>
    {Array.from({ length: 24 }, (_, h) => (
      <div key={h} style={{ position: "absolute", top: h * HOUR_H, left: 0, right: 0, height: HOUR_H, borderTop: `1px solid ${h ? T.border : "transparent"}` }} />
    ))}
  </>
}

// ─── MultiDayView (DayView + WeekView unified) ────────────────
function MultiDayView({ tasks, date, numDays, dayWidth, onTaskClick, onTimeClick }) {
  const ref   = useRef()
  const today = dKey(new Date())
  const days  = Array.from({ length: numDays }, (_, i) => dPlus(date, i))
  const hasAllDay = days.some(d => tasks.some(t => t.date === dKey(d) && t.allDay))

  useEffect(() => {
    const isToday = days.some(d => dKey(d) === today)
    if (ref.current) ref.current.scrollTop = isToday ? Math.max(0, tPx(nowT()) - 100) : tPx("07:30")
  }, [dKey(date)])

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Day header row */}
      <div style={{ display: "flex", background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ width: COL_W, flexShrink: 0 }} />
        {days.map(d => {
          const dk = dKey(d); const isT = dk === today
          return (
            <div key={dk} style={{ flex: numDays === 1 ? 1 : undefined, width: numDays > 1 ? dayWidth : undefined, flexShrink: 0, textAlign: "center", padding: "8px 4px", borderLeft: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{WDAY[d.getDay()]}</div>
              <div style={{ fontSize: 14, fontWeight: 700, width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "3px auto 0", background: isT ? "#2563EB" : "transparent", color: isT ? "white" : T.text }}>
                {d.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* All-day strip */}
      {hasAllDay && (
        <div style={{ display: "flex", background: T.subtle, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ width: COL_W, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>
            <span style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Ganztag</span>
          </div>
          {days.map(d => {
            const dk = dKey(d)
            return (
              <div key={dk} style={{ flex: numDays === 1 ? 1 : undefined, width: numDays > 1 ? dayWidth : undefined, flexShrink: 0, borderLeft: `1px solid ${T.border}`, padding: "3px 4px", display: "flex", flexDirection: "column", gap: 2 }}>
                {tasks.filter(t => t.date === dk && t.allDay).map(t => {
                  const lc = LC[t.label] || LC.Arbeit
                  return (
                    <div key={t.id} onClick={() => onTaskClick(t)} style={{ fontSize: 10, fontWeight: 600, color: lc.c, background: lc.bg, border: `1px solid ${lc.brd}`, borderRadius: 4, padding: "2px 5px", cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {t.title}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* Timeline */}
      <div ref={ref} style={{ flex: 1, overflowY: "auto", display: "flex" }}>
        {/* Hour labels */}
        <div style={{ width: COL_W, flexShrink: 0, position: "sticky", left: 0, background: T.surface, zIndex: 5 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ position: "absolute", top: h * HOUR_H, right: 0, left: 0, display: "flex", justifyContent: "flex-end", paddingRight: 8, boxSizing: "border-box" }}>
              {h ? <span style={{ fontSize: 10, color: T.dim, fontWeight: 500, transform: "translateY(-50%)", display: "block", background: T.surface, paddingLeft: 2 }}>{pad(h)}:00</span> : null}
            </div>
          ))}
        </div>
        {/* Day columns */}
        <div style={{ display: "flex", flex: 1, minHeight: 24 * HOUR_H }}>
          {days.map(d => {
            const dk = dKey(d); const isT = dk === today
            const timedTasks = tasks.filter(t => t.date === dk && !t.allDay)
            return (
              <div key={dk} style={{ flex: numDays === 1 ? 1 : undefined, width: numDays > 1 ? dayWidth : undefined, flexShrink: 0, position: "relative", background: T.surface, borderLeft: `1px solid ${T.border}` }}
                onClick={e => {
                  const r = e.currentTarget.getBoundingClientRect()
                  const y = e.clientY - r.top + (ref.current?.scrollTop || 0)
                  const m = Math.round((y / HOUR_H) * 60 / 15) * 15
                  numDays === 1
                    ? onTimeClick(`${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`)
                    : onTimeClick(`${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`, dk)
                }}>
                <HourGrid />
                {isT && <NowLine />}
                {timedTasks.map(t => <TaskBlock key={t.id} task={t} onClick={e => { e.stopPropagation(); onTaskClick(t) }} />)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function DayView({ tasks, date, onTaskClick, onTimeClick }) {
  return <MultiDayView tasks={tasks} date={date} numDays={1} onTaskClick={onTaskClick} onTimeClick={onTimeClick} />
}

// ─── WeekView ─────────────────────────────────────────────────
function WeekView({ tasks, date, dayWidth, onTaskClick, onTimeClick }) {
  const mon = getMon(date)
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowX: dayWidth ? "hidden" : "auto", overflowY: "hidden" }}>
        <MultiDayView tasks={tasks} date={mon} numDays={7} dayWidth={dayWidth || 110} onTaskClick={onTaskClick} onTimeClick={onTimeClick} />
      </div>
    </div>
  )
}

// ─── ListView ─────────────────────────────────────────────────
function ListView({ tasks, date, onTaskClick, onAdd, onToggleDone }) {
  const mon   = getMon(date)
  const days  = Array.from({ length: 7 }, (_, i) => dPlus(mon, i))
  const today = dKey(new Date())

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 32px" }}>
      {days.map(d => {
        const dk   = dKey(d)
        const isT  = dk === today
        const dt   = tasks.filter(t => t.date === dk).sort((a, b) => a.time.localeCompare(b.time))
        const open = dt.filter(t => t.status === "open")
        const done = dt.filter(t => t.status === "done")
        const net  = open.reduce((s, t) => s + (t.energy ?? 0), 0)

        return (
          <div key={dk} style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: isT ? "#2563EB" : T.subtle, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: isT ? "white" : T.muted }}>{d.getDate()}</span>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: isT ? "#2563EB" : T.muted, textTransform: "uppercase", letterSpacing: "0.07em", lineHeight: 1 }}>
                  {isT ? "Heute" : WDAY[d.getDay()]}
                </div>
                {dt.length > 0 && (
                  <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>
                    {dt.length} Aufgabe{dt.length !== 1 ? "n" : ""}
                    {net !== 0 && <span style={{ marginLeft: 6, color: net > 0 ? "#EA580C" : "#059669" }}>{net > 0 ? `+${net}` : net} ⚡</span>}
                  </div>
                )}
              </div>
              <button onClick={() => onAdd(dk)} style={{ marginLeft: "auto", width: 26, height: 26, borderRadius: 8, border: `1px dashed ${T.dim}`, background: "transparent", color: T.dim, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, fontWeight: 300 }}>+</button>
            </div>

            {dt.length === 0 && (
              <div style={{ background: T.surface, borderRadius: 12, border: `1px dashed ${T.border}`, padding: "14px 16px", textAlign: "center" }}>
                <span style={{ fontSize: 12, color: T.dim }}>Keine Aufgaben</span>
              </div>
            )}

            {open.map(t => <ListRow key={t.id} task={t} onClick={() => onTaskClick(t)} onToggleDone={() => onToggleDone(t.id)} />)}

            {done.length > 0 && (
              <div style={{ marginTop: open.length > 0 ? 6 : 0 }}>
                {done.map(t => <ListRow key={t.id} task={t} onClick={() => onTaskClick(t)} onToggleDone={() => onToggleDone(t.id)} />)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ListRow({ task, onClick, onToggleDone }) {
  const lc   = LC[task.label] || LC.Arbeit
  const pr   = PC[task.priority]
  const en   = eCnf(task.energy)
  const done = task.status === "done"

  return (
    <div onClick={onClick} style={{
      background: T.surface, borderRadius: 12,
      border: `1px solid ${done ? T.border : lc.brd}`,
      borderLeft: `3px solid ${done ? T.dim : lc.c}`,
      padding: "10px 14px", marginBottom: 6,
      cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
      opacity: done ? 0.52 : 1, transition: "all 0.15s",
    }}>
      <div
        onClick={e => { e.stopPropagation(); onToggleDone() }}
        style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
          border: `1.5px solid ${done ? lc.c : T.dim}`,
          background: done ? lc.c : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s",
        }}
      >
        {done && <span style={{ fontSize: 11, color: "white", lineHeight: 1 }}>✓</span>}
      </div>
      <div style={{ fontSize: 11, color: T.muted, minWidth: 38, textAlign: "right", flexShrink: 0, fontWeight: 500 }}>
        {task.time}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: done ? T.dim : T.text, textDecoration: done ? "line-through" : "none", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {task.title}
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: lc.c, fontWeight: 500 }}>{task.label}</span>
          <span>·</span>
          <span>{DL[task.duration]}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: en.c }}>{en.icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: pr.c }}>{task.priority}</span>
      </div>
    </div>
  )
}

// ─── InboxView ────────────────────────────────────────────────
function InboxView({ tasks, onTaskClick, onAdd }) {
  const [input, setInput] = useState("")
  const inboxTasks = tasks.filter(t => !t.date)
  const open = inboxTasks.filter(t => t.status !== "done")
  const done = inboxTasks.filter(t => t.status === "done")

  const handleAdd = () => {
    const title = input.trim()
    if (!title) return
    onAdd({ title, date: "", time: nowT(), duration: 30, label: "Arbeit", priority: "P3", energy: 0, status: "open" })
    setInput("")
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {/* Quick capture */}
      <div style={{ padding: "12px 16px", background: T.surface, borderBottom: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAdd()}
          placeholder="Schnell erfassen …"
          style={{ flex: 1, background: T.subtle, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, color: T.text, fontFamily: "inherit", outline: "none" }}
        />
        <button onClick={handleAdd} style={{ width: 40, height: 40, borderRadius: 10, border: "none", background: input.trim() ? "#2563EB" : T.subtle, color: input.trim() ? "white" : T.dim, cursor: input.trim() ? "pointer" : "default", fontSize: 20, flexShrink: 0, transition: "all 0.15s" }}>+</button>
      </div>

      <div style={{ flex: 1, padding: "14px 16px 32px" }}>
        {inboxTasks.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📥</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.muted }}>Inbox ist leer</div>
            <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>Erfasse Aufgaben oben — Datum später zuordnen</div>
          </div>
        )}

        {open.map(t => <InboxRow key={t.id} task={t} onClick={() => onTaskClick(t)} />)}

        {done.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 18, marginBottom: 8 }}>Erledigt</div>
            {done.map(t => <InboxRow key={t.id} task={t} onClick={() => onTaskClick(t)} />)}
          </>
        )}
      </div>
    </div>
  )
}

function InboxRow({ task, onClick }) {
  const lc   = LC[task.label] || LC.Arbeit
  const pr   = PC[task.priority]
  const done = task.status === "done"

  return (
    <div onClick={onClick} style={{
      background: T.surface, borderRadius: 12,
      border: `1px solid ${done ? T.border : lc.brd}`,
      borderLeft: `3px solid ${done ? T.dim : lc.c}`,
      padding: "11px 14px", marginBottom: 6,
      cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
      opacity: done ? 0.52 : 1, transition: "all 0.15s",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: done ? T.dim : T.text, textDecoration: done ? "line-through" : "none", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {task.title}
        </div>
        <div style={{ fontSize: 11, color: lc.c, fontWeight: 500, marginTop: 2 }}>{task.label}</div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: pr.c, flexShrink: 0 }}>{task.priority}</div>
      <div style={{ fontSize: 11, color: T.dim, flexShrink: 0 }}>→ Datum</div>
    </div>
  )
}

// ─── EnergyBar ────────────────────────────────────────────────
function EnergyBar({ tasks, date, budget, onBudgetChange }) {
  const dk   = dKey(date)
  const open = tasks.filter(t => t.date === dk && t.status === "open")
  const net  = open.reduce((s, t) => s + (t.energy ?? 0), 0)
  const pct  = budget > 0 ? Math.min(100, Math.max(0, (net / budget) * 100)) : 0
  const col  = pct > 90 ? "#EF4444" : pct > 70 ? "#F97316" : pct > 50 ? "#EAB308" : "#059669"

  return (
    <div style={{ padding: "7px 16px 8px", background: T.surface, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>⚡ Budget</span>
        <div style={{ flex: 1, height: 4, background: T.subtle, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 2, transition: "width 0.4s ease" }} />
        </div>
        <span style={{ fontSize: 11, color: col, flexShrink: 0, minWidth: 20, textAlign: "right", fontWeight: 600 }}>{net}</span>
        <span style={{ fontSize: 11, color: T.dim }}>/</span>
        <input type="number" value={budget} min={1} max={30} onChange={e => onBudgetChange(Math.max(1, +e.target.value))}
          style={{ width: 28, background: "transparent", border: "none", color: T.muted, fontSize: 11, textAlign: "center", outline: "none", fontFamily: "inherit", padding: 0 }}
        />
      </div>
    </div>
  )
}

// ─── LabelLegend ─────────────────────────────────────────────
function LabelLegend() {
  return (
    <div style={{ display: "flex", gap: 12, padding: "5px 16px 6px", background: T.surface, borderBottom: `1px solid ${T.border}` }}>
      {LABELS.map(l => (
        <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: LC[l].c }} />
          <span style={{ fontSize: 10, color: T.muted, fontWeight: 500 }}>{l}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────
function Header({ view, setView, date, setDate, onAdd, syncing, onSync }) {
  const isToday = dKey(date) === dKey(new Date())

  const nav = (dir) => {
    const dt = new Date(date)
    view === "day" ? dt.setDate(dt.getDate() + dir) : dt.setDate(dt.getDate() + dir * 7)
    setDate(dt)
  }

  const title = view === "day"
    ? date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })
    : (() => { const m = getMon(date); const s = dPlus(m, 6); return `${m.getDate()}. ${MON[m.getMonth()]} – ${s.getDate()}. ${MON[s.getMonth()]}` })()

  const viewOpts = [{ v: "inbox", l: "Inbox" }, { v: "list", l: "Liste" }, { v: "day", l: "Tag" }, { v: "week", l: "Woche" }]

  return (
    <div style={{ padding: "max(14px, env(safe-area-inset-top)) 16px 10px", background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0, boxShadow: "0 1px 0 rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", background: T.subtle, borderRadius: 10, padding: 3 }}>
          {viewOpts.map(({ v, l }) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "5px 9px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit",
              fontSize: 12, fontWeight: 500, transition: "all 0.15s",
              background: view === v ? T.surface : "transparent",
              color: view === v ? "#2563EB" : T.muted,
              boxShadow: view === v ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}>{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: T.dim }}>v{APP_VERSION}</span>
          <button onClick={onSync} disabled={syncing} title="Sync mit Google Kalender"
            style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, color: syncing ? "#2563EB" : T.muted, cursor: syncing ? "default" : "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", animation: syncing ? "spin 1s linear infinite" : "none" }}>
            ↻
          </button>
        </div>
      </div>
      {view !== "inbox" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => nav(-1)} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 20, padding: "2px 8px", lineHeight: 1 }}>‹</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: isToday ? "#2563EB" : T.text, lineHeight: 1.3 }}>{title}</div>
            {!isToday && <button onClick={() => setDate(new Date())} style={{ fontSize: 10, color: "#2563EB", background: "transparent", border: "none", cursor: "pointer", marginTop: 2, fontFamily: "inherit", padding: 0 }}>→ Heute</button>}
          </div>
          <button onClick={() => nav(1)} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 20, padding: "2px 8px", lineHeight: 1 }}>›</button>
        </div>
      )}
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────
function Toast({ msg }) {
  if (!msg) return null
  return (
    <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: T.text, borderRadius: 20, padding: "8px 18px", fontSize: 12, color: "white", zIndex: 200, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}>
      {msg}
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────
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
  const [syncing, setSyncing] = useState(false)
  const [toast,   setToast  ] = useState("")
  const [authed,  setAuthed ] = useState(false)
  const [calPicker, setCalPicker] = useState(null) // list of google cals for mapping UI

  const showToast = (m, ms = 3000) => { setToast(m); setTimeout(() => setToast(""), ms) }

  useEffect(() => {
    const { tasks: t, cals: c, budget: b } = store.load()
    setTasks(t); setBudget(b)
    if (Object.keys(c).length > 0) {
      setCals(c)
      showToast("Kalender wird synchronisiert …", 3000)
      // Auto-sync on startup: delay so GIS script is loaded and doSyncRef is set
      // driveLoad runs inside doSync after auth succeeds
      setTimeout(() => doSyncRef.current?.(), 1500)
    } else {
      showToast("↻ drücken um Google Kalender zu verbinden", 5000)
    }
  }, [])

  // Auto-sync alle 30 Minuten — ref statt Closure, damit immer die aktuelle doSync gilt
  const doSyncRef = useRef(null)
  useEffect(() => { doSyncRef.current = doSync })
  useEffect(() => {
    if (!authed || Object.keys(cals).length === 0) return
    doSyncRef.current?.()
    const id = setInterval(() => doSyncRef.current?.(), 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [authed, cals])

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

  // Direkt aus User-Gesture aufrufen — kein await davor, sonst blockt Mobile Safari den Popup.
  // Beim ersten Mal (oder solange Drive nicht freigegeben ist) erzwingen wir den
  // Consent-Screen, damit der drive.appdata-Scope sicher erteilt wird.
  const doLogin = () => {
    if (!window.google?.accounts?.oauth2) { showToast("App lädt noch, kurz warten …", 3000); return }
    const client = getTokenClient()
    const driveGranted = localStorage.getItem("poco-drive-ok") === "1"
    client.callback = (resp) => {
      if (resp.error) { showToast("Anmeldung fehlgeschlagen: " + resp.error, 5000); return }
      _accessToken = resp.access_token
      const hasDrive = window.google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)
      if (hasDrive) localStorage.setItem("poco-drive-ok", "1")
      else localStorage.removeItem("poco-drive-ok")
      setAuthed(true)
      showToast(hasDrive ? "Angemeldet, synchronisiere …" : "Angemeldet (Drive nicht freigegeben)", 4000)
      setTimeout(() => doSyncRef.current?.(), 300)
    }
    client.requestAccessToken({ prompt: driveGranted ? "" : "consent" })
  }

  const handleCalMapSave = (map) => {
    const filtered = Object.fromEntries(Object.entries(map).filter(([, v]) => v))
    setCals(filtered); persist(null, filtered)
    setCalPicker(null)
    showToast(`${Object.keys(filtered).length} Kalender verbunden ✓`)
    calPicker.resolve(filtered)
  }

  const handleCalMapSkip = () => {
    setCalPicker(null)
    showToast("Sync übersprungen")
    calPicker.resolve(null)
  }

  // Persist to both localStorage (fast/offline) and Drive (cross-device).
  // localStorage write is synchronous and always succeeds; Drive is best-effort
  // with a timeout so a stalled request can never freeze the UI.
  const persist = async (newTasks, newCals, newBudget) => {
    const t = newTasks  ?? store.load().tasks
    const c = newCals   ?? store.load().cals
    const b = newBudget ?? store.load().budget
    store.tasks(t); store.cals(c); store.budget(b)
    try { await withTimeout(driveWrite({ tasks: t, cals: c, budget: b }), 12000) }
    catch (e) { console.warn("Drive write:", e?.message) }
  }

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

      // Load latest state from Drive first (picks up changes from other devices).
      // Timeout-guarded so a stalled request can't freeze the sync.
      let driveData = null; let driveReadErr = null
      try { driveData = await withTimeout(driveRead(), 12000) }
      catch (driveErr) { console.warn("Drive read:", driveErr?.message); driveReadErr = driveErr?.message }
      const driveOk = !!driveData
      const localTasks = store.load().tasks
      // Merge: Drive is source of truth for status/prio/energy, but keep any
      // local tasks that Drive doesn't know about yet (e.g. first sync on new device)
      let base
      if (driveData?.tasks) {
        const driveIds = new Set(driveData.tasks.map(t => t.id))
        const localOnly = localTasks.filter(t => !driveIds.has(t.id))
        base = [...driveData.tasks, ...localOnly]
      } else {
        base = localTasks
      }
      const current = [...base]; let added = 0; let updated = 0

      // ±2 Wochen um heute
      const winStart = dPlus(getMon(new Date()), -14)
      const winEnd   = dPlus(getMon(new Date()),  21)

      for (const [lbl, id] of Object.entries(calMap)) {
        if (!id) continue
        const evs = await gEvents(id, winStart.toISOString(), winEnd.toISOString())
        if (!Array.isArray(evs)) continue
        for (const ev of evs) {
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

          const idx = current.findIndex(t => t.gcalId === ev.id)
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
      setAuthed(true)
      setTasks(current)
      await persist(current, calMap)
      const parts = [added > 0 && `${added} neu`, updated > 0 && `${updated} aktualisiert`].filter(Boolean)
      // Drive failed because scope was never granted → guide user to re-login
      const needsConsent = driveReadErr === "drive_forbidden"
      const driveMsg = driveOk ? "" : needsConsent
        ? " · Drive: bitte neu anmelden für Geräte-Sync"
        : ` · Drive: ${driveReadErr?.slice(0, 40) || "offline"}`
      if (needsConsent) localStorage.removeItem("poco-drive-ok")
      showToast(parts.length > 0 ? `${parts.join(", ")} ✓${driveMsg}` : `${current.length} Einträge · alles aktuell${driveMsg}`, driveOk ? 3000 : 8000)
    } catch (e) {
      console.error(e)
      showToast(e.message || "Sync-Fehler", 8000)
      if (e.message === "token_expired") setAuthed(false)
    } finally {
      setSyncing(false)
    }
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
    setTasks(updated); persist(updated)
    setModal(null); showToast(existing ? "Gespeichert ✓" : "Aufgabe erstellt ✓")
  }

  const handleDelete = async (id) => {
    const t = tasks.find(x => x.id === id)
    if (t?.gcalId && cals[t.label] && authed) {
      try { await gDel(cals[t.label], t.gcalId) } catch {}
    }
    const updated = tasks.filter(x => x.id !== id)
    setTasks(updated); persist(updated)
    setModal(null); showToast("Gelöscht")
  }

  const handleBudget = (v) => { setBudget(v); persist(null, null, v) }

  const handleToggleDone = (id) => {
    const updated = tasks.map(t => t.id === id ? { ...t, status: t.status === "done" ? "open" : "done" } : t)
    setTasks(updated); persist(updated)
  }

  return (
    <>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input[type=date]::-webkit-calendar-picker-indicator,
        input[type=time]::-webkit-calendar-picker-indicator { opacity: 0.4; cursor: pointer; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #D0D8EA; border-radius: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", background: T.bg, color: T.text, height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden", paddingBottom: isMobile ? "env(safe-area-inset-bottom)" : 0 }}>
        {/* Centered chrome: header, login banner, legend, energy bar */}
        <div style={{ maxWidth: isMobile ? "none" : 1400, width: "100%", margin: "0 auto", flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <Header view={view} setView={setView} date={date} setDate={setDate}
            onAdd={() => setModal({ task: view === "inbox" ? { date: "" } : {} })} syncing={syncing} onSync={doSync} />
          {!authed && (
            <button onClick={doLogin} style={{ margin: "8px 16px 0", padding: "10px 16px", borderRadius: 12, border: "1px solid rgba(37,99,235,0.25)", background: "rgba(37,99,235,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#2563EB", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              Mit Google anmelden & synchronisieren
            </button>
          )}
          {view !== "inbox" && <LabelLegend />}
          {view !== "inbox" && <EnergyBar tasks={tasks} date={date} budget={budget} onBudgetChange={handleBudget} />}
        </div>

        {/* Content area — list/inbox centered, calendar full width */}
        {view === "inbox" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, maxWidth: isMobile ? "none" : 680, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <InboxView tasks={tasks}
                onTaskClick={t => setModal({ task: t })}
                onAdd={partial => {
                  const t = { id: uid(), priority: "P3", energy: 0, status: "open", duration: 30, label: "Arbeit", time: nowT(), ...partial }
                  const updated = [...tasks, t]; setTasks(updated); store.tasks(updated)
                }} />
            </div>
          </div>
        )}
        {view === "day" && (
          <MultiDayView tasks={tasks} date={date} numDays={dayViewDays} dayWidth={dayViewDays > 1 ? Math.floor((calW - COL_W) / dayViewDays) : undefined}
            onTaskClick={t => setModal({ task: t })}
            onTimeClick={(t, d) => setModal({ task: { time: t, date: d ?? dKey(date) } })} />
        )}
        {view === "week" && (
          <WeekView tasks={tasks} date={date} dayWidth={isMobile ? undefined : weekDayW}
            onTaskClick={t => setModal({ task: t })}
            onTimeClick={(t, d) => setModal({ task: { time: t, date: d } })} />
        )}
        {view === "list" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, maxWidth: isMobile ? "none" : 680, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", overflow: "hidden" }}>
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

        <button
          onClick={() => setModal({ task: view === "inbox" ? { date: "" } : {} })}
          style={{
            position: "fixed", bottom: `calc(24px + env(safe-area-inset-bottom))`, right: isMobile ? 20 : 32,
            width: 56, height: 56, borderRadius: 28,
            border: "none", background: "#2563EB", color: "white",
            fontSize: 28, fontWeight: 300, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(37,99,235,0.45)",
            cursor: "pointer", zIndex: 100,
          }}>
          +
        </button>
      </div>
    </>
  )
}
