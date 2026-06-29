import { getStore } from "@netlify/blobs"

// Single-user JSON sync store. Auth via a shared secret (POCO_SECRET env var).
// GET  /api/data        → returns the stored JSON (or null)
// PUT  /api/data {json} → overwrites the stored JSON
export default async (req) => {
  const secret = process.env.POCO_SECRET
  const auth = req.headers.get("authorization") || ""
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const store = getStore("poco")

  if (req.method === "GET") {
    const data = await store.get("data", { type: "json" })
    return Response.json(data ?? null)
  }

  if (req.method === "PUT" || req.method === "POST") {
    const body = await req.text()
    await store.set("data", body)
    return Response.json({ ok: true })
  }

  return new Response("Method not allowed", { status: 405 })
}

export const config = { path: "/api/data" }
