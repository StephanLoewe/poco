import { getMon } from "../lib/helpers.js"
import { MultiDayView } from "./MultiDayView.jsx"

export function WeekView({ tasks, date, dayWidth, onTaskClick, onTimeClick }) {
  const mon = getMon(date)
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowX: dayWidth ? "hidden" : "auto", overflowY: "hidden" }}>
        <MultiDayView tasks={tasks} date={mon} numDays={7} dayWidth={dayWidth || 110} onTaskClick={onTaskClick} onTimeClick={onTimeClick} />
      </div>
    </div>
  )
}
