import { withTimeout } from "./helpers.js"

// ─── Storage (localStorage) ───────────────────────────────────
export const store = {
  load() {
    try {
      return {
        tasks:  JSON.parse(localStorage.getItem("sf-tasks")  || "null") ?? [],
        cals:   JSON.parse(localStorage.getItem("sf-cals")   || "null") ?? {},
        budget: JSON.parse(localStorage.getItem("sf-budget") || "null") ?? 8,
      }
    } catch { return { tasks: [], cals: {}, budget: 8 } }
  },
  tasks:  (v) => { try { localStorage.setItem("sf-tasks",  JSON.stringify(v)) } catch {} },
  cals:   (v) => { try { localStorage.setItem("sf-cals",   JSON.stringify(v)) } catch {} },
  budget: (v) => { try { localStorage.setItem("sf-budget", JSON.stringify(v)) } catch {} },
}

// ─── Backend sync (Netlify Function + Blobs) ──────────────────
// One small JSON document holds the whole app state, shared across devices.
// Auth is a single shared secret (POCO_SECRET on Netlify), entered once per
// device and stored in localStorage. No OAuth/popups for data — Google is
// used only for the (read-only) calendar import.
const API_URL = "/api/data"
export const apiSecret = () => localStorage.getItem("poco-secret") || ""

export async function apiRead() {
  const r = await fetch(API_URL, { headers: { Authorization: `Bearer ${apiSecret()}` } })
  if (r.status === 401) throw new Error("api_unauthorized")
  if (!r.ok) throw new Error(`API ${r.status}`)
  return r.json()
}

export async function apiWrite(data) {
  const r = await fetch(API_URL, {
    method: "PUT",
    headers: { Authorization: `Bearer ${apiSecret()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ version: 1, ...data }),
  })
  if (r.status === 401) throw new Error("api_unauthorized")
  if (!r.ok) throw new Error(`API ${r.status}`)
  return r.json()
}

// Persist to both localStorage (fast/offline) and the backend (cross-device).
// localStorage write is synchronous and always succeeds; the backend is
// best-effort with a timeout so a stalled request can never freeze the UI.
export async function persist(tasks, cals, budget) {
  const t = tasks  ?? store.load().tasks
  const c = cals   ?? store.load().cals
  const b = budget ?? store.load().budget
  store.tasks(t); store.cals(c); store.budget(b)
  if (!apiSecret()) return
  try { await withTimeout(apiWrite({ tasks: t, cals: c, budget: b }), 12000) }
  catch (e) {
    console.warn("Backend write:", e?.message)
    if (e.message === "api_unauthorized") return { unauthorized: true }
  }
  return { unauthorized: false }
}
