// The Stop hook judges the reply the user reads: the LAST assistant text block
// of the turn. Progress notes written between tool calls come first and carry
// no timestamp; judging them flagged every tool-using reply (18.09.2026).
import { afterEach, describe, it, expect } from 'vitest'
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'check-reply-timestamp.cjs')
const STAMPED = '**Freitag, 18.09.2026, 11:36** · Antwort'
const tempDirs = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function user(text) {
  return { type: 'user', message: { content: text } }
}
function toolResult() {
  return { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: '1', content: 'x' }] } }
}
function assistant(text, withTool = false) {
  const content = [{ type: 'text', text }]
  if (withTool) content.push({ type: 'tool_use', id: '1', name: 'Bash', input: {} })
  return { type: 'assistant', message: { content } }
}

function writeTranscript(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'reply-stamp-'))
  tempDirs.push(dir)
  const transcript = join(dir, 't.jsonl')
  writeFileSync(transcript, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  return transcript
}

function runPayload(input) {
  const res = spawnSync(process.execPath, [HOOK], {
    input,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5000,
  })
  expect(res.error).toBeUndefined()
  expect(res.status).toBe(0)
  expect(res.stderr).toBe('')
  return res.stdout.trim()
}

function runHook(entries, payload = {}) {
  return runPayload(JSON.stringify({ transcript_path: writeTranscript(entries), ...payload }))
}

function expectNudge(out) {
  expect(JSON.parse(out)).toEqual({ systemMessage: expect.stringContaining('Chat-Zeitstempel-Regel verletzt') })
}

describe('check-reply-timestamp hook', () => {
  it('stays silent when a progress note precedes a stamped final reply', () => {
    const out = runHook([user('frage'), assistant('Ich schaue kurz nach.', true), toolResult(), assistant(STAMPED)])
    expect(out).toBe('')
  })

  it('nudges when the final reply is unstamped, even after a stamped note', () => {
    const out = runHook([user('frage'), assistant(STAMPED, true), toolResult(), assistant('Ohne Stempel.')])
    expectNudge(out)
  })

  it('judges only the current turn', () => {
    const out = runHook([user('eins'), assistant('Ohne Stempel.'), user('zwei'), assistant(STAMPED)])
    expect(out).toBe('')
  })

  it('prefers stamped payload text over an unstamped transcript note', () => {
    expect(runHook([user('frage'), assistant('Ich schaue kurz nach.', true)], {
      last_assistant_message: `  ${STAMPED}\n`,
    })).toBe('')
  })

  it('nudges for unstamped payload text even when the transcript is stamped', () => {
    expectNudge(runHook([user('frage'), assistant(STAMPED)], {
      last_assistant_message: 'Ohne Stempel.',
    }))
  })

  it('judges payload text without needing a transcript path', () => {
    expect(runPayload(JSON.stringify({ last_assistant_message: STAMPED }))).toBe('')
    expectNudge(runPayload(JSON.stringify({ last_assistant_message: 'Ohne Stempel.' })))
  })

  it('treats a non-empty whitespace payload as an unstamped reply', () => {
    expectNudge(runHook([user('frage'), assistant(STAMPED)], { last_assistant_message: '  \n' }))
  })

  it.each(['', null, 42])('falls back to the transcript for payload text %j', (last_assistant_message) => {
    expectNudge(runHook([user('frage'), assistant('Ohne Stempel.')], { last_assistant_message }))
  })

  it('waits for a stamped final entry appended after 300 ms without payload text', async () => {
    const transcript = writeTranscript([user('frage'), assistant('Ich schaue kurz nach.', true), toolResult()])
    const child = spawn(process.execPath, [HOOK], { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk })
    const closed = new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('close', resolve)
    })
    const append = setTimeout(() => {
      appendFileSync(transcript, JSON.stringify(assistant(STAMPED)) + '\n')
    }, 300)
    const timeout = setTimeout(() => child.kill(), 4000)
    child.stdin.end(JSON.stringify({ transcript_path: transcript }))
    try {
      expect(await closed).toBe(0)
      expect(stderr).toBe('')
      expect(stdout).toBe('')
    } finally {
      clearTimeout(append)
      clearTimeout(timeout)
      if (child.exitCode === null) child.kill()
    }
  })

  it('stays silent when the current turn has no assistant text', () => {
    expect(runHook([user('eins'), assistant('Ohne Stempel.'), user('zwei')])).toBe('')
  })

  it.each(['{', 'null', '{}', '{"transcript_path":42}'])('fails soft for invalid or incomplete input %s', (input) => {
    expect(runPayload(input)).toBe('')
  })

  it('fails soft when the transcript cannot be read', () => {
    const transcript = writeTranscript([])
    rmSync(transcript)
    expect(runPayload(JSON.stringify({ transcript_path: transcript }))).toBe('')
  })
})
