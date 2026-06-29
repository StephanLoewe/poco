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

export function TabBar({ view, setView, onAdd }) {
  const activeIdx = TABS.indexOf(view)

  return (
    <div className="tab-bar">
      {/* Sliding blob */}
      {activeIdx >= 0 && (
        <div className="tab-blob" style={{ left: `calc(6px + ${activeIdx} * (100% - 60px) / 4)` }} />
      )}

      {TABS.map(v => {
        const active = view === v
        return (
          <button key={v} onClick={() => setView(v)} className={`tab-btn ${active ? "active" : ""}`}>
            {TAB_ICONS[v]}
            <span className="tab-btn-label">
              {TAB_LABELS[v]}
            </span>
          </button>
        )
      })}

      {/* + button rechts */}
      <button onClick={onAdd} className="tab-add-btn">
        +
      </button>
    </div>
  )
}
