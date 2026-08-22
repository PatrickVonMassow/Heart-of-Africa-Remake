#!/usr/bin/env node
// Generic spill-to-log runner used by the path-scope PreToolUse hook. The hook
// rewrites a named large producer to this command before the shell executes it;
// the producer's complete stdout/stderr goes to local/tool-output-logs, and
// only tool-output-budget-core's bounded digest reaches the session.
import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { budgetToolOutput } from './tool-output-budget-core.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT']

function decodeCommand(argv) {
  const at = argv.indexOf('--encoded-command')
  if (at < 0 || !argv[at + 1]) throw new Error('missing --encoded-command')
  return Buffer.from(argv[at + 1], 'base64url').toString('utf8')
}

function logPathFor() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
  return join(ROOT, 'local', 'tool-output-logs', `${stamp}-${process.pid}.log`)
}

function displayPath(path) {
  const rel = relative(ROOT, path)
  return rel && !rel.startsWith('..') ? rel.replace(/\\/g, '/') : path
}

function shellInvocation(command) {
  if (process.platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', command] }
  }
  return { file: process.env.SHELL || '/bin/bash', args: ['-lc', command] }
}

async function run() {
  const command = decodeCommand(process.argv.slice(2))
  const logPath = logPathFor()
  mkdirSync(dirname(logPath), { recursive: true })
  const log = createWriteStream(logPath, { flags: 'wx' })
  const invocation = shellInvocation(command)
  let captured = ''
  let settled = false

  const child = spawn(invocation.file, invocation.args, {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  })

  const consume = (chunk) => {
    const text = String(chunk)
    captured += text
    log.write(text)
  }
  child.stdout.on('data', consume)
  child.stderr.on('data', consume)

  for (const signal of FORWARDED_SIGNALS) {
    process.on(signal, () => {
      try {
        child.kill(signal)
      } catch {
        /* already finished */
      }
    })
  }

  const finish = (exitCode, extra = '') => {
    if (settled) return
    settled = true
    if (extra) {
      captured += `${captured && !captured.endsWith('\n') ? '\n' : ''}${extra}`
      log.write(`${extra}\n`)
    }
    log.end()
    const result = budgetToolOutput({
      text: captured,
      exitCode,
      logPath: displayPath(logPath),
      command,
    })
    // No appended newline: the budget is the absolute number of characters the
    // hook admits, not "the budget plus console.log's separator".
    process.stdout.write(result.text)
    process.exitCode = exitCode
  }

  child.on('close', (code, signal) => {
    const exitCode = code === null ? 1 : code
    finish(exitCode, signal ? `[command terminated by ${signal}]` : '')
  })
  child.on('error', (error) => finish(1, `ERROR: could not start command: ${error.message}`))
}

run().catch((error) => {
  // Even the runner's own failure channel is bounded and contains no raw,
  // input-dependent stack. There may be no log only when argv decoding failed.
  const result = budgetToolOutput({
    text: `ERROR: tool-output-budget failed: ${error?.message ?? String(error)}`,
    exitCode: 1,
    logPath: 'local/tool-output-logs (runner failed before capture)',
    command: 'tool-output-budget',
  })
  process.stdout.write(result.text)
  process.exitCode = 1
})
