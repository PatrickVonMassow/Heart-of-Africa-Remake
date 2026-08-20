// Pins the refusal that the user demanded on 20.08.2026 after catching the
// state by hand: a reply that asks for a `/clear` while this session still
// claims the batch.
import { describe, expect, it } from 'vitest'
import { CLEAR_INVITATION, claimStands, evaluate, invitesClear, withdrawCommand } from './clear-claim-guard-core.mjs'

const SID = 'd5fcb9cf-2936-4743-9502-f504f08b8ac5'
const claim = (over = {}) => ({ claimantSid: SID, releasedAt: null, ...over })

describe('invitesClear — what counts as asking the user to end the session', () => {
  it('catches the shapes this project actually writes', () => {
    for (const text of [
      '**Donnerstag, 20.08.2026, 08:22**\n\nGesichert ist alles. Mach bitte `/clear`.',
      'Jetzt kann /clear kommen.',
      'Mach am besten einen clear, dann ist der Kontext frei.',
      'Bitte führe einen clear aus.',
      'Die neue Sitzung nimmt den Schnitt frisch auf, starte sie danach.',
      'Please start a fresh session for the rest.',
    ]) {
      expect(invitesClear(text), text).toBe(true)
    }
  })

  it('reads the natural word order too, not only the one the first draft had', () => {
    for (const text of [
      'Starte eine neue Sitzung, die den Rest aufnimmt.',
      'Beginne bitte eine frische Sitzung.',
      'Nimm den Rest in einer neuen Sitzung auf.',
    ]) {
      expect(invitesClear(text), text).toBe(true)
    }
  })

  it('does not read a NEGATED instruction as an invitation', () => {
    for (const text of [
      'Mach keinen Clear, ich brauche den Kontext noch.',
      'Starte jetzt keine neue Sitzung.',
      'Führe bitte nicht clear aus, bevor das gepusht ist.',
    ]) {
      expect(invitesClear(text), text).toBe(false)
    }
  })

  // Every case below is one the cross-vendor review found and the first two
  // drafts got wrong (20.08.2026). They are the reason the unit is the sentence.
  it('reads a negation wherever it stands in the sentence, not only inside the match', () => {
    for (const text of [
      'Mach keinen /clear.',
      'Führe einen Clear bitte nicht aus.',
      'Starte jetzt keine neue Sitzung.',
      'Mach nicht keinen Clear.',
    ]) {
      expect(invitesClear(text), text).toBe(false)
    }
  })

  it('judges each sentence, so a negated one cannot cover a real invitation after it', () => {
    expect(invitesClear('Mach keinen Clear. Danach mach bitte einen Clear.')).toBe(true)
    expect(invitesClear('Alles ist gepusht.\nStarte eine neue Sitzung.')).toBe(true)
  })

  it('needs an imperative, so a description of what happens next does not block', () => {
    for (const text of [
      'Die neue Sitzung startet automatisch.',
      'Die neue Sitzung nimmt den Rest auf.',
      'Der Launcher beginnt die neue Sitzung innerhalb seines Intervalls.',
    ]) {
      expect(invitesClear(text), text).toBe(false)
    }
  })

  // Round three of the cross-vendor review, 20.08.2026. Each case is one the
  // sentence-only draft got wrong, and together they are why negation is judged
  // per CLAUSE while the invitation is matched per SENTENCE.
  it('lets a negation in another clause stand, because it governs that clause', () => {
    expect(invitesClear('Der Kontext ist nicht mehr nötig, starte eine neue Sitzung.')).toBe(true)
    expect(invitesClear('Die neue Sitzung nimmt den Schnitt frisch auf, starte sie danach.')).toBe(true)
  })

  it('does not split an abbreviation, which would separate the verb from its object', () => {
    expect(invitesClear('Starte z. B. eine neue Sitzung.')).toBe(true)
  })

  it('lets a negated heading govern the list under it', () => {
    expect(invitesClear('Bitte nicht:\n- Starte eine neue Sitzung.')).toBe(false)
    expect(invitesClear('Als Nächstes:\n- Starte eine neue Sitzung.')).toBe(true)
  })

  it('reads the slash form as an instruction only where the clause asks for one', () => {
    expect(invitesClear('Der Befehl `/clear` leert den Kontext.')).toBe(false)
    expect(invitesClear('Jetzt kann /clear kommen.')).toBe(true)
    expect(invitesClear('Mach bitte `/clear`.')).toBe(true)
  })

  it('leaves out the forms that are also ordinary indicative, rather than guessing', () => {
    for (const text of [
      'Die neue Sitzung startet automatisch.',
      'Der Launcher beginnt die neue Sitzung innerhalb seines Intervalls.',
      'Du machst eine neue Sitzung auf.',
    ]) {
      expect(invitesClear(text), text).toBe(false)
    }
    expect(invitesClear('Starten Sie eine neue Sitzung.')).toBe(true)
  })

  it('does not fire on the word alone, so talking ABOUT the rule stays possible', () => {
    for (const text of [
      'Das Bild ist clear und der Horizont stimmt.',
      'Der Wächter blockt, wenn eine Antwort einen Clear anfordert und ein Anspruch offen ist.',
      'Der Anspruch wurde zurückgezogen, bevor der Kontext geleert wurde.',
      'A clear picture of the river bed.',
    ]) {
      expect(invitesClear(text), text).toBe(false)
    }
  })

  it('keeps every pattern anchored on an imperative or the slash spelling', () => {
    // The bare word must never be enough — that is what makes the guard cheap
    // to live with. A pattern matching plain "clear" would fail this.
    for (const pattern of CLEAR_INVITATION) {
      expect(pattern.test('clear'), String(pattern)).toBe(false)
    }
  })
})

