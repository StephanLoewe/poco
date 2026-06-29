import { useState } from "react"
import { LABELS, LC } from "../lib/constants.js"

export function CalendarMapModal({ googleCals, onSave, onSkip }) {
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
    <div onClick={onSkip} className="modal-overlay">
      <div onClick={e => e.stopPropagation()} className="modal-content">
        <div className="modal-handle" />
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
