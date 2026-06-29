import { useState, useRef } from "react"
import { T, LC, PC, DL } from "../lib/constants.js"
import { eAdd } from "../lib/helpers.js"

export function SwipeRow({ task, onClick, onToggleDone }) {
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

export function ListRow({ task, onClick, onToggleDone }) {
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
