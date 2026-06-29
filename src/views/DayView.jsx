import { MultiDayView } from "./MultiDayView.jsx"

export function DayView({ tasks, date, onTaskClick, onTimeClick }) {
  return <MultiDayView tasks={tasks} date={date} numDays={1} onTaskClick={onTaskClick} onTimeClick={onTimeClick} />
}
