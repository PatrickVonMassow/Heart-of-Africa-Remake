#!/usr/bin/env node
// Launch boundary for tool-output-budget.mjs. A budget worker which cannot be
// read or parsed has consumed no command output, so this boundary warns and
// runs the original command unchanged. Once the worker announces capture, the
// command must never be replayed: a missing completion is an attributed error.
import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shellInvocation } from './tool-output-shell.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_DEGRADATION_LOG = join(ROOT, 'local', 'tool-output-logs', 'budget-degradations.jsonl')
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT']

function flag(argv, name) {
  const at = argv.indexOf(name)
  return at >= 0 && argv[at + 1] ? argv[at + 1] : ''
}

function decodeCommand(argv) {
  const encoded = flag(argv, '--encoded-command')
  if (!encoded) throw new Error('missing --encoded-command')
  return Buffer.from(encoded, 'base64url').toString('utf8')
}

function displayPath(path) {
  const rel = relative(ROOT, path)
  return rel && !rel.startsWith('..') ? rel.replace(/\\/g, '/') : path
}

function recordDegradation(kind, reason, path) {
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), kind, reason, pid: process.pid })}\n`)
    const count = readFileSync(path, 'utf8').split('\n').filter(Boolean).length
    return `recorded as occurrence ${count} in ${displayPath(path)}`
  } catch (error) {
    return `degradation record unavailable: ${error?.message ?? String(error)}`
  }
}

function announce(kind, reason, logPath) {
  const recorded = recordDegradation(kind, reason, logPath)
  const action = kind === 'not-started'
    ? 'running the command without an output budget'
    : 'the command was not rerun and its output may be incomplete'
  process.stderr.write(`tool-output-budget ${kind === 'not-started' ? 'WARNING' : 'FAILURE'}: ${reason}; ${action}; ${recorded}.\n`)
}

function preflight(scriptPath) {
  try {
    const stat = statSync(scriptPath)
    if (!stat.isFile()) return `budget script is not a file: ${scriptPath}`
    // Root can read a mode-000 file, but a session launched as its ordinary
    // owner cannot. Treat the declared mode as part of readability too.
    if ((stat.mode & 0o444) === 0) return `budget script is unreadable: ${scriptPath}`
    readFileSync(scriptPath)
  } catch (error) {
    return `budget script cannot be read: ${error?.message ?? String(error)}`
  }
  const checked = spawnSync(process.execPath, ['--check', scriptPath], {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (checked.error) return `budget script cannot be checked: ${checked.error.message}`
  if (checked.status !== 0) {
    const detail = String(checked.stderr || checked.stdout).trim().split(/\r?\n/)[0]
    return `budget script has invalid syntax${detail ? ` (${detail})` : ''}: ${scriptPath}`
  }
  return ''
}

function childExitCode(code) {
  if (Number.isInteger(code)) return code
  // Keep a signalled child as the plain failure status the hook harness expects, not shell-style 128+n.
  return 1
}

function runOriginal(command) {
  return new Promise((resolveExit) => {
    const invocation = shellInvocation(command)
    const child = spawn(invocation.file, invocation.args, {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: 'inherit',
      env: process.env,
    })
    let settled = false
    child.on('error', (error) => {
      if (settled) return
      settled = true
      process.stderr.write(`tool-output-budget WARNING: the unbudgeted command could not be launched: ${error.message}\n`)
      resolveExit(1)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      resolveExit(childExitCode(code))
    })
    for (const signal of FORWARDED_SIGNALS) process.once(signal, () => child.kill(signal))
  })
}

async function run() {
  const argv = process.argv.slice(2)
  const command = decodeCommand(argv)
  const budgetScript = flag(argv, '--budget-script')
  if (!budgetScript) throw new Error('missing --budget-script')
  const degradationLog = flag(argv, '--degradation-log') || DEFAULT_DEGRADATION_LOG
  const unavailable = preflight(budgetScript)
  if (unavailable) {
    announce('not-started', unavailable, degradationLog)
    process.exitCode = await runOriginal(command)
    return
  }

  let started = false
  let completed = null
  let spawnError = null
  const worker = spawn(process.execPath, [budgetScript, '--encoded-command', flag(argv, '--encoded-command')], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: process.env,
  })
  worker.on('message', (message) => {
    if (message?.source !== 'tool-output-budget') return
    if (message.event === 'started') started = true
    if (message.event === 'completed' && Number.isInteger(message.exitCode)) completed = message.exitCode
  })
  worker.on('error', (error) => { spawnError = error })
  for (const signal of FORWARDED_SIGNALS) process.once(signal, () => worker.kill(signal))
  const outcome = await new Promise((resolveExit) => worker.on('close', (code, signal) => resolveExit({ code, signal })))

  if (!started) {
    const reason = spawnError
      ? `budget worker could not be launched: ${spawnError.message}`
      : `budget worker exited before capture began (exit ${outcome.code ?? outcome.signal ?? 'unknown'})`
    announce('not-started', reason, degradationLog)
    process.exitCode = await runOriginal(command)
    return
  }
  if (completed === null) {
    const reason = `budget worker died after capture began (exit ${outcome.code ?? outcome.signal ?? 'unknown'})`
    announce('after-start', reason, degradationLog)
    process.exitCode = childExitCode(outcome.code) || 1
    return
  }
  if (outcome.signal || outcome.code !== completed) {
    const reason = `budget worker reported command exit ${completed} but ended with ${outcome.code ?? outcome.signal ?? 'unknown'}`
    announce('after-start', reason, degradationLog)
    process.exitCode = childExitCode(outcome.code) || 1
    return
  }
  process.exitCode = completed
}

run().catch((error) => {
  process.stderr.write(`tool-output-budget FAILURE: launcher failed before it could establish a safe boundary: ${error?.message ?? String(error)}\n`)
  process.exitCode = 1
})