describe('claimStands — whose claim, and does it still stand', () => {
  it('is this session\'s live claim only', () => {
    expect(claimStands({ claim: claim(), sessionId: SID })).toBe(true)
    expect(claimStands({ claim: claim({ claimantSid: 'someone-else' }), sessionId: SID })).toBe(false)
    expect(claimStands({ claim: claim({ releasedAt: 1787200000000 }), sessionId: SID })).toBe(false)
    // A withdrawn claim is a deleted file, which reaches the core as null.
    expect(claimStands({ claim: null, sessionId: SID })).toBe(false)
    expect(claimStands({ claim: claim(), sessionId: '' })).toBe(false)
  })

  it('reads the other spelling of the field, so a schema change cannot silently disarm it', () => {
    expect(claimStands({ claim: { sessionId: SID }, sessionId: SID })).toBe(true)
  })
})

describe('evaluate — only the one combination blocks', () => {
  const invitation = 'Alles gesichert. Mach bitte `/clear`.'

  it('blocks the invitation while the claim stands, and names the way out', () => {
    const verdict = evaluate({ lastText: invitation, claim: claim(), sessionId: SID })
    expect(verdict?.decision).toBe('block')
    expect(verdict?.reason).toContain(withdrawCommand(SID))
    // The second half of the real incident: something kept re-creating it.
    expect(verdict?.reason).toContain('Warteschleife')
  })

  it('allows every other combination', () => {
    expect(evaluate({ lastText: invitation, claim: null, sessionId: SID })).toBe(null)
    expect(evaluate({ lastText: invitation, claim: claim({ releasedAt: 1 }), sessionId: SID })).toBe(null)
    expect(evaluate({ lastText: 'Der Punkt ist gelandet.', claim: claim(), sessionId: SID })).toBe(null)
    expect(evaluate({ lastText: invitation, claim: claim({ claimantSid: 'other' }), sessionId: SID })).toBe(null)
    expect(evaluate({})).toBe(null)
  })
})

// The preflight gather is the half the pure core cannot cover: it does the I/O,
// and the drift check only asserts that it is REGISTERED, not what it answers.
// The cross-vendor review of 20.08.2026 asked for exactly these cases.
describe('gatherClearClaimCondition — what the preflight reports', () => {
  const withClaimPath = async (value, run) => {
    const before = process.env.BATCH_CLAIM_PATH
    if (value === null) delete process.env.BATCH_CLAIM_PATH
    else process.env.BATCH_CLAIM_PATH = value
    try {
      return await run()
    } finally {
      if (before === undefined) delete process.env.BATCH_CLAIM_PATH
      else process.env.BATCH_CLAIM_PATH = before
    }
  }

  it('reports NOT JUDGED when a claim stands but the session is unknown', async () => {
    const { gatherClearClaimCondition } = await import('./clear-claim-guard.mjs')
    const got = gatherClearClaimCondition({ sessionId: '', claim: claim() })
    expect(got.applicable).toBe(false)
    expect(got.cause).toBe('not-judged')
    expect(got.why).toMatch(/session id/i)
  })

  it('is not applicable when no claim stands at all', async () => {
    const { gatherClearClaimCondition } = await import('./clear-claim-guard.mjs')
    const got = gatherClearClaimCondition({ sessionId: SID, claim: null })
    expect(got.applicable).toBe(false)
    expect(got.cause).toBeUndefined()
  })

  it('is not applicable when the standing claim is another session’s', async () => {
    const { gatherClearClaimCondition } = await import('./clear-claim-guard.mjs')
    const got = gatherClearClaimCondition({ sessionId: 'someone-else', claim: claim() })
    expect(got.applicable).toBe(false)
    expect(got.why).toMatch(/another session/i)
  })

  it('states the condition, and names the withdraw command, on this session’s own claim', async () => {
    const { gatherClearClaimCondition } = await import('./clear-claim-guard.mjs')
    const got = gatherClearClaimCondition({ sessionId: SID, claim: claim() })
    expect(got.applicable).toBe(true)
    expect(got.condition).toBe(true)
    expect(got.why).toContain(withdrawCommand(SID))
  })

  it('reads BATCH_CLAIM_PATH when no claim is passed in, and the repo file otherwise', async () => {
    const { gatherClearClaimCondition } = await import('./clear-claim-guard.mjs')
    const { writeFileSync, mkdtempSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'claim-'))
    const file = join(dir, 'batch-claim.json')
    writeFileSync(file, JSON.stringify(claim()), 'utf8')
    await withClaimPath(file, () => {
      const got = gatherClearClaimCondition({ sessionId: SID })
      expect(got.applicable).toBe(true)
      expect(got.condition).toBe(true)
    })
    // An unreadable override is the ordinary "no claim" state, never a throw.
    await withClaimPath(join(dir, 'gone.json'), () => {
      expect(gatherClearClaimCondition({ sessionId: SID }).applicable).toBe(false)
    })
  })

  it('defaults to the repository’s own claim file, which is where the hook writes it', async () => {
    const { claimPath } = await import('./clear-claim-guard.mjs')
    const { repoPath } = await import('./repo-paths.mjs')
    await withClaimPath(null, () => {
      expect(claimPath()).toBe(repoPath('.claude/batch-claim.json'))
    })
    await withClaimPath('/tmp/elsewhere.json', () => {
      expect(claimPath()).toBe('/tmp/elsewhere.json')
    })
  })
})

