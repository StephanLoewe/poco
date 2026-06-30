import { useState, useEffect, useRef, useCallback } from "react"
import "./tokens.css"
import { T, HOUR_H, COL_W, LABELS, LC, PC, EC, APP_VERSION, DURS, DL, WDAY, MON } from "./lib/constants.js"
import { uid, pad, dKey, nowT, tPx, dPx, eAdd, eCnf, getMon, dPlus, withTimeout } from "./lib/helpers.js"
import { acquireToken, getTokenClient, setAccessToken, gCals, gEvents, gCreate, gUpdate, gDel } from "./lib/googleApi.js"

function useWidth() {
  const [w, setW] = useState(window.innerWidth)
  useEffect(() => {
    const fn = () => setW(window.innerWidth)
    window.addEventListener("resize", fn)
    return () => window.removeEventListener("resize", fn)
  }, [])
  return w
}


// ─── Backend sync (Netlify Function + Blobs) ──────────────────
// One small JSON document holds the whole app state, shared across devices.
// Auth is a single shared secret (POCO_SECRET on Netlify), entered once per
// device and stored in localStorage. No OAuth/popups for data — Google is
// used only for the (read-only) calendar import.
const API_URL = "/api/data"
const apiSecret = () => localStorage.getItem("poco-secret") || ""

async function apiRead() {
  const r = await fetch(API_URL, { headers: { Authorization: `Bearer ${apiSecret()}` } })
  if (r.status === 401) throw new Error("api_unauthorized")
  if (!r.ok) throw new Error(`API ${r.status}`)
  return r.json()
}

