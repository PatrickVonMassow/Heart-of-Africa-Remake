// The Stop hook judges the reply the user reads: the LAST assistant text block
// of the turn. Progress notes written between tool calls come first and carry
// no timestamp; judging them flagged every tool-using reply (18.09.2026).
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'check-reply-timestamp.cjs')
const STAMPED = '**Freitag, 18.09.2026, 11:36** · Antwort'

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

function runHook(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'reply-stamp-'))
  const transcript = join(dir, 't.jsonl')
  writeFileSync(transcript, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ transcript_path: transcript }),
    encoding: 'utf8',
    windowsHide: true,
  })
  return res.stdout.trim()
}

describe('check-reply-timestamp hook', () => {
  it('stays silent when a progress note precedes a stamped final reply', () => {
    const out = runHook([user('frage'), assistant('Ich schaue kurz nach.', true), toolResult(), assistant(STAMPED)])
    expect(out).toBe('')
  })

  it('nudges when the final reply is unstamped, even after a stamped note', () => {
    const out = runHook([user('frage'), assistant(STAMPED, true), toolResult(), assistant('Ohne Stempel.')])
    expect(out).toContain('Chat-Zeitstempel-Regel verletzt')
  })

  it('judges only the current turn', () => {
    const out = runHook([user('eins'), assistant('Ohne Stempel.'), user('zwei'), assistant(STAMPED)])
    expect(out).toBe('')
  })
})
