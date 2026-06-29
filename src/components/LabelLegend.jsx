import { T, LABELS, LC } from "../lib/constants.js"

export function LabelLegend() {
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
