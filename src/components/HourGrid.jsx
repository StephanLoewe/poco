import { T, HOUR_H } from "../lib/constants.js"

export function HourGrid() {
  return <>
    {Array.from({ length: 24 }, (_, h) => (
      <div key={h} style={{ position: "absolute", top: h * HOUR_H, left: 0, right: 0, height: HOUR_H, borderTop: `1px solid ${h ? T.border : "transparent"}` }} />
    ))}
  </>
}