async function apiWrite(data) {
  const r = await fetch(API_URL, {
    method: "PUT",
    headers: { Authorization: `Bearer ${apiSecret()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ version: 1, ...data }),
  })
  if (r.status === 401) throw new Error("api_unauthorized")
  if (!r.ok) throw new Error(`API ${r.status}`)
  return r.json()
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

  const [dragY, setDragY] = useState(0)
  const dragStart = useRef(null)
  const isDragging = useRef(false)
  const DISMISS_THRESHOLD = 80

  const onHandleTouchStart = (e) => {
    dragStart.current = e.touches[0].clientY
    isDragging.current = true
  }
  const onHandleTouchMove = (e) => {
    if (!isDragging.current) return
    const dy = e.touches[0].clientY - dragStart.current
    if (dy > 0) {
      e.preventDefault()
      setDragY(dy)
    }
  }
  const onHandleTouchEnd = () => {
    isDragging.current = false
    if (dragY > DISMISS_THRESHOLD) {
      onClose()
    } else {
      setDragY(0)
    }
  }

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
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: "22px 22px 0 0", width: "100%", maxWidth: 430, padding: "20px 20px 44px", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.12)", transform: `translateY(${dragY}px)`, transition: isDragging.current ? "none" : "transform 0.25s cubic-bezier(0.32,0.72,0,1)" }}>
        <div
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          style={{ width: "100%", padding: "12px 0", cursor: "grab", touchAction: "none", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}
        >
          <div style={{ width: 36, height: 4, background: T.dim, borderRadius: 2 }} />
        </div>

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

  return (
    <div onClick={onClick} style={{
      position: "absolute", top, left: 3, right: 3, height: ht, minHeight: 24,
      background: lc.solid,
      borderRadius: 7,
      borderTop: `2px solid rgba(255,255,255,0.25)`,
      padding: tiny ? "2px 6px" : "5px 7px",
      cursor: "pointer", overflow: "hidden", boxSizing: "border-box",
      opacity: done ? 0.4 : 1, transition: "opacity 0.15s",
      display: "flex", flexDirection: "column",
      alignItems: "flex-start", justifyContent: tiny ? "center" : "flex-start",
      boxShadow: done ? "none" : "0 2px 8px rgba(0,0,0,0.15)",
    }}>
      <span style={{
        fontSize: tiny ? 9 : 11, fontWeight: 500, color: "white",
        overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
        width: "100%", textDecoration: done ? "line-through" : "none",
        lineHeight: 1.3,
      }}>
        {task.title}
      </span>
      {!tiny && ht >= 44 && (
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", marginTop: 1, lineHeight: 1.2 }}>
          {task.time}
        </span>
      )}
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
  const ref        = useRef()
  const headerRef  = useRef()
  const allDayRef  = useRef()
  const today = dKey(new Date())
  const days  = Array.from({ length: numDays }, (_, i) => dPlus(date, i))
  const hasAllDay = days.some(d => tasks.some(t => t.date === dKey(d) && t.allDay))

  useEffect(() => {
    const isToday = days.some(d => dKey(d) === today)
    if (ref.current) ref.current.scrollTop = isToday ? Math.max(0, tPx(nowT()) - 100) : tPx("07:30")
  }, [dKey(date)])

  const syncHeaders = () => {
    const sl = ref.current?.scrollLeft || 0
    if (headerRef.current)  headerRef.current.scrollLeft  = sl
    if (allDayRef.current)  allDayRef.current.scrollLeft  = sl
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Day header row */}
      <div style={{ display: "flex", background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ width: COL_W, flexShrink: 0 }} />
        <div ref={headerRef} style={{ flex: 1, overflowX: "hidden", display: "flex" }}>
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
      </div>

      {/* All-day strip */}
      {hasAllDay && (
        <div style={{ display: "flex", background: T.subtle, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ width: COL_W, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>
            <span style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Ganztag</span>
          </div>
          <div ref={allDayRef} style={{ flex: 1, overflowX: "hidden", display: "flex" }}>
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
        </div>
      )}

      {/* Timeline */}
      <div ref={ref} onScroll={syncHeaders} style={{ flex: 1, overflowY: "auto", display: "flex" }}>
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

            {(open.length > 0 || done.length > 0) && (
              <div className="list-group" style={{ background: T.surface, borderRadius: 12, padding: "0 14px", border: `1px solid ${T.border}` }}>
                {open.map(t => <SwipeRow key={t.id} task={t} onClick={() => onTaskClick(t)} onToggleDone={() => onToggleDone(t.id)} />)}
                {done.map(t => <SwipeRow key={t.id} task={t} onClick={() => onTaskClick(t)} onToggleDone={() => onToggleDone(t.id)} />)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── SwipeRow ─────────────────────────────────────────────────
function SwipeRow({ task, onClick, onToggleDone }) {
  const ref      = useRef()
  const startX   = useRef(null)
  const curX     = useRef(0)
  const [offset, setOffset] = useState(0)
  const [swiped, setSwiped] = useState(false)
  const THRESHOLD = 72

  const onTouchStart = (e) => {
    startX.current = e.touches[0].clientX
    curX.current = 0
    setSwiped(false)
  }
  const onTouchMove = (e) => {
    const dx = e.touches[0].clientX - startX.current
    if (dx < 0) return // only right-to-left
    curX.current = dx
    setOffset(Math.min(dx, THRESHOLD + 16))
  }
  const onTouchEnd = () => {
    if (curX.current >= THRESHOLD) {
      setSwiped(true)
      setOffset(THRESHOLD)
      setTimeout(() => { onToggleDone(); setOffset(0); setSwiped(false) }, 300)
    } else {
      setOffset(0)
    }
  }

  const done = task.status === "done"
  const lc   = LC[task.label] || LC.Arbeit

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      {/* Background action hint — only rendered while swiping */}
      {offset > 0 && (
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: offset, display: "flex", alignItems: "center", paddingLeft: 16,
          background: done ? "var(--label-fun-pastel)" : lc.solid,
          transition: "none", overflow: "hidden",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ opacity: Math.min(1, offset / THRESHOLD) }}>
            <path d={done ? "M19 6l-10 10-4-4" : "M5 12l5 5L19 7"} stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      {/* Row content */}
      <div
        ref={ref}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${offset}px)`, transition: offset === 0 ? "transform 0.2s" : "none" }}
      >
        <ListRow task={task} onClick={onClick} onToggleDone={onToggleDone} />
      </div>
    </div>
  )
}

function ListRow({ task, onClick, onToggleDone }) {
  const lc   = LC[task.label] || LC.Arbeit
  const pr   = PC[task.priority]
  const done = task.status === "done"
  const endTime = task.time ? eAdd(task.time, task.duration) : null

  const meta = [
    task.time && endTime && `${task.time} · ${endTime}`,
    DL[task.duration],
    task.label,
  ].filter(Boolean)

  return (
    <div onClick={onClick} style={{
      padding: "10px 0",
      borderBottom: `1px solid ${T.border}`,
      cursor: "pointer", display: "flex", alignItems: "center", gap: 14,
      opacity: done ? 0.5 : 1, transition: "opacity 0.15s",
    }}>
      {/* Circular checkbox */}
      <div
        onClick={e => { e.stopPropagation(); onToggleDone() }}
        style={{
          width: 18, height: 18, borderRadius: 1000, flexShrink: 0,
          border: `1.5px solid ${done ? lc.pastelText : T.dim}`,
          background: done ? lc.pastelText : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s",
        }}
      >
        {done && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: done ? T.dim : T.text,
          textDecoration: done ? "line-through" : "none",
          overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
        }}>
          {task.title}
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 3, display: "flex", alignItems: "center", gap: 0 }}>
          {meta.map((item, i) => (
            <span key={i}>
              {i > 0 && <span style={{ color: T.dim, margin: "0 4px" }}>·</span>}
              <span style={item === task.label ? { color: lc.pastelText, fontWeight: 500 } : {}}>
                {item}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Priority badge */}
      <span style={{ fontSize: 10, fontWeight: 700, color: T.dim, flexShrink: 0 }}>
        {task.priority}
      </span>
    </div>
  )
}

