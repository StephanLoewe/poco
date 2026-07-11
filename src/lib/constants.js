// ─── Design tokens ─────────────────────────────────────────────
// Values reference CSS custom properties from tokens.css,
// which mirrors the Figma variable collections exactly.
export const T = {
  bg:      "var(--color-bg)",
  surface: "var(--color-surface)",
  border:  "var(--color-border)",
  subtle:  "var(--color-subtle)",
  text:    "var(--color-text-primary)",
  muted:   "var(--color-text-muted)",
  dim:     "var(--color-text-dim)",
}

// ─── Constants ────────────────────────────────────────────────
export const HOUR_H = 60
export const COL_W  = 46

export const LABELS = ["Arbeit", "Soziales", "Fun", "Tasks"]
export const LC = {
  Arbeit:   { solid: "var(--label-arbeit-solid)",   solidDark: "var(--label-arbeit-dark)",   pastel: "var(--label-arbeit-pastel)",   pastelText: "var(--label-arbeit-text)",   pastelBrd: "var(--label-arbeit-border)"   },
  Soziales: { solid: "var(--label-soziales-solid)", solidDark: "var(--label-soziales-dark)", pastel: "var(--label-soziales-pastel)", pastelText: "var(--label-soziales-text)", pastelBrd: "var(--label-soziales-border)" },
  Fun:      { solid: "var(--label-fun-solid)",      solidDark: "var(--label-fun-dark)",      pastel: "var(--label-fun-pastel)",      pastelText: "var(--label-fun-text)",      pastelBrd: "var(--label-fun-border)"      },
  Tasks:    { solid: "var(--label-tasks-solid)",    solidDark: "var(--label-tasks-dark)",    pastel: "var(--label-tasks-pastel)",    pastelText: "var(--label-tasks-text)",    pastelBrd: "var(--label-tasks-border)"    },
}
// Backwards-compat shim: old code used lc.c / lc.bg / lc.brd
Object.values(LC).forEach(lc => { lc.c = lc.pastelText; lc.bg = lc.pastel; lc.brd = lc.pastelBrd })

export const PC = {
  P1: { l: "Kritisch", c: "#EF4444" },
  P2: { l: "Hoch",     c: "#F97316" },
  P3: { l: "Normal",   c: "#EAB308" },
  P4: { l: "Niedrig",  c: "#94A3B8" },
}
export const EC = [
  { v: -1, icon: "⚡", l: "Gibt Energie",     c: "#059669" },
  { v:  0, icon: "·",  l: "Neutral",           c: "#94A3B8" },
  { v:  1, icon: "▸",  l: "Leicht",            c: "#CA8A04" },
  { v:  2, icon: "▸▸", l: "Anstrengend",       c: "#EA580C" },
  { v:  3, icon: "▸▸▸",l: "Sehr anstrengend",  c: "#DC2626" },
]
export const APP_VERSION = "2.25"
export const DURS = [2, 15, 30, 45, 60, 90, 120, 150, 180, 240]
export const DL   = { 2:"2min", 15:"15min", 30:"30min", 45:"45min", 60:"1h", 90:"1.5h", 120:"2h", 150:"2.5h", 180:"3h", 240:"4h" }
export const WDAY = ["So","Mo","Di","Mi","Do","Fr","Sa"]
export const MON  = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"]
