import express from "express"
import cors from "cors"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import "dotenv/config"

const __dirname = dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === "production"

const app  = express()
const PORT = process.env.PORT || 3001

if (!isProd) {
  app.use(cors({ origin: "http://localhost:5173" }))
}
app.use(express.json())

app.post("/api/gcal", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" })

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta":    "mcp-client-2025-04-04",
      },
      body: JSON.stringify(req.body),
    })
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (err) {
    console.error("Proxy error:", err)
    res.status(502).json({ error: "Upstream request failed" })
  }
})

if (isProd) {
  const distPath = join(__dirname, "../dist")
  app.use(express.static(distPath))
  app.get("*", (_, res) => res.sendFile(join(distPath, "index.html")))
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
