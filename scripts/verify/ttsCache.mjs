// Local TTS asset cache for the headless verification (CLAUDE.md §7.1 pt. 19,
// point 88): the Kokoro model (~90 MB), its tokenizer files and the ORT-WASM
// runtime are served from .cache/tts/ instead of the Hugging Face / jsdelivr
// CDNs on every run — repeated regressions once tripped HF's rate limit
// (HTTP 403) and failed voice.mjs on a healthy codebase.
//
// Record-and-replay: a MISS is fetched once (following redirects) and stored;
// once a fully successful voice run marks the cache complete, later runs are
// STRICT — no network request leaves the machine for these hosts, proving the
// regression CDN-independent. The player-facing path is untouched (browser
// cache + CDN streaming per CLAUDE.md §3).
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

export const CACHE_DIR = fileURLToPath(new URL('../../.cache/tts/', import.meta.url))
const COMPLETE_MARKER = join(CACHE_DIR, '.complete')

/** Hosts the cache owns. Everything else passes through untouched. */
const CACHED_HOSTS = [/(^|\.)huggingface\.co$/, /^cdn\.jsdelivr\.net$/]

/** The fp32 model is only probed and then abandoned for the quantized one on
 *  the WASM path — aborting it outright forces the fallback immediately and
 *  keeps ~330 MB out of the cache. */
const ABORTED_PATHS = [/\/onnx\/model\.onnx$/]

const keyFor = (url) => createHash('sha1').update(url.split('?')[0]).digest('hex')

export function ttsCacheComplete() {
  return existsSync(COMPLETE_MARKER)
}

export function markTtsCacheComplete() {
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(COMPLETE_MARKER, new Date().toISOString())
}

/** Local streaming server for the cached bodies: fulfilling ~90 MB straight
 *  through the DevTools protocol kills the browser process (base64-inflated
 *  message), so the route answers with a tiny 302 to 127.0.0.1 instead and
 *  Node streams the file with CORS headers. */
let serverPort = null
async function ensureServer() {
  if (serverPort) return serverPort
  const server = createServer((req, res) => {
    const key = (req.url ?? '/').slice(1).replace(/[^a-f0-9]/g, '')
    const bodyPath = join(CACHE_DIR, key + '.bin')
    const metaPath = join(CACHE_DIR, key + '.json')
    if (!key || !existsSync(bodyPath) || !existsSync(metaPath)) {
      res.writeHead(404, { 'access-control-allow-origin': '*' })
      return res.end()
    }
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
    res.writeHead(200, { 'content-type': meta.contentType, 'access-control-allow-origin': '*' })
    createReadStream(bodyPath).pipe(res)
  })
  server.unref()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  serverPort = server.address().port
  return serverPort
}

/**
 * Install the cache routes on a Playwright page. Returns a live stats object
 * ({ hits, misses, aborted, passedThrough }) the caller can assert on.
 */
export async function installTtsCache(page) {
  mkdirSync(CACHE_DIR, { recursive: true })
  const strict = ttsCacheComplete()
  const stats = { hits: 0, misses: 0, aborted: 0, strict }
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    let host
    try {
      host = new URL(url).hostname
    } catch {
      return route.continue()
    }
    if (!CACHED_HOSTS.some((re) => re.test(host))) return route.continue()
    if (ABORTED_PATHS.some((re) => re.test(url.split('?')[0]))) {
      stats.aborted++
      return route.abort()
    }
    const key = keyFor(url)
    const bodyPath = join(CACHE_DIR, `${key}.bin`)
    const metaPath = join(CACHE_DIR, `${key}.json`)
    if (existsSync(bodyPath) && existsSync(metaPath)) {
      stats.hits++
      const port = await ensureServer()
      return route.fulfill({ status: 302, headers: { location: `http://127.0.0.1:${port}/${key}` } })
    }
    if (strict) {
      // A complete cache must never need the network — surface the gap.
      stats.misses++
      return route.abort()
    }
    stats.misses++
    const res = await route.fetch()
    const body = await res.body()
    if (res.status() === 200) {
      writeFileSync(bodyPath, body)
      writeFileSync(metaPath, JSON.stringify({ url: url.split('?')[0], contentType: res.headers()['content-type'] ?? 'application/octet-stream' }))
    }
    if (res.status() === 200) {
      // Serve even the first (recording) hit via the local stream: fulfilling
      // huge bodies through the DevTools protocol kills the browser.
      const port = await ensureServer()
      return route.fulfill({ status: 302, headers: { location: `http://127.0.0.1:${port}/${key}` } })
    }
    return route.fulfill({ status: res.status(), contentType: res.headers()['content-type'] ?? 'application/octet-stream', body })
  })
  return stats
}