// ─── InboxView ────────────────────────────────────────────────
function InboxView({ tasks, onTaskClick, onAdd, onToggleDone }) {
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

      <div style={{ padding: "14px 16px 32px" }}>
        {inboxTasks.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📥</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.muted }}>Inbox ist leer</div>
            <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>Erfasse Aufgaben oben — Datum später zuordnen</div>
          </div>
        )}

        {(open.length > 0 || done.length > 0) && (
          <div className="list-group" style={{ background: T.surface, borderRadius: 12, padding: "0 14px", border: `1px solid ${T.border}` }}>
            {open.map(t => (
              <SwipeRow key={t.id} task={t} onClick={() => onTaskClick(t)} onToggleDone={() => onToggleDone(t.id)} />
            ))}
            {done.length > 0 && open.length > 0 && (
              <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 0 4px" }}>Erledigt</div>
            )}
            {done.map(t => (
              <SwipeRow key={t.id} task={t} onClick={() => onTaskClick(t)} onToggleDone={() => onToggleDone(t.id)} />
            ))}
          </div>
        )}
      </div>
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
function Header({ view, date, setDate, syncing, onSync }) {
  const isToday = dKey(date) === dKey(new Date())

  const nav = (dir) => {
    const dt = new Date(date)
    view === "day" ? dt.setDate(dt.getDate() + dir) : dt.setDate(dt.getDate() + dir * 7)
    setDate(dt)
  }

  const title = view === "inbox" ? "Inbox"
    : view === "list" ? (() => { const m = getMon(date); const s = dPlus(m, 6); return `${m.getDate()}. – ${s.getDate()}. ${MON[s.getMonth()]}` })()
    : view === "day" ? date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })
    : (() => { const m = getMon(date); const s = dPlus(m, 6); return `${m.getDate()}. ${MON[m.getMonth()]} – ${s.getDate()}. ${MON[s.getMonth()]}` })()

  return (
    <div style={{ padding: "max(14px, env(safe-area-inset-top)) 16px 12px", background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {view !== "inbox" && (
            <button onClick={() => nav(-1)} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 22, padding: "0 4px", lineHeight: 1, display: "flex", alignItems: "center" }}>‹</button>
          )}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: (isToday && view !== "inbox" && view !== "list") ? "#2563EB" : T.text, letterSpacing: "-0.01em" }}>{title}</div>
            {!isToday && view !== "inbox" && view !== "list" && (
              <button onClick={() => setDate(new Date())} style={{ fontSize: 11, color: "#2563EB", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, marginTop: 1 }}>Heute</button>
            )}
          </div>
          {view !== "inbox" && (
            <button onClick={() => nav(1)} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 22, padding: "0 4px", lineHeight: 1, display: "flex", alignItems: "center" }}>›</button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: T.dim }}>v{APP_VERSION}</span>
          <button onClick={onSync} disabled={syncing} title="Sync"
            style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, color: syncing ? "#2563EB" : T.muted, cursor: syncing ? "default" : "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", animation: syncing ? "spin 1s linear infinite" : "none" }}>
            ↻
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── TabBar ───────────────────────────────────────────────────
const TAB_ICONS = {
  inbox: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>
    </svg>
  ),
  list: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  day: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      <line x1="8" y1="14" x2="8" y2="18"/>
    </svg>
  ),
  week: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      <line x1="7" y1="14" x2="7" y2="18"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="17" y1="14" x2="17" y2="18"/>
    </svg>
  ),
}
const TAB_LABELS = { inbox: "Inbox", list: "Liste", day: "Tag", week: "Woche" }
const TABS = ["inbox", "list", "day", "week"]

