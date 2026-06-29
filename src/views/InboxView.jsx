import { useState } from "react"
import { T } from "../lib/constants.js"
import { nowT } from "../lib/helpers.js"
import { SwipeRow } from "../components/SwipeRow.jsx"

export function InboxView({ tasks, onTaskClick, onAdd, onToggleDone }) {
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
