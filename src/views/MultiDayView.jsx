import { useRef, useEffect } from "react"
import { T, HOUR_H, COL_W, LC, WDAY } from "../lib/constants.js"
import { dKey, pad, nowT, tPx } from "../lib/helpers.js"
import { HourGrid } from "../components/HourGrid.jsx"
import { NowLine } from "../components/NowLine.jsx"
import { TaskBlock } from "../components/TaskBlock.jsx"

export function MultiDayView({ tasks, date, numDays, dayWidth, onTaskClick, onTimeClick }) {
  const ref   = useRef()
  const today = dKey(new Date())
  const days  = Array.from({ length: numDays }, (_, i) => {
    const dt = new Date(date)
    dt.setDate(dt.getDate() + i)
    return dt
  })
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