function TabBar({ view, setView, onAdd }) {
  const activeIdx = TABS.indexOf(view)

  return (
    <div style={{
      position: "fixed",
      bottom: "calc(16px + env(safe-area-inset-bottom))",
      left: "50%", transform: "translateX(-50%)",
      zIndex: 90,
      background: "rgba(255,255,255,0.82)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderRadius: 32,
      border: "1px solid rgba(255,255,255,0.6)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.8) inset",
      padding: "6px",
      display: "flex", alignItems: "center", gap: 2,
    }}>
      {/* Sliding blob */}
      {activeIdx >= 0 && (
        <div style={{
          position: "absolute",
          top: 6, bottom: 6,
          left: `calc(6px + ${activeIdx} * (100% - 60px) / 4)`,
          width: "calc((100% - 60px) / 4)",
          background: "rgba(37,99,235,0.12)",
          borderRadius: 26,
          transition: "left 0.28s cubic-bezier(0.34,1.56,0.64,1)",
          pointerEvents: "none",
        }} />
      )}

      {TABS.map(v => {
        const active = view === v
        return (
          <button key={v} onClick={() => setView(v)} style={{
            position: "relative", border: "none", background: "transparent",
            cursor: "pointer", padding: "8px 14px", borderRadius: 26,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            color: active ? "#2563EB" : "var(--color-text-muted)",
            transition: "color 0.2s", minWidth: 60,
          }}>
            {TAB_ICONS[v]}
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, fontFamily: "inherit" }}>
              {TAB_LABELS[v]}
            </span>
          </button>
        )
      })}

      {/* + button rechts */}
      <button onClick={onAdd} style={{
        border: "none", cursor: "pointer",
        width: 44, height: 44, borderRadius: 22, flexShrink: 0,
        background: "#2563EB", color: "white",
        fontSize: 24, fontWeight: 300, lineHeight: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 12px rgba(37,99,235,0.4)",
        margin: "0 2px 0 4px",
      }}>
        +
      </button>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────
function Toast({ msg }) {
  if (!msg) return null
  return (
    <div style={{ position: "fixed", bottom: "calc(72px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", background: T.text, borderRadius: 20, padding: "8px 18px", fontSize: 12, color: "white", zIndex: 200, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}>
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

  // Persist to both localStorage (fast/offline) and the backend (cross-device).
  // localStorage write is synchronous and always succeeds; the backend is
  // best-effort with a timeout so a stalled request can never freeze the UI.
  const persist = async (newTasks, newCals, newBudget) => {
    const t = newTasks  ?? store.load().tasks
    const c = newCals   ?? store.load().cals
    const b = newBudget ?? store.load().budget
    store.tasks(t); store.cals(c); store.budget(b)
    if (!apiSecret()) return
    try { await withTimeout(apiWrite({ tasks: t, cals: c, budget: b }), 12000) }
    catch (e) { console.warn("Backend write:", e?.message); if (e.message === "api_unauthorized") setNeedsSecret(true) }
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
      let current = [...base]; let added = 0; let updated = 0

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

      setAuthed(true)
      setTasks(current)
      await persist(current, calMap)
      const parts = [added > 0 && `${added} neu`, updated > 0 && `${updated} aktualisiert`].filter(Boolean)
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
    <>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input[type=date]::-webkit-calendar-picker-indicator,
        input[type=time]::-webkit-calendar-picker-indicator { opacity: 0.4; cursor: pointer; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #D0D8EA; border-radius: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .list-group > div:last-child { border-bottom: none; }
      `}</style>
      <div style={{ fontFamily: "system-ui, sans-serif", background: T.bg, color: T.text, height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {/* Centered chrome: header, login banner, legend, energy bar */}
        <div style={{ maxWidth: isMobile ? "none" : 1400, width: "100%", margin: "0 auto", flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <Header view={view} date={date} setDate={setDate} syncing={syncing} onSync={doSync} />
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
          {needsSecret && (
            <button onClick={handleSetSecret} style={{ margin: "8px 16px 0", padding: "10px 16px", borderRadius: 12, border: "1px solid rgba(234,88,12,0.3)", background: "rgba(234,88,12,0.08)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#EA580C", flexShrink: 0 }}>
              🔑 Sync-Passwort eingeben
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
                onToggleDone={handleToggleDone}
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

        <TabBar view={view} setView={setView}
          onAdd={() => setModal({ task: view === "inbox" ? { date: "" } : {} })} />
      </div>
    </>
  )
}
