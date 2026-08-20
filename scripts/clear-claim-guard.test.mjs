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
