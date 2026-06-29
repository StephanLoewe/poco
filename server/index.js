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

if (isProd) {
  const distPath = join(__dirname, "../dist")
  app.use(express.static(distPath))
  app.get("*", (_, res) => res.sendFile(join(distPath, "index.html")))
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
