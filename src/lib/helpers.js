import { HOUR_H, EC } from "./constants.js"

// ─── Helpers ──────────────────────────────────────────────────
export const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
export const pad   = (n) => String(n).padStart(2, "0")
export const dKey  = (d) => { const dt = new Date(d); return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}` }
export const nowT  = () => { const n = new Date(); return `${pad(n.getHours())}:${pad(n.getMinutes())}` }
export const tPx   = (t) => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return (h + m / 60) * HOUR_H }
export const dPx   = (m) => Math.max(22, (m / 60) * HOUR_H)
export const eAdd  = (t, m) => { const [h, mn] = t.split(":").map(Number); const tot = h * 60 + mn + m; return `${pad(Math.floor(tot / 60) % 24)}:${pad(tot % 60)}` }
export const eCnf  = (v) => EC.find(e => e.v === v) || EC[1]
export const getMon= (d) => { const dt = new Date(d); dt.setHours(0,0,0,0); const dy = dt.getDay(); dt.setDate(dt.getDate() + (dy === 0 ? -6 : 1 - dy)); return dt }
export const dPlus = (d, n) => { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt }
export const TZ    = Intl.DateTimeFormat().resolvedOptions().timeZone

// Promise that rejects if it doesn't settle within ms — guards against
// blocked popups / stalled network that would otherwise hang sync forever.
export const withTimeout = (p, ms, label = "Timeout") =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms))])
