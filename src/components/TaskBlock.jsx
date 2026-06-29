import { LC } from "../lib/constants.js"
import { tPx, dPx } from "../lib/helpers.js"

export function TaskBlock({ task, onClick }) {
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
        fontSize: tiny ? 9 : 11, fontWeight: 700, color: "white",
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
