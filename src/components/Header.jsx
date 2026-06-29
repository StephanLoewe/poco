import { APP_VERSION, MON, WDAY } from "../lib/constants.js"
import { dKey, getMon, dPlus } from "../lib/helpers.js"

export function Header({ view, date, setDate, syncing, onSync }) {
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
    <div className="header">
      <div className="header-top">
        <div className="header-nav">
          {view !== "inbox" && (
            <button onClick={() => nav(-1)} className="header-nav-btn">‹</button>
          )}
          <div>
            <div className={`header-title ${(isToday && view !== "inbox" && view !== "list") ? "today" : ""}`}>{title}</div>
            {!isToday && view !== "inbox" && view !== "list" && (
              <button onClick={() => setDate(new Date())} className="header-today-btn">Heute</button>
            )}
          </div>
          {view !== "inbox" && (
            <button onClick={() => nav(1)} className="header-nav-btn">›</button>
          )}
        </div>
        <div className="header-actions">
          <span className="header-version">v{APP_VERSION}</span>
          <button onClick={onSync} disabled={syncing} title="Sync"
            className={`header-sync-btn ${syncing ? "spinning" : ""}`}>
            ↻
          </button>
        </div>
      </div>
    </div>
  )
}
