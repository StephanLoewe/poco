import { withTimeout } from "./helpers.js"

// ─── Google OAuth (GIS token model) ───────────────────────────
let _tokenClient = null
let _accessToken = null

const SCOPES = "https://www.googleapis.com/auth/calendar"

function getTokenClient() {
  if (_tokenClient) return _tokenClient
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: () => {},
  })
  return _tokenClient
}

// Waits for the GIS script to finish loading (it has async attribute).
function waitForGoogle(timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return }
    const start = Date.now()
    const id = setInterval(() => {
      if (window.google?.accounts?.oauth2) { clearInterval(id); resolve() }
      else if (Date.now() - start > timeout) { clearInterval(id); reject(new Error("GIS not loaded")) }
    }, 100)
  })
}

// Acquire an OAuth token. The ONLY place that opens the GIS flow.
// prompt: "" = silent (reuse existing session), "consent" = force dialog.
// Silent calls are timeout-guarded so a non-firing callback can't hang.
export function acquireToken(prompt) {
  return waitForGoogle().then(() => {
    const p = new Promise((resolve, reject) => {
      const client = getTokenClient()
      client.callback = (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return }
        _accessToken = resp.access_token
        resolve(resp)
      }
      client.requestAccessToken({ prompt })
    })
    // Don't timeout the consent dialog — the user needs time to interact.
    return prompt === "consent" ? p : withTimeout(p, 10000, "auth_timeout")
  })
}

// Pure API wrapper: uses the already-acquired token, never opens a popup.
// Throws "not_authed" if there is no token yet (caller should log in first).
export async function withAuth(fn) {
  await waitForGoogle()
  if (!_accessToken) throw new Error("not_authed")
  return fn()
}

// Get current access token (for direct calApi calls)
export function getAccessToken() {
  return _accessToken
}

// Set access token (used by doLogin callback)
export function setAccessToken(token) {
  _accessToken = token
}

// Clear access token (used on 401 responses)
export function clearAccessToken() {
  _accessToken = null
}

// Check if GIS is loaded
export function isGoogleLoaded() {
  return !!window.google?.accounts?.oauth2
}

// Get token client for direct use in doLogin (user gesture required)
export { getTokenClient }
