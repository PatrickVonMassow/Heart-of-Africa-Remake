// Shared vite-server plumbing for the verification (extracted from run-all.mjs
// unchanged, point 294): the regression runner and the baseline classifier both
// need to start a dev server on a free port and kill its whole process tree
// afterwards, and one implementation of that is enough.
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'

const isWin = process.platform === 'win32'

/** An OS-assigned free ephemeral port. */
export function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

export function waitForServer(url, timeoutMs) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`server ${url} did not come up`))
        else setTimeout(tick, 400)
      })
    }
    tick()
  })
}

export function killTree(child) {
  if (!child || child.killed) return
  if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  else process.kill(-child.pid, 'SIGTERM')
}

/**
 * Start a vite server (`npm run dev` / `npm run preview`) on its OWN
 * OS-assigned free port and return { child, base }. The regression NEVER uses
 * the default :5173/:4173, so a developer can start, use and terminate a
 * manual `npm run dev` at any time without ever colliding with a test run.
 * `--strictPort` makes vite fail loudly rather than drift if the chosen port
 * were somehow taken in the tiny window before it binds; that (astronomically
 * rare) race is closed by one retry on a fresh port.
 */
export async function launchServer(npmScript, label, cwd) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const port = await getFreePort()
    const base = `http://localhost:${port}/`
    console.log(`# starting ${label} server (:${port})…`)
    const child = spawn(`${npmScript} -- --port ${port} --strictPort`, { windowsHide: true, cwd, shell: true, detached: !isWin, stdio: 'ignore' })
    try {
      await waitForServer(base, 60000)
      return { child, base }
    } catch (err) {
      killTree(child)
      if (attempt === 1) {
        console.log(`# ${label} server did not bind :${port} (port race?) — retrying on a fresh port`)
        continue
      }
      throw err
    }
  }
}