// The hook's own I/O — stdin payload, transcript read, stdout verdict — which no
// test touched before the third cross-vendor round asked for it (20.08.2026).
describe('the hook itself, run as the entry script', () => {
  const run = async ({ payload, claimFile }) => {
    const { spawnSync } = await import('node:child_process')
    const { repoPath } = await import('./repo-paths.mjs')
    const script = repoPath('scripts/clear-claim-guard.mjs')
    const res = spawnSync(process.execPath, [script], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, BATCH_CLAIM_PATH: claimFile },
      windowsHide: true,
    })
    return { out: res.stdout.trim(), status: res.status }
  }

  const fixture = async (rows, claimBody) => {
    const { writeFileSync, mkdtempSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'claimhook-'))
    const transcript = join(dir, 'transcript.jsonl')
    const claimFile = join(dir, 'claim.json')
    writeFileSync(transcript, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
    writeFileSync(claimFile, JSON.stringify(claimBody), 'utf8')
    return { transcript, claimFile }
  }

  const assistantRow = (text, timestamp) => ({
    type: 'assistant',
    timestamp,
    message: { content: [{ type: 'text', text }] },
  })

  it('writes the block on stdout when the reply invites a clear under a live claim', async () => {
    const { transcript, claimFile } = await fixture(
      [assistantRow('Alles ist gepusht. Mach bitte `/clear`.', '2026-08-20T09:00:00.000Z')],
      { claimantSid: SID, at: Date.parse('2026-08-20T08:00:00.000Z') },
    )
    const { out } = await run({
      payload: { session_id: SID, transcript_path: transcript },
      claimFile,
    })
    expect(JSON.parse(out).decision).toBe('block')
  })

  it('says nothing when the reply carries no invitation', async () => {
    const { transcript, claimFile } = await fixture(
      [assistantRow('Alles ist gepusht. Ich arbeite weiter.', '2026-08-20T09:00:00.000Z')],
      { claimantSid: SID, at: Date.parse('2026-08-20T08:00:00.000Z') },
    )
    const { out } = await run({
      payload: { session_id: SID, transcript_path: transcript },
      claimFile,
    })
    expect(out).toBe('')
  })

  it('does not judge a reply written BEFORE the claim was taken', async () => {
    const { transcript, claimFile } = await fixture(
      [assistantRow('Mach bitte `/clear`.', '2026-08-20T08:00:00.000Z')],
      { claimantSid: SID, at: Date.parse('2026-08-20T09:00:00.000Z') },
    )
    const { out } = await run({
      payload: { session_id: SID, transcript_path: transcript },
      claimFile,
    })
    expect(out).toBe('')
  })

  it('stays silent, and does not fail, on an unreadable payload or a missing claim', async () => {
    const { transcript, claimFile } = await fixture(
      [assistantRow('Mach bitte `/clear`.', '2026-08-20T09:00:00.000Z')],
      { claimantSid: 'someone-else', at: Date.parse('2026-08-20T08:00:00.000Z') },
    )
    const other = await run({
      payload: { session_id: SID, transcript_path: transcript },
      claimFile,
    })
    expect(other.out).toBe('')
    expect(other.status).toBe(0)
  })
})
