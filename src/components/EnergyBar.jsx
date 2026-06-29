import { T } from "../lib/constants.js"
import { dKey } from "../lib/helpers.js"

export function EnergyBar({ tasks, date, budget, onBudgetChange }) {
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
