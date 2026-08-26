// THE RECORD COMMAND'S OWN SURFACE (point 437 H).
//
// Every unrecognised flag used to fall through to the record path with an empty
// sha, so `--status` — which this tool does not have, but three of its siblings
// do — answered `fatal: ambiguous argument '^{commit}'` from deep inside git
// instead of naming what it wants. Hit while preparing a merge on 31.07.2026.
//
// The spawned cases are all READ-ONLY: `--list` reads the tracked ledger and the
// refusals exit before any write, so this suite can run against the real
// checkout without touching it.
import { afterEach, describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  appendRecord,
  buildRecord,
  gitToplevel,
  KNOWN_FLAGS,
  readRecords,
  recordsPathFor,
  resolveCommit,
  junkSpelling,
  reverifyReviewerAgreement,
  reviewerVendorProblems,
  reviewFileSetKey,
  usage,
  verifyHalfAuthors,
} from './mechanism-review.mjs'
import { LEDGER_RELATIVE_PATH, MODES, VERDICTS } from './mechanism-review-core.mjs'
import { writeState as writeFableState } from './fable-switch-core.mjs'

const SCRIPT = resolve(process.cwd(), 'scripts', 'mechanism-review.mjs')
const FABLE_FILES = ['fable-switch.mjs', 'fable-switch-core.mjs', 'atomic-write.mjs', 'git-tracked.mjs']
const installFableSwitch = (repo, state = 'on') => {
  for (const file of FABLE_FILES) copyFileSync(resolve(process.cwd(), 'scripts', file), join(repo, 'scripts', file))
  mkdirSync(join(repo, '.claude'), { recursive: true })
  writeFileSync(
    join(repo, '.claude', 'fable-switch.json'),
    JSON.stringify(writeFableState(state, { why: 'test switch decision', by: 'test', now: 1 })),
  )
}
const run = (...args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    windowsHide: true,
    encoding: 'utf8',
    cwd: process.cwd(),
    input: '',
  })

// THE HALVES ARE ADOPTED ONLY FROM COMMITTED BYTES: `committedHalfModel` reads
// HEAD and refuses an absolute path outright, so a temp fixture can never satisfy
// it. These cases are about the MERGER CHECK, not about git, so they hand the
// production seam a stub that answers for the fixture's own model — exactly what
// a committed half would say. The untracked case below passes no stub, so the
// trailer proxy still stands where the halves are caller-written.
const committedFixture = (path) => {
  const bytes = readFileSync(path)
  const model = JSON.parse(bytes.toString('utf8'))?.model
  if (typeof model !== 'string' || !model.trim()) return null
  return { oid: createHash('sha1').update(bytes).digest('hex'), model: model.trim() }
}

/** Fixture stand-ins for the committed-artefact readers: the "committed" oid is
 *  the file's own hash and the blob text is the file's own bytes, so the
 *  recorder's blob recount folds exactly what the fixtures wrote. */
const committedOidFixture = (path) => createHash('sha1').update(readFileSync(path)).digest('hex')
const hashFileFixture = committedOidFixture
const blobTextFixture = (...paths) => {
  const byOid = {}
  for (const p of paths) {
    const bytes = readFileSync(p)
    byOid[createHash('sha1').update(bytes).digest('hex')] = bytes.toString('utf8')
  }
  return (oid) => byOid[oid] ?? null
}

describe('the flag surface', () => {
  it('knows every flag its usage documents', () => {
    const flags = [
      '--record', '--model', '--verdict', '--evidence', '--point', '--mode', '--framing',
      '--author-framing', '--spec-examination',
      '--pass', '--pass-files', '--carried-from', '--list',
    ]
    for (const flag of flags) {
      expect(KNOWN_FLAGS.has(flag), `${flag} must be accepted`).toBe(true)
    }
  })

  it('states the record form, the list form and where --status actually lives', () => {
    const text = usage()
    expect(text).toContain('--record <sha>')
    expect(text).toContain('--list')
    for (const v of VERDICTS) expect(text).toContain(v)
    // The flag that started this: the tool has no --status, and saying so is
    // the difference between a usage block and a git error.
    expect(text).toContain('mechanism-review-guard.mjs --status')
    expect(text).toContain('criticality-review-guard.mjs --status')
  })

  it('states the per-file convergence boundary', () => {
    expect(usage()).toContain('later commit to')
    expect(usage()).toContain('commit touching only other')
  })
})

describe('a junk spelling is judged by the PLATFORM separators', () => {
  it('flags dot segments and duplicate separators, and leaves POSIX backslash names alone', () => {
    expect(junkSpelling('docs//half.json')).toBe(true)
    expect(junkSpelling('docs/./half.json')).toBe(true)
    expect(junkSpelling('docs/../half.json')).toBe(true)
    expect(junkSpelling('docs/half.json')).toBe(false)
    expect(junkSpelling('/abs/inside/half.json')).toBe(false)
    if (process.platform !== 'win32') {
      // A backslash is a legal filename byte on POSIX, not a separator.
      expect(junkSpelling('docs/back\\slash.json')).toBe(false)
    }
  })
})

describe('the reviewer-vendor matrix binds evidence to the credited model', () => {
  it('refuses a claim naming NO model, whatever the credit says', () => {
    // A hand-edited source row of bare {status} used to pass the vendor test on
    // the credit alone and be copied forward by a carry (re-review round 10).
    expect(reviewerVendorProblems('Claude Opus 5', { status: 'agreement' }).join(' ')).toMatch(/names no claimedModel/)
    expect(reviewerVendorProblems('GPT-5.6 Sol', { status: 'unverified', reason: 'external' }).join(' ')).toMatch(/names no claimedModel/)
  })

  it('refuses evidence about a DIFFERENT model than the credited one', () => {
    expect(
      reviewerVendorProblems('Claude Opus 5', { status: 'agreement', claimedModel: 'Claude Fable 5', actualModel: 'Claude Fable 5' }).join(' '),
    ).toMatch(/evidence for one model proves nothing about another/)
    expect(junkSpelling('docs/half.json')).toBe(false)
  })

  it('accepts exactly what each vendor can prove', () => {
    expect(
      reviewerVendorProblems('Claude Opus 5', {
        status: 'agreement',
        claimedModel: 'Claude Opus 5',
        actualModel: 'Claude Opus 5',
        transcript: '/home/node/.claude/projects/x/session.jsonl',
        artefactAt: 1_787_600_000_000,
        messageId: 'msg_01',
      }),
    ).toEqual([])
    // …and an agreement with nothing to audit — no transcript, time or message
    // id — is a hand-forged pair, not evidence (confirming pass, round 13).
    expect(
      reviewerVendorProblems('Claude Opus 5', { status: 'agreement', claimedModel: 'Claude Opus 5', actualModel: 'Claude Opus 5' }).join(' '),
    ).toMatch(/nothing to audit/)
    // …and the artefact time must BE a time — a truthy non-number anchors nothing.
    for (const artefactAt of ['', false, {}, 'yesterday', 0, [1], '1787600000000']) {
      expect(
        reviewerVendorProblems('Claude Opus 5', {
          status: 'agreement',
          claimedModel: 'Claude Opus 5',
          actualModel: 'Claude Opus 5',
          transcript: '/x/session.jsonl',
          artefactAt,
          messageId: 'msg_01',
        }).join(' '),
        JSON.stringify(artefactAt),
      ).toMatch(/nothing to audit/)
    }
    expect(
      reviewerVendorProblems('GPT-5.6 Sol', { status: 'unverified', claimedModel: 'GPT-5.6 Sol', reason: 'external CLI reviewer' }),
    ).toEqual([])
  })
})

describe('a recorded reviewer AGREEMENT is re-checked against its transcript', () => {
  // The two model strings in a ledger row are hand-editable; the transcript is
  // the evidence they quote (cross-vendor re-review of point 889). While it
  // still exists it is re-read; a contradiction downgrades the row to the
  // refusal it earns. An expired transcript keeps the recorded reading — the
  // ledger outlives the transcripts, and rotting old reviews into refusals
  // would punish age, not forgery.
  const row = (over = {}) => ({
    reviewerAuthorship: {
      status: 'agreement',
      claimedModel: 'Claude Opus 5',
      actualModel: 'Claude Opus 5',
      artefactAt: 1_787_588_200_000,
      transcript: '/tmp/somewhere/session.jsonl',
      ...over,
    },
  })

  it('downgrades an agreement the transcript now contradicts', () => {
    const check = () => ({ status: 'disagreement', actualModel: 'claude-haiku-4-5', reason: 'the claimed author disagrees with message.model' })
    const out = reverifyReviewerAgreement(row(), { check })
    expect(out.status).toBe('disagreement')
    expect(out.actualModel).toBe('claude-haiku-4-5')
  })

  it('keeps a recorded agreement whose transcript has expired', () => {
    const check = () => ({ status: 'unverified', reason: 'the session transcript is missing or unreadable' })
    expect(reverifyReviewerAgreement(row(), { check }).status).toBe('agreement')
  })

  it('touches nothing without a transcript path or below agreement', () => {
    const check = () => {
      throw new Error('must not be called')
    }
    expect(reverifyReviewerAgreement(row({ transcript: undefined }), { check }).status).toBe('agreement')
    expect(reverifyReviewerAgreement(row({ status: 'unverified' }), { check }).status).toBe('unverified')
  })
})

describe('a ledger row\'s half-authorship claim is re-derived, never believed', () => {
  // Cross-vendor review of point 889: verification read the model field of
  // whatever JSON stands at the recorded path today. That answers "some committed
  // file here names this model" — not "these are the halves that were folded". A
  // hand-written row could name unrelated files whose model fields happen to
  // match, and a row that was once true stayed "verified" after the halves at
  // those paths were replaced. The recorded blob oids are what bind it.
  const row = {
    sha: 'f'.repeat(40),
    halfAuthors: ['Claude Opus 5', 'GPT-5.6 Sol'],
    halfSources: ['docs/a.json', 'docs/b.json'],
    halfBlobs: ['aaaa1', 'bbbb2'],
    unionSource: 'docs/u.json',
    unionBlob: 'uuuu3',
    mergedBy: 'Fable 5',
    accounting: '1 A + 1 B entries → 1 union entries (2 of the 2 input entries merged, 0 only A, 0 only B): every input entry accounted for',
  }
  const blobs = {
    'docs/a.json': { oid: 'aaaa1', model: 'Claude Opus 5' },
    'docs/b.json': { oid: 'bbbb2', model: 'GPT-5.6 Sol' },
  }
  // The committed bytes behind those oids — what the fold is recomputed from.
  const texts = {
    aaaa1: JSON.stringify({ model: 'Claude Opus 5', entries: [{ id: 'A1', file: 'x.ts', defect: 'the defect' }] }),
    bbbb2: JSON.stringify({ model: 'GPT-5.6 Sol', entries: [{ id: 'B1', file: 'x.ts', defect: 'the defect restated' }] }),
    uuuu3: JSON.stringify({ mergedBy: 'Fable 5', entries: [{ id: 'U1', from: ['A1', 'B1'], defect: 'the defect' }] }),
  }
  const deps = (over = {}) => ({
    isTracked: () => true,
    committedHalf: (src) => blobs[src] ?? null,
    blobText: (oid) => texts[oid] ?? null,
    committedOidOf: (src) => (src === 'docs/u.json' ? 'uuuu3' : ''),
    ...over,
  })

  it('confirms a row whose paths still carry the exact blobs it counted', () => {
    expect(verifyHalfAuthors(row, deps())).toBe(true)
  })

  it('refuses a row whose path now carries a DIFFERENT blob, model field notwithstanding', () => {
    const replaced = { ...blobs, 'docs/b.json': { oid: 'cccc3', model: 'GPT-5.6 Sol' } }
    expect(verifyHalfAuthors(row, deps({ committedHalf: (src) => replaced[src] ?? null }))).toBe(false)
  })

  it('refuses a row that names no blobs at all — two strings are not evidence', () => {
    const { halfBlobs: _halfBlobs, ...withoutBlobs } = row
    expect(verifyHalfAuthors(withoutBlobs, deps())).toBe(false)
    expect(verifyHalfAuthors({ ...row, halfBlobs: ['aaaa1'] }, deps())).toBe(false)
  })

  it('re-performs the fold from the committed bytes, so the receipt is bound to them', () => {
    // A row whose recorded accounting the recomputation does not reproduce is a
    // claim about a fold that did not happen over these blobs.
    expect(verifyHalfAuthors({ ...row, accounting: '2 A + 1 B entries → 2 union entries (2 of the 3 input entries merged, 1 only A, 0 only B): every input entry accounted for' }, deps())).toBe(false)
    // A union blob whose mergedBy contradicts the row's is someone else's fold.
    const forged = { ...texts, uuuu3: JSON.stringify({ mergedBy: 'GPT-5.6 Sol', entries: [{ id: 'U1', from: ['A1', 'B1'], defect: 'the defect' }] }) }
    expect(verifyHalfAuthors(row, deps({ blobText: (oid) => forged[oid] ?? null }))).toBe(false)
    // No union binding at all — nothing to recompute from — is not verified.
    const { unionBlob: _unionBlob, ...withoutUnion } = row
    expect(verifyHalfAuthors(withoutUnion, deps())).toBe(false)
    // An absent blob (repository without the object) cannot confirm anything.
    expect(verifyHalfAuthors(row, deps({ blobText: () => null }))).toBe(false)
    // An oid that exists in the object store but is NOT the blob HEAD carries
    // at the recorded union path is not repository provenance.
    expect(verifyHalfAuthors(row, deps({ committedOidOf: () => 'other0' }))).toBe(false)
    const { unionSource: _unionSource, ...withoutUnionPath } = row
    expect(verifyHalfAuthors(withoutUnionPath, deps())).toBe(false)
    // A union whose committed bytes name no merger corroborates no fold owner.
    const unowned = { ...texts, uuuu3: JSON.stringify({ entries: [{ id: 'U1', from: ['A1', 'B1'], defect: 'the defect' }] }) }
    expect(verifyHalfAuthors(row, deps({ blobText: (oid) => unowned[oid] ?? null }))).toBe(false)
  })

  it('still refuses a source absent from the row-sha tree or a contradicted model', () => {
    // The anchor is the row's own commit: a source its tree does not carry is
    // nothing — a working-tree condition would instead rot true historical rows.
    expect(verifyHalfAuthors(row, deps({ committedHalf: (src) => (src === 'docs/b.json' ? null : blobs[src]) }))).toBe(false)
    const renamed = { ...blobs, 'docs/a.json': { oid: 'aaaa1', model: 'Fable 5' } }
    expect(verifyHalfAuthors(row, deps({ committedHalf: (src) => renamed[src] ?? null }))).toBe(false)
  })
})

describe('review pass file-set identity', () => {
  it('is injective where a newline-joined key collides', () => {
    const left = ['a\nb', 'c']
    const right = ['a', 'b\nc']
    expect([...left].sort().join('\n')).toBe([...right].sort().join('\n'))
    expect(reviewFileSetKey(left)).not.toBe(reviewFileSetKey(right))
    expect(reviewFileSetKey(left)).toBe(reviewFileSetKey([...left].reverse()))
  })
})

describe('an unrecognised flag', () => {
  it('prints the usage and exits non-zero — never a git error', () => {
    const r = run('--status')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('unknown flag --status')
    expect(r.stderr).toContain('--record <sha>')
    expect(r.stderr).not.toMatch(/ambiguous argument/)
  })

  it('names every unknown flag at once, not just the first', () => {
    const r = run('--frobnicate', '--wibble')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('--frobnicate')
    expect(r.stderr).toContain('--wibble')
  })

  it('writes nothing to stdout — a refusal is not a report', () => {
    expect(run('--status').stdout.trim()).toBe('')
  })
})

describe('the paths that must stay untouched', () => {
  it('--list still lists the ledger', () => {
    const r = run('--list')
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).not.toContain('unknown flag')
  })

  it('a bare invocation still lists the ledger', () => {
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).not.toContain('unknown flag')
  })

  it('a well-formed --record is never mistaken for an unknown flag', () => {
    // The sha is deliberately nonsense, so nothing is ever appended: what is
    // asserted is only that the recognised flags reached the record path.
    const r = run('--record', 'not-a-commit', '--model', 'Fable 5', '--verdict', 'merge', '--evidence', 'x')
    // THE ORDER MATTERS (point 573). `not.toContain` is satisfied by the EMPTY
    // output of a script that never started, and so is a non-zero exit — this
    // case would have stayed green with the CLI deleted. What it must establish
    // first is that the tool ran at all, and only git's own complaint about the
    // nonsense sha proves that.
    expect(r.stderr).toMatch(/not-a-commit|ambiguous argument|unknown revision|fatal:/)
    expect(r.status).not.toBe(0)
    expect(r.stderr).not.toContain('unknown flag')
  })
})

// THE FLAG THAT WAS DROPPED (point 540). `--point 298` was handed to a CLI that
// did not know it; nothing warned, and the criticality gate later refused the
// tick for a point whose verdict was in the ledger all along.
describe('a misspelled or abbreviated flag', () => {
  it('is REPORTED with the flag it was meant to be, never silently ignored', () => {
    const r = run('--record', 'HEAD', '--poin', '298')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('unknown flag --poin')
    expect(r.stderr).toContain('did you mean --point')
  })

  it('refuses the --flag=value form rather than reading it as a different flag', () => {
    const r = run('--record', 'HEAD', '--point=298')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('--point <value>')
  })

  it('refuses a stray argument, and writes nothing while doing so', () => {
    const r = run('--record', 'HEAD', 'leftover')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('leftover')
    expect(r.stdout.trim()).toBe('')
  })
})

describe('a run that omits a REQUIRED flag', () => {
  // The one path that must read exactly as it always did: the usage block, not
  // a git error from deep inside resolveCommit.
  it('prints the existing usage line unchanged, and never a git error', () => {
    const r = run('--record', 'HEAD', '--model', 'Fable 5')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain(usage())
    expect(r.stderr).toContain('--verdict')
    expect(r.stderr).toContain('--evidence')
    expect(r.stderr).not.toMatch(/ambiguous argument|fatal:/)
  })

  it('answers a missing --record with the usage too, not with a git failure', () => {
    const r = run('--model', 'Fable 5', '--verdict', 'merge', '--evidence', 'a whole honest line here')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain(usage())
    expect(r.stderr).toContain('--record <sha>')
    expect(r.stderr).not.toMatch(/ambiguous argument|fatal:/)
  })
})

// THE FOUR-EYES MODE, END TO END (point 541). buildRecord + appendRecord +
// readRecords are exercised against a TEMP ledger: the round trip is the claim
// (the mode reaches the file and comes back), and the tracked ledger stays
// untouched.
describe('the mode round-trips into the ledger', () => {
  const stub = (over = {}) => ({
    sha: 'b'.repeat(40),
    subject: 'sharpen a guard',
    authoredBy: 'Claude Opus 5 <noreply@anthropic.com>',
    ...over,
  })
  const build = (over = {}) =>
    buildRecord({
      sha: 'b'.repeat(40),
      model: 'GPT-5.6 Sol',
      verdict: 'merge',
      evidence: 'read the core against the spec and ran the pure cases',
      now: 1_700_000_000_000,
      // The stub ANSWERS THE REF IT WAS ASKED (not a fixed sha): the recorder
      // resolves every contribution boundary through the same resolver, and a
      // stub blind to its argument would hide a boundary resolved to the wrong
      // commit.
      resolve: (ref) => stub({ sha: String(ref) }),
      ...over,
    })

  const withLedger = (fn) => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-review-'))
    try {
      return fn(join(dir, 'ledger.jsonl'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  /** A blind-parallel record also names the third model that folded the two
   *  lists AND carries the count of that union (point 634); a review has neither. */
  const ACCOUNTED =
    // The numbers ADD UP — the receipt is checked, not just shaped: 4 + 3 inputs,
    // each one merged or standing alone, 2 folds plus 3 singles = 5 union entries.
    '4 A + 3 B entries → 5 union entries (4 merged, 2 only A, 1 only B): every input entry accounted for'
  const merged = { mergedBy: 'Fable 5', accounting: ACCOUNTED }
  const forMode = (mode) => (mode === 'blind-parallel' ? { mode, ...merged } : { mode })

  it('writes the mode and reads it back, for both modes', () => {
    for (const mode of MODES) {
      const built = build(forMode(mode))
      expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
      expect(built.record.mode).toBe(mode)
      withLedger((path) => {
        appendRecord(built.record, path)
        const back = readRecords(path)
        expect(back).toHaveLength(1)
        expect(back[0].mode).toBe(mode)
        expect(back[0].verdict).toBe('merge')
      })
    }
  })

  it('round-trips an end-state file pass', () => {
    const head = 'b'.repeat(40)
    const built = build({
      mode: 'review',
      pass: '1/2',
      passFiles: 'scripts/shared-guard.mjs',
      sha: head,
    })
    expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
    expect(built.record.pass).toEqual({
      index: 1,
      total: 2,
      files: ['scripts/shared-guard.mjs'],
      endState: head,
    })
    expect(built.record.partialReview).toBe(true)
  })

  it('round-trips a bounded one-pass file scope at the reviewed sha', () => {
    const head = 'b'.repeat(40)
    const built = build({
      mode: 'review',
      pass: '1/1',
      passFiles: 'scripts/scoped-guard.mjs',
      sha: head,
    })
    expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
    expect(built.record.pass).toEqual({
      index: 1,
      total: 1,
      files: ['scripts/scoped-guard.mjs'],
      endState: head,
    })
    expect(built.record.partialReview).toBe(true)
  })

  it('refuses the removed contribution-boundary flag at the command surface', () => {
    const result = run('--record', 'b'.repeat(40), '--pass-commits', 'a'.repeat(40))
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('unknown flag --pass-commits')
  })

  it('carries the same-model fallback framing through with a blind-parallel mode', () => {
    const framing = 'the second run was framed as a maintainer inheriting the code'
    const built = build({ mode: 'blind-parallel', framing, ...merged })
    expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
    withLedger((path) => {
      appendRecord(built.record, path)
      expect(readRecords(path)[0].framing).toBe(framing)
    })
  })

  it('carries the MERGING model and the COUNT into the ledger, fallback beside them', () => {
    const built = build({ mode: 'blind-parallel', ...merged })
    expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
    withLedger((path) => {
      appendRecord(built.record, path)
      const back = readRecords(path)[0]
      expect(back.mergedBy).toBe('Fable 5')
      expect(back.accounting).toBe(ACCOUNTED)
      expect(back.mergeFallback).toBeUndefined()
    })
    const two = build({
      mode: 'blind-parallel',
      ...merged,
      mergedBy: 'GPT-5.6 Sol',
      mergeFallback: 'Fable 5 was unreachable, so only two models were in this session',
    })
    expect(two.ok, (two.errors ?? []).join('\n')).toBe(true)
    expect(two.record.mergeFallback).toMatch(/only two models/)
  })

  it('refuses a blind-parallel record with no merger, no count, or a merger that wrote a list', () => {
    expect(build({ mode: 'blind-parallel' }).ok).toBe(false)
    expect(build({ mode: 'blind-parallel', mergedBy: 'Fable 5' }).ok).toBe(false)
    const own = build({ mode: 'blind-parallel', ...merged, mergedBy: 'GPT-5.6 Sol' })
    expect(own.ok).toBe(false)
    expect(own.errors.join('\n')).toMatch(/may not merge them/i)
  })

  it('says the halves were not read when a merge refusal rests on the trailer proxy', () => {
    // MEASURED 22.08.2026: a fold by the model that wrote neither half was refused,
    // and the message argued about the merger's identity without ever saying where
    // that identity came from — the recording commit, because a valid fold IS a
    // commit by the third model. The refusal now names what it read and the one
    // flag triple that replaces the proxy with the halves themselves.
    const refused = build({ mode: 'blind-parallel', ...merged, mergedBy: 'GPT-5.6 Sol' })
    expect(refused.ok).toBe(false)
    const text = refused.errors.join('\n')
    expect(text).toMatch(/the two halves were NOT read/)
    expect(text).toMatch(/--union <U\.json> --list-a <A> --list-b <B>/)
  })

  it('does not blame the proxy where the halves themselves were read', () => {
    // The counterpart: with tracked halves handed over, a refusal is about the
    // halves, so the proxy hint would be a false explanation. It stays absent.
    const dir = mkdtempSync(join(tmpdir(), 'hoa-proxy-'))
    try {
      const w = (name, value) => {
        const path = join(dir, name)
        writeFileSync(path, JSON.stringify(value))
        return path
      }
      const listA = w('A.json', { model: 'Fable 5', entries: [{ id: 'A1', file: 'x.ts', defect: 'the first defect' }] })
      const listB = w('B.json', { model: 'GPT-5.6 Sol', entries: [{ id: 'B1', file: 'x.ts', defect: 'the first' }] })
      const union = w('U.json', {
        mergedBy: 'Fable 5',
        entries: [{ id: 'U1', from: ['A1', 'B1'], defect: 'the first defect, both said it' }],
      })
      const selfMerged = build({
        mode: 'blind-parallel',
        mergedBy: 'Fable 5',
        unionPath: union,
        listAPath: listA,
        listBPath: listB,
        isTracked: () => true,
        committedHalf: committedFixture,
        committedUnion: committedOidFixture,
        blobText: blobTextFixture(listA, listB, union),
        hashFile: hashFileFixture,
      })
      expect(selfMerged.ok).toBe(false)
      const text = (selfMerged.errors ?? []).join('\n')
      expect(text).toMatch(/authored one of the two lists \(Fable 5\)/)
      expect(text).not.toMatch(/the two halves were NOT read/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('COUNTS the union itself when handed the files, instead of believing a line', () => {
    // A typed receipt is a claim; given the three files the recorder measures it
    // (four-eyes review, third round).
    const dir = mkdtempSync(join(tmpdir(), 'hoa-union-'))
    try {
      const w = (name, value) => {
        const path = join(dir, name)
        writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
        return path
      }
      // The halves name their authors, so the merger is checked against THEM: Fable
      // wrote A and Sol wrote B, which leaves Claude as the one model that wrote
      // neither. This fixture used to say A was Opus 5's and let Sol merge its own
      // half B — the recorder could not see that, because it read the commit
      // trailers instead of the halves.
      const listA = w('A.json', {
        model: 'Fable 5',
        entries: [
          { id: 'A1', file: 'x.ts', defect: 'the first defect' },
          { id: 'A2', file: 'y.ts', defect: 'the second defect' },
        ],
      })
      const listB = w('B.json', { model: 'GPT-5.6 Sol', entries: [{ id: 'B1', file: 'y.ts', defect: 'the second' }] })
      const union = w('U.json', {
        mergedBy: 'Claude Opus 5',
        entries: [
          { id: 'U1', from: ['A1'] },
          { id: 'U2', from: ['A2', 'B1'], defect: 'the second defect, both said it' },
        ],
      })
      // The halves decide the merger only where they are TRACKED artefacts, so the
      // temp fixtures say so explicitly; the untracked case is asserted below.
      const tracked = {
        isTracked: () => true,
        committedHalf: committedFixture,
        committedUnion: committedOidFixture,
        blobText: blobTextFixture(listA, listB, union),
        hashFile: hashFileFixture,
      }
      const built = build({
        mode: 'blind-parallel',
        mergedBy: 'Claude Opus 5',
        unionPath: union,
        listAPath: listA,
        listBPath: listB,
        ...tracked,
      })
      expect(built.record.mergedBy).toBe('Claude Opus 5')
      // The record CARRIES the halves, because the gate re-judges it later and
      // would otherwise fall back to the trailer proxy and call this a self-merge.
      expect(built.record.halfAuthors).toEqual(['Fable 5', 'GPT-5.6 Sol'])
      // Sources are stored repo-relative where they resolve inside the checkout;
      // these temp fixtures live outside it and stay as given.
      expect(built.record.halfSources).toEqual([listA, listB])
      // …and the union the count read is content-addressed in the row, so the
      // receipt is re-derivable later (cross-vendor re-review of point 889).
      expect(built.record.unionBlob).toBe(committedOidFixture(union))

      // UNTRACKED HALVES ARE CALLER-WRITTEN and decide nothing: the trailer proxy
      // stands, and with it the older refusal. Without this the change would be
      // WEAKER than the proxy it replaced — anyone could write two files naming
      // authors that leave themselves untainted.
      const untracked = build({
        mode: 'blind-parallel',
        mergedBy: 'Claude Opus 5',
        unionPath: union,
        listAPath: listA,
        listBPath: listB,
        isTracked: () => false,
      })
      expect(untracked.ok).toBe(false)
      expect(untracked.record?.halfAuthors).toBeUndefined()

      // AND THE HOLE THAT FIXTURE STOOD IN: an author of a half is refused as the
      // merger now that the halves say who wrote them — the union itself names
      // the half-author, so the committed artefact carries the self-merge.
      const selfUnion = w('U-self.json', {
        mergedBy: 'GPT-5.6 Sol',
        entries: [
          { id: 'U1', from: ['A1'] },
          { id: 'U2', from: ['A2', 'B1'], defect: 'the second defect, both said it' },
        ],
      })
      const selfMerged = build({
        mode: 'blind-parallel',
        mergedBy: 'GPT-5.6 Sol',
        unionPath: selfUnion,
        listAPath: listA,
        listBPath: listB,
        ...tracked,
        blobText: blobTextFixture(listA, listB, selfUnion),
      })
      expect(selfMerged.ok).toBe(false)
      expect((selfMerged.errors ?? []).join('\n')).toMatch(/authored one of the two lists \(GPT-5\.6 Sol\)/)

      // A committed union that names NO merger refuses at the recorder, not
      // first at the gate (re-review round 5).
      const unownedUnion = w('U-unowned.json', {
        entries: [
          { id: 'U1', from: ['A1'] },
          { id: 'U2', from: ['A2', 'B1'], defect: 'the second defect, both said it' },
        ],
      })
      const unowned = build({
        mode: 'blind-parallel',
        ...tracked,
        // The committed-blob fixtures carry THIS union too, so the refusal is
        // the ownership rule and never a missing fixture blob (re-review
        // round 8).
        blobText: blobTextFixture(listA, listB, unownedUnion),
        unionPath: unownedUnion,
        listAPath: listA,
        listBPath: listB,
      })
      expect(unowned.ok).toBe(false)
      expect((unowned.errors ?? []).join('\n')).toMatch(/names no "mergedBy"/)
      expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
      expect(built.record.accounting).toMatch(/^2 A \+ 1 B entries → 2 union entries .*every input entry accounted for$/)
      expect(built.record.accountingSource).toBe('computed')

      // A union that drops an entry cannot be recorded at all.
      const dropped = w('U-bad.json', { entries: [{ id: 'U1', from: ['A1'] }] })
      const bad = build({ mode: 'blind-parallel', mergedBy: 'Fable 5', unionPath: dropped, listAPath: listA, listBPath: listB })
      expect(bad.ok).toBe(false)
      expect(bad.errors.join('\n')).toMatch(/is in NO union entry/)

      // Half the files is a mistake, not a shortcut.
      const half = build({ mode: 'blind-parallel', mergedBy: 'Fable 5', unionPath: union })
      expect(half.ok).toBe(false)
      expect(half.errors.join('\n')).toMatch(/--list-a and --list-b/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('records verified reviewer authorship and refuses contradictory metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-review-authorship-'))
    try {
      const at = '2026-08-13T15:34:26.009Z'
      const transcript = join(dir, 'session.jsonl')
      const line = (model) =>
        [
          JSON.stringify({
            timestamp: at,
            type: 'assistant',
            message: { role: 'assistant', model, id: 'review-result' },
          }),
          JSON.stringify({ timestamp: '2026-08-13T15:34:27.000Z', type: 'user', message: { role: 'user' } }),
        ].join('\n')

      writeFileSync(transcript, line('claude-fable-5'))
      const agreed = build({
        mode: 'review',
        model: 'Fable 5',
        modelAt: at,
        modelTranscript: transcript,
        resolve: (ref) => stub({ sha: String(ref), authoredBy: 'GPT-5.6 Sol <noreply@openai.com>' }),
      })
      expect(agreed.ok, (agreed.errors ?? []).join('\n')).toBe(true)
      expect(agreed.record.reviewerAuthorship).toMatchObject({
        status: 'agreement',
        claimedModel: 'Fable 5',
        actualModel: 'claude-fable-5',
        messageId: 'review-result',
      })

      writeFileSync(transcript, line('claude-opus-5'))
      const contradicted = build({
        mode: 'review',
        model: 'Fable 5',
        modelAt: at,
        modelTranscript: transcript,
        resolve: (ref) => stub({ sha: String(ref), authoredBy: 'GPT-5.6 Sol <noreply@openai.com>' }),
      })
      expect(contradicted.ok).toBe(false)
      expect(contradicted.errors.join('\n')).toMatch(/disagrees with transcript message\.model.*permission is refused/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('records a missing reviewer transcript as unverified', () => {
    const built = build({
      mode: 'review',
      modelAt: '2026-08-13T15:34:26.009Z',
      modelTranscript: '/transcript/that/is/gone.jsonl',
    })
    expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
    expect(built.record.reviewerAuthorship).toMatchObject({
      status: 'unverified',
      reason: expect.stringMatching(/cannot read transcript/),
    })
  })

  it('COUNTS AND RECORDS THROUGH THE SPAWNED COMMAND, flags, exit code and ledger', () => {
    // The build layer above proves the logic; this proves the COMMAND — its flag
    // parsing, its plumbing and its exit code (four-eyes review, fourth round).
    // It runs against a throwaway checkout, so the tracked ledger is untouched.
    const dir = mkdtempSync(join(tmpdir(), 'hoa-record-repo-'))
    try {
      const repo = join(dir, 'repo')
      mkdirSync(join(repo, 'scripts'), { recursive: true })
      for (const f of [
        'mechanism-review.mjs',
        'mechanism-review-core.mjs',
        'authorship-check-core.mjs',
        'authorship-check-io.mjs',
        'mandatory-duty-core.mjs',
        'blind-merge-core.mjs',
        // the AUTHOR allowlist, which answers what a model trailer is (point 667)
        'model-guard-core.mjs',
        // and how a review split into PASSES composes back into a coverage (714)
        'review-material-core.mjs',
        'repo-paths.mjs',
        'is-main.mjs',
      ]) {
        copyFileSync(resolve(process.cwd(), 'scripts', f), join(repo, 'scripts', f))
      }
      installFableSwitch(repo, 'off')
      const git = (...args) =>
        spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true, env: { ...process.env, HOME: dir } })
      git('init', '-q', '-b', 'main')
      git('config', 'user.email', 'test@example.invalid')
      git('config', 'user.name', 'Test')
      writeFileSync(join(repo, 'world.txt'), 'a fixture world\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'Lay down the world\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')
      const _sha = git('rev-parse', 'HEAD').stdout.trim()

      const w = (name, value) => {
        const path = join(dir, name)
        writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
        return path
      }
      // THE HALVES ARE COMMITTED ARTEFACTS, because that is the only form whose
      // authorship the recorder can prove (cross-vendor review of point 889).
      const halfA = { model: 'Opus 5', entries: [{ id: 'A1', file: 'x.ts', defect: 'the first defect' }] }
      const halfB = { model: 'GPT-5.6 Sol', entries: [{ id: 'B1', file: 'x.ts', defect: 'the first defect said differently' }] }
      mkdirSync(join(repo, 'docs'), { recursive: true })
      writeFileSync(join(repo, 'docs', 'A.json'), JSON.stringify(halfA))
      writeFileSync(join(repo, 'docs', 'B.json'), JSON.stringify(halfB))
      writeFileSync(
        join(repo, 'docs', 'U.json'),
        JSON.stringify({ mergedBy: 'GPT-5.6 Sol', entries: [{ id: 'U1', from: ['A1', 'B1'], defect: 'the first defect' }] }),
      )
      git('add', '-A')
      git('commit', '-q', '-m', 'File the two blind halves and their union\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')
      // The fold is recorded against the commit that CARRIES the artefacts —
      // the record's sha is where the halves and union are anchored, so a sha
      // whose tree lacks them refuses (re-review round 4).
      const sha2 = git('rev-parse', 'HEAD').stdout.trim()
      const listA = join(repo, 'docs', 'A.json')
      const listB = join(repo, 'docs', 'B.json')
      const union = join(repo, 'docs', 'U.json')
      const record = (unionPath) =>
        spawnSync(
          process.execPath,
          [
            join(repo, 'scripts', 'mechanism-review.mjs'),
            '--record', sha2,
            '--model', 'GPT-5.6 Sol',
            '--verdict', 'merge',
            '--evidence', 'read both lists and the union that folded them',
            '--mode', 'blind-parallel',
            '--union', unionPath,
            '--list-a', listA,
            '--list-b', listB,
          ],
          { cwd: repo, encoding: 'utf8', windowsHide: true },
        )

      const ok = record(union)
      expect(ok.status, `${ok.stdout}${ok.stderr}`).toBe(0)
      const row = JSON.parse(readFileSync(join(repo, '.claude', 'mechanism-reviews.jsonl'), 'utf8').trim())
      expect(row).toMatchObject({ sha: sha2, mergedBy: 'GPT-5.6 Sol', accountingSource: 'computed', mode: 'blind-parallel' })
      // The whole switch-generated sentence, not merely the status command: the
      // false "two models existed" wording would still have contained it
      // (re-review round 3).
      expect(row.mergeFallback).toMatch(/^Fable 5 is switched off by the recorded Fable switch \(node scripts\/fable-switch\.mjs --status\): /)
      expect(row.accounting).toMatch(/1 A \+ 1 B entries → 1 union entries .*every input entry accounted for/)
      // The row says which blobs it read, so a later reader re-derives the proof.
      expect(row.halfAuthors).toEqual(['Opus 5', 'GPT-5.6 Sol'])
      // Stored repo-relative, so the ledger row is valid from every checkout.
      expect(row.halfSources).toEqual(['docs/A.json', 'docs/B.json'])
      expect(row.halfBlobs).toEqual([
        git('rev-parse', 'HEAD:docs/A.json').stdout.trim(),
        git('rev-parse', 'HEAD:docs/B.json').stdout.trim(),
      ])
      expect(row.unionSource).toBe('docs/U.json')
      expect(row.unionBlob).toBe(git('rev-parse', 'HEAD:docs/U.json').stdout.trim())

      // The reviewer-identity boundary at the spawned surface: an unknown-vendor
      // reviewer is refused outright — no status, reason, or wording admits it —
      // while the OpenAI record above was accepted as unverified-with-reason.
      const mystery = spawnSync(
        process.execPath,
        [
          join(repo, 'scripts', 'mechanism-review.mjs'),
          '--record', sha2, '--model', 'Mystery 9', '--verdict', 'merge',
          '--evidence', 'read both lists and the union that folded them',
          '--mode', 'blind-parallel', '--union', union, '--list-a', listA, '--list-b', listB,
        ],
        { cwd: repo, encoding: 'utf8', windowsHide: true },
      )
      expect(mystery.status).not.toBe(0)
      expect(`${mystery.stdout}${mystery.stderr}`).toMatch(/no vendor the review roster can place|must be VERIFIED/)

      // A REWORDED DEFECT WITH IDENTICAL MODELS, OWNER AND SUMMARY still
      // refuses, AND BY THE HASH COMPARISON, not by an untracked-path shortcut
      // (re-review rounds 8 and 9): the reworded half is COMMITTED — the
      // working tree is clean at HEAD — while the record targets the older
      // sha whose blob carries the original wording. Only the byte identity
      // between the working file and the blob the row binds can see that.
      writeFileSync(
        join(repo, 'docs', 'B.json'),
        JSON.stringify({
          model: 'GPT-5.6 Sol',
          entries: [{ id: 'B1', file: 'x.ts', defect: 'the first defect, but reworded after the fold' }],
        }),
      )
      // Only the half is staged: -A would sweep the freshly written ledger into
      // this commit, and the revert below would then delete it out from under
      // the later assertions (re-review round 10).
      git('add', 'docs/B.json')
      git('commit', '-q', '-m', 'Reword the defect after the fold\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')
      const editedContent = record(union)
      expect(editedContent.status).not.toBe(0)
      expect(`${editedContent.stdout}${editedContent.stderr}`).toMatch(/differs from the blob .* the row would bind/)
      expect(readFileSync(join(repo, '.claude', 'mechanism-reviews.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1)
      // Restore the fold-era wording for the cases below.
      git('revert', '-q', '--no-edit', 'HEAD')

      // A JUNK SPELLING refuses instead of being silently repaired — the
      // canonicalization accepts absolute-inside and platform separators,
      // nothing else (re-review round 11).
      const doubled = `${repo}/docs//B.json`
      const junk = spawnSync(
        process.execPath,
        [
          join(repo, 'scripts', 'mechanism-review.mjs'),
          '--record', sha2, '--model', 'GPT-5.6 Sol', '--verdict', 'merge',
          '--evidence', 'read both lists and the union that folded them',
          '--mode', 'blind-parallel', '--union', union, '--list-a', listA, '--list-b', doubled,
        ],
        { cwd: repo, encoding: 'utf8', windowsHide: true },
      )
      expect(junk.status).not.toBe(0)
      expect(`${junk.stdout}${junk.stderr}`).toMatch(/not a canonical spelling/)
      expect(readFileSync(join(repo, '.claude', 'mechanism-reviews.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1)

      // THE UNTRACKED-UNION REFUSAL, ISOLATED: committed halves, a complete
      // caller-written union — only the union's provenance can refuse here
      // (re-review round 4: the earlier cases confounded it with a dropped
      // entry or untracked halves).
      const looseUnion = w('U-loose.json', {
        mergedBy: 'GPT-5.6 Sol',
        entries: [{ id: 'U1', from: ['A1', 'B1'], defect: 'the first defect' }],
      })
      const unionLoose = record(looseUnion)
      expect(unionLoose.status).not.toBe(0)
      expect(`${unionLoose.stdout}${unionLoose.stderr}`).toMatch(/the union.*not a tracked, clean committed artefact/)
      expect(readFileSync(join(repo, '.claude', 'mechanism-reviews.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1)

      // AN UNPROVABLE HALF REFUSES; IT DOES NOT FALL BACK TO THE TRAILERS. The
      // caller hands the three files over precisely so the halves decide instead
      // of the recording commit, and a fold whose halves cannot be read is the
      // unknown-authorship case the rule exists to refuse. It used to write the
      // record anyway, silently, off the commit's own co-authors.
      const loose = w('loose-A.json', halfA)
      const untracked = spawnSync(
        process.execPath,
        [
          join(repo, 'scripts', 'mechanism-review.mjs'),
          '--record', sha2, '--model', 'GPT-5.6 Sol', '--verdict', 'merge',
          '--evidence', 'read both lists and the union that folded them',
          '--mode', 'blind-parallel', '--union', union, '--list-a', loose, '--list-b', listB,
        ],
        { cwd: repo, encoding: 'utf8', windowsHide: true },
      )
      expect(untracked.status).not.toBe(0)
      expect(`${untracked.stdout}${untracked.stderr}`).toMatch(/not a tracked, clean repository artefact/)
      expect(readFileSync(join(repo, '.claude', 'mechanism-reviews.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1)

      // …and a union that drops an entry exits non-zero and writes nothing more.
      const bad = record(w('U-bad.json', { entries: [{ id: 'U1', from: ['A1'] }] }))
      expect(bad.status).not.toBe(0)
      expect(`${bad.stdout}${bad.stderr}`).toMatch(/is in NO union entry/)
      expect(readFileSync(join(repo, '.claude', 'mechanism-reviews.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('carries a pass ONLY over verified-identical blobs, copying the source verdict (delta rounds)', () => {
    // The carry contract's recorder half: blob identity per file, the source
    // reading itself, no fresh verdict — and every refusal shape refuses.
    const dir = mkdtempSync(join(tmpdir(), 'hoa-carry-'))
    try {
      const repo = join(dir, 'repo')
      mkdirSync(join(repo, 'scripts'), { recursive: true })
      for (const f of [
        'mechanism-review.mjs',
        'mechanism-review-core.mjs',
        'authorship-check-core.mjs',
        'authorship-check-io.mjs',
        'mandatory-duty-core.mjs',
        'blind-merge-core.mjs',
        'model-guard-core.mjs',
        'review-material-core.mjs',
        'repo-paths.mjs',
        'is-main.mjs',
      ]) {
        copyFileSync(resolve(process.cwd(), 'scripts', f), join(repo, 'scripts', f))
      }
      installFableSwitch(repo)
      const git = (...args) =>
        spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true, env: { ...process.env, HOME: dir } })
      git('init', '-q', '-b', 'main')
      git('config', 'user.email', 'test@example.invalid')
      git('config', 'user.name', 'Test')
      writeFileSync(join(repo, 'fileA.mjs'), 'alpha\n')
      writeFileSync(join(repo, 'fileB.mjs'), 'beta\n')
      writeFileSync(join(repo, 'gone.mjs'), 'present only at the source\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'Lay down the pair\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')
      const S = git('rev-parse', 'HEAD').stdout.trim()
      rmSync(join(repo, 'gone.mjs'))
      writeFileSync(join(repo, 'fileC.mjs'), 'gamma\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'Add a third file\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')
      const H = git('rev-parse', 'HEAD').stdout.trim()
      mkdirSync(join(repo, '.claude'), { recursive: true })
      writeFileSync(
        join(repo, '.claude', 'mechanism-reviews.jsonl'),
        `${JSON.stringify({
          sha: S,
          subject: 'Lay down the pair',
          authoredBy: 'Claude Opus 5 <noreply@anthropic.com>',
          model: 'GPT-5.6 Sol',
          verdict: 'merge-with-fixes',
          evidence: 'read both files whole and found one soft spot',
          mode: 'review',
          pass: { index: 1, total: 2, files: ['fileA.mjs', 'fileB.mjs'] },
          at: 1_787_000_000_000,
          atIso: '2026-08-18T00:00:00.000Z',
        })}\n`,
      )
      const runRecorder = (...args) =>
        spawnSync(process.execPath, [join(repo, 'scripts', 'mechanism-review.mjs'), ...args], {
          cwd: repo,
          encoding: 'utf8',
          windowsHide: true,
        })
      // The happy carry: unchanged blobs, source covers the exact set.
      const ok = runRecorder('--record', H, '--carried-from', S, '--pass', '1/2', '--pass-files', 'fileA.mjs,fileB.mjs')
      expect(ok.status, `${ok.stdout}${ok.stderr}`).toBe(0)
      const rows = readFileSync(join(repo, '.claude', 'mechanism-reviews.jsonl'), 'utf8').trim().split('\n')
      const carried = JSON.parse(rows.at(-1))
      expect(carried).toMatchObject({
        sha: H,
        model: 'GPT-5.6 Sol',
        verdict: 'merge-with-fixes',
        mode: 'review',
        carried: { from: S },
        pass: { index: 1, total: 2, files: ['fileA.mjs', 'fileB.mjs'] },
        partialReview: true,
      })
      expect(carried.evidence).toMatch(/^CARRIED from [0-9a-f]{7} \(blobs verified identical\): read both files whole/)
      // A fresh verdict beside a carry is refused — a carry is provenance.
      const fresh = runRecorder('--record', H, '--carried-from', S, '--verdict', 'merge', '--pass', '1/2', '--pass-files', 'fileA.mjs,fileB.mjs')
      expect(fresh.status).toBe(1)
      expect(fresh.stderr).toContain('do not pass them')
      // A file the source never read (or that does not exist there) refuses.
      const unread = runRecorder('--record', H, '--carried-from', S, '--pass', '1/2', '--pass-files', 'fileA.mjs,fileC.mjs')
      expect(unread.status).toBe(1)
      expect(unread.stderr).toContain(`fileC.mjs does not exist at ${S.slice(0, 7)} — nothing there to carry`)
      const deleted = runRecorder('--record', H, '--carried-from', S, '--pass', '1/2', '--pass-files', 'gone.mjs')
      expect(deleted.status).toBe(1)
      expect(deleted.stderr).toContain(`gone.mjs does not exist at ${H.slice(0, 7)} — deleted content cannot be covered`)
      // Carrying FROM a carried row is refused IN ISOLATION (fourth landing
      // round, pass 2): H3 changes neither carried file, so blob identity
      // holds H..H3 and the ONLY refusal reason is the chained source.
      writeFileSync(join(repo, 'fileD.mjs'), 'delta\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'Add a fourth file\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')
      const H3 = git('rev-parse', 'HEAD').stdout.trim()
      const chained = runRecorder('--record', H3, '--carried-from', H, '--pass', '1/2', '--pass-files', 'fileA.mjs,fileB.mjs')
      expect(chained.status).toBe(1)
      expect(chained.stderr).toContain('carry from its original')
      // …while carrying from the ORIGINAL at the same head succeeds.
      const rechained = runRecorder('--record', H3, '--carried-from', S, '--pass', '1/2', '--pass-files', 'fileA.mjs,fileB.mjs')
      expect(rechained.status, `${rechained.stdout}${rechained.stderr}`).toBe(0)
      // A CHANGED blob refuses the carry outright.
      writeFileSync(join(repo, 'fileA.mjs'), 'alpha, revised\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'Revise alpha\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')
      const H2 = git('rev-parse', 'HEAD').stdout.trim()
      const changed = runRecorder('--record', H2, '--carried-from', S, '--pass', '1/2', '--pass-files', 'fileA.mjs,fileB.mjs')
      expect(changed.status).toBe(1)
      expect(changed.stderr).toContain(`CHANGED between ${S.slice(0, 7)} and ${H2.slice(0, 7)}`)
      expect(changed.stderr).toContain('review it fresh')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('verifyCarried stamps only measured blob identity — everything else stamps false (delta rounds)', async () => {
    // Runs against THIS repository's own history, read-only: a commit that
    // changed a file cannot carry a pass naming it; identical blobs verify.
    const { verifyCarried } = await import('./mechanism-review.mjs')
    const sha = (rev) =>
      spawnSync('git', ['rev-parse', rev], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true }).stdout.trim()
    const head = sha('HEAD')
    const parent = sha('HEAD~1')
    // A SHALLOW CHECKOUT HAS NO PARENT, and this check is about git history, not
    // about the machine it runs on (measured 18.08.2026): `actions/checkout`
    // clones at depth 1 unless told otherwise, so `HEAD~1` resolved to '' in CI
    // and every carry failed to verify — a RED that says nothing about
    // `verifyCarried`. The workflow now checks out depth 2 so this really runs
    // there; where the history is genuinely absent the check says so and stands
    // down, per the house rule: fail-soft on the environment, loud on the product.
    if (!parent) {
      console.warn('SKIPPED: no HEAD~1 in this checkout (shallow clone) — verifyCarried needs two commits')
      return
    }
    const changedSet = spawnSync('git', ['diff', '--name-only', 'HEAD~1..HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    })
      .stdout.trim()
      .split('\n')
      .filter(Boolean)
    const changedFile = changedSet[0] ?? ''
    // Any tracked file the last commit did NOT touch — chosen dynamically so
    // this test never pins a path a future commit might change.
    const unchangedFile = spawnSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    })
      .stdout.trim()
      .split('\n')
      .find((f) => f && !changedSet.includes(f))
    // The SOURCE READING the carried rows quote (third landing round, pass
    // 5): blob identity alone let a hand-edited carried row INVENT its
    // verdict — the stamp now also demands the original pass row whose
    // fields the carry copied.
    const source = {
      sha: parent,
      model: 'GPT-5.6 Sol',
      verdict: 'merge-with-fixes',
      evidence: 'read the pass whole and found one soft spot',
      mode: 'review',
      pass: { index: 1, total: 2, files: [unchangedFile] },
      at: 1_787_000_000_000,
    }
    const contributionSource = {
      ...source,
      pass: { ...source.pass, commits: [parent] },
    }
    const carriedRow = (over = {}) => ({
      sha: head,
      model: source.model,
      verdict: source.verdict,
      evidence: `CARRIED from ${parent.slice(0, 7)} (blobs verified identical): ${source.evidence}`,
      mode: source.mode,
      carried: { from: parent },
      pass: { index: 1, total: 2, files: [unchangedFile] },
      ...over,
    })
    const rows = [
      carriedRow(),
      carriedRow({ pass: { index: 1, total: 2, files: [changedFile] } }),
      carriedRow({ carried: { from: 'not-a-sha' } }),
      carriedRow({ pass: { index: 1, total: 2, files: [] } }),
      carriedRow({ pass: { index: 1, total: 2, files: 'x' } }),
      { sha: head, verdict: 'merge' },
      // An INVENTED verdict, blobs identical: must not stamp.
      carriedRow({ verdict: 'merge' }),
      // A fabricated evidence line, blobs identical: must not stamp.
      carriedRow({ evidence: 'CARRIED from abcdef0 (blobs verified identical): something nobody wrote' }),
      // No source row in the ledger at all: must not stamp.
      carriedRow({ model: 'Fable 5' }),
      // The superseded contribution model cannot be promoted through carry.
      carriedRow(),
    ]
    verifyCarried(rows, [source])
    expect(rows[0].carriedVerified, `${unchangedFile} unchanged + source matches`).toBe(true)
    expect(rows[1].carriedVerified, `${changedFile} changed`).toBe(false)
    expect(rows[2].carriedVerified).toBe(false)
    expect(rows[3].carriedVerified).toBe(false)
    expect(rows[4].carriedVerified).toBe(false)
    // A row without a carry is left unstamped — it owes no verification.
    expect('carriedVerified' in rows[5]).toBe(false)
    expect(rows[6].carriedVerified, 'invented verdict').toBe(false)
    expect(rows[7].carriedVerified, 'fabricated evidence').toBe(false)
    expect(rows[8].carriedVerified, 'no matching source').toBe(false)
    verifyCarried([rows[9]], [contributionSource])
    expect(rows[9].carriedVerified, 'historical contribution source').toBe(false)
  })

  it('refuses a non-hex --record sha by SHAPE, before git or any shell sees it (landing-round pass 4)', () => {
    // The sha used to be interpolated into a shell line before validation ran,
    // so `HEAD"; <command>; echo "` executed whatever it carried. The resolve
    // step now refuses anything but a hex sha, and the git helper takes an
    // argument vector — there is no shell to inject into.
    for (const sha of ['HEAD"; echo pwned; echo "', 'HEAD', 'main', '$(rm -rf x)', 'abc123g']) {
      const r = run(
        '--record', sha,
        '--model', 'GPT-5.6 Sol',
        '--verdict', 'merge',
        '--evidence', 'checked the whole change end to end',
        '--mode', 'review',
      )
      expect(r.status, sha).toBe(1)
      expect(r.stderr, sha).toContain('not a commit sha')
    }
  })

  it('lists a ledger holding a hand-edited pass whose files are no array (final-round pass 4)', () => {
    // readRecords validates only the sha, so `pass: { files: "x" }` in a
    // JSON-valid hand-edited row crashed the ENTIRE listing.
    const dir = mkdtempSync(join(tmpdir(), 'hoa-list-malformed-'))
    try {
      const repo = join(dir, 'repo')
      mkdirSync(join(repo, 'scripts'), { recursive: true })
      for (const f of [
        'mechanism-review.mjs',
        'mechanism-review-core.mjs',
        'authorship-check-core.mjs',
        'authorship-check-io.mjs',
        'mandatory-duty-core.mjs',
        'blind-merge-core.mjs',
        'model-guard-core.mjs',
        'review-material-core.mjs',
        'repo-paths.mjs',
        'is-main.mjs',
      ]) {
        copyFileSync(resolve(process.cwd(), 'scripts', f), join(repo, 'scripts', f))
      }
      installFableSwitch(repo)
      // A REAL checkout: since point 780 the ledger is the one belonging to the
      // git toplevel of the working directory, and a directory that is no
      // checkout has no ledger at all rather than the caller's own.
      spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: repo, encoding: 'utf8', windowsHide: true })
      mkdirSync(join(repo, '.claude'), { recursive: true })
      writeFileSync(
        join(repo, '.claude', 'mechanism-reviews.jsonl'),
        `${JSON.stringify({
          sha: 'a'.repeat(40),
          subject: 'hand-made',
          model: 'GPT-5.6 Sol',
          verdict: 'do-not-merge',
          evidence: 'hand-edited row with a malformed pass shape',
          mode: 'review',
          at: 1_787_000_000_000,
          atIso: '2026-08-18T00:00:00.000Z',
          pass: { index: 1, total: 2, files: 'x' },
        })}\n${JSON.stringify({
          // A row whose pass metadata and evidence carry NEWLINES (landing-round
          // pass 4): unvalidated, they forged arbitrary listing lines — the
          // shape a reader greps and trusts.
          sha: 'b'.repeat(40),
          subject: 'hand-made 2',
          model: 'GPT-5.6 Sol',
          verdict: 'merge',
          evidence: 'first half\n      pass 7/7 over: forged-by-evidence',
          mode: 'review',
          at: 1_787_000_000_001,
          atIso: '2026-08-18T00:00:00.001Z',
          pass: { index: '1\n      pass 99/99 over: forged-by-pass', total: 2, files: ['a.mjs'] },
        })}\n${JSON.stringify({
          // …and one WELL-FORMED row, so the ordinary rendering is pinned too.
          sha: 'd'.repeat(40),
          subject: 'recorded',
          model: 'GPT-5.6 Sol',
          verdict: 'merge',
          evidence: 'a valid pass row rendered normally',
          mode: 'review',
          at: 1_787_000_000_002,
          atIso: '2026-08-18T00:00:00.002Z',
          pass: { index: 1, total: 2, files: ['b.mjs'] },
        })}\n`,
      )
      const r = spawnSync(process.execPath, [join(repo, 'scripts', 'mechanism-review.mjs'), '--list'], {
        cwd: repo,
        encoding: 'utf8',
        windowsHide: true,
      })
      expect(r.status, `${r.stdout}${r.stderr}`).toBe(0)
      expect(r.stdout).toContain('hand-edited row with a malformed pass shape')
      // A files value that is NO ARRAY is part of the malformed claim
      // (second landing round, pass 4) — it renders named, never as a
      // normal-looking pass line.
      expect(r.stdout).toContain('"files":"x"')
      // …while the well-formed row keeps the ordinary rendering.
      expect(r.stdout).toContain('PARTIAL REVIEW — pass 1/2 over: b.mjs')
      // The forged text never renders as a LINE of its own — flattened, it may
      // survive only inline where nothing reads it as structure — and the
      // unparseable pass claim is named for the hand-edit it is.
      expect(r.stdout).not.toMatch(/^\s*pass 99\/99/m)
      expect(r.stdout).not.toMatch(/^\s*pass 7\/7/m)
      expect(r.stdout).toContain('MALFORMED claim')
      expect(r.stdout).toContain('first half pass 7/7 over: forged-by-evidence')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads authorship past a subject containing the old field separator', () => {
    // ROUND-1 PASS 2, the recorder's half: subject and trailers used to travel
    // in ONE delimited `git show` format, so a legal subject containing the
    // separator shifted the trailers out of their field — authoredBy read
    // empty, and the authoring model could record its own review. Each fact now
    // travels through its own single-format call; this commit is the exploit.
    const dir = mkdtempSync(join(tmpdir(), 'hoa-record-fld-'))
    try {
      const repo = join(dir, 'repo')
      mkdirSync(join(repo, 'scripts'), { recursive: true })
      for (const f of [
        'mechanism-review.mjs',
        'mechanism-review-core.mjs',
        'authorship-check-core.mjs',
        'authorship-check-io.mjs',
        'mandatory-duty-core.mjs',
        'blind-merge-core.mjs',
        'model-guard-core.mjs',
        'review-material-core.mjs',
        'repo-paths.mjs',
        'is-main.mjs',
      ]) {
        copyFileSync(resolve(process.cwd(), 'scripts', f), join(repo, 'scripts', f))
      }
      installFableSwitch(repo)
      const git = (...args) =>
        spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true, env: { ...process.env, HOME: dir } })
      git('init', '-q', '-b', 'main')
      git('config', 'user.email', 'test@example.invalid')
      git('config', 'user.name', 'Test')
      writeFileSync(join(repo, 'world.txt'), 'a fixture world\n')
      git('add', '-A')
      const subject = 'Route the __F__ marker past the splitter'
      git('commit', '-q', '-m', `${subject}\n\nCo-Authored-By: GPT-5.6 Sol <noreply@openai.com>`)
      const sha = git('rev-parse', 'HEAD').stdout.trim()
      // The Anthropic reviewer's identity is VERIFIED (post-VERIFIED_REVIEWER_SINCE
      // rows from that vendor no longer clear unverified), so the fixture carries
      // the transcript its claim quotes.
      const reviewAt = '2026-08-24T16:20:00.000Z'
      const transcript = join(dir, 'session.jsonl')
      writeFileSync(
        transcript,
        `${JSON.stringify({
          timestamp: reviewAt,
          type: 'assistant',
          isSidechain: false,
          message: { role: 'assistant', model: 'claude-fable-5', id: 'm1' },
        })}\n`,
      )
      const record = (model, ...extra) =>
        spawnSync(
          process.execPath,
          [
            join(repo, 'scripts', 'mechanism-review.mjs'),
            '--record', sha,
            '--model', model,
            '--verdict', 'merge',
            '--evidence', 'read the fixture change against its stated intent',
            '--mode', 'review',
            ...extra,
          ],
          { cwd: repo, encoding: 'utf8', windowsHide: true },
        )

      // The exploit itself: the commit's own author records its review. Before
      // the fix the shifted field hid the authorship and this PASSED.
      const self = record('GPT-5.6 Sol')
      // The refusal is asserted by its own wording, not a bare exit code — a
      // spawn that never ran would satisfy .not.toBe(0) with empty output.
      expect(self.stderr, `${self.stdout}${self.stderr}`).toContain('SAME-VENDOR REVIEW is refused')
      expect(self.stderr).toContain('GPT-5.6 Sol')

      // An Anthropic reviewer with no identity evidence is refused outright.
      const unproven = record('Claude Fable 5')
      expect(unproven.status).not.toBe(0)
      expect(`${unproven.stdout}${unproven.stderr}`).toContain('must be VERIFIED')

      // A cross-model record works, and the ledger row carries the subject
      // whole and the authorship exactly as the trailer spells it.
      const ok = record('Claude Fable 5', '--model-at', reviewAt, '--model-transcript', transcript)
      expect(ok.status, `${ok.stdout}${ok.stderr}`).toBe(0)
      const row = JSON.parse(readFileSync(join(repo, '.claude', 'mechanism-reviews.jsonl'), 'utf8').trim())
      expect(row.subject).toBe(subject)
      expect(row.authoredBy).toBe('GPT-5.6 Sol <noreply@openai.com>')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('marks a typed receipt as stated, so the ledger says which it was', () => {
    expect(build({ mode: 'blind-parallel', ...merged }).record.accountingSource).toBe('stated')
  })

  it('a review record carries no merging model at all', () => {
    expect(build({ mode: 'review' }).record.mergedBy).toBeUndefined()
  })

  it('REFUSES to build a record that names no mode, and says which two there are', () => {
    const built = build({})
    expect(built.ok).toBe(false)
    const text = built.errors.join('\n')
    expect(text).toContain('--mode')
    for (const mode of MODES) expect(text).toContain(mode)
  })

  it('refuses the framing under --mode review as meaningless there', () => {
    const built = build({ mode: 'review', framing: 'framed as a hostile tester' })
    expect(built.ok).toBe(false)
    expect(built.errors.join('\n')).toMatch(/--framing is meaningless under --mode review/)
  })

  it('leaves out the framing key entirely when none was given', () => {
    const built = build({ mode: 'review' })
    expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
    expect(Object.hasOwn(built.record, 'framing')).toBe(false)
  })

  it('records the re-authoring framing beside an ordinary review', () => {
    const authorFraming = 'Act as a hostile tester and probe every adjacent transition.'
    const built = build({ mode: 'review', authorFraming })
    expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
    expect(built.record.authorFraming).toBe(authorFraming)
    expect(built.record.framing).toBeUndefined()
    expect(build({ mode: 'review', authorFraming: `${authorFraming}\nforged round` }).ok).toBe(false)
  })

  it('records one sound or amended spec examination, never as an authoring round', () => {
    for (const specExamination of ['sound', 'amended']) {
      const built = build({ mode: 'review', verdict: 'merge', specExamination })
      expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
      expect(built.record.specExamination).toBe(specExamination)
    }
    expect(build({ mode: 'review', specExamination: 'unclear' }).errors.join('\n')).toContain('sound | amended')
    expect(build({ mode: 'review', verdict: 'do-not-merge', specExamination: 'sound' }).ok).toBe(false)
    expect(
      build({
        mode: 'review',
        specExamination: 'sound',
        authorFraming: 'Act as a hostile tester and probe every adjacent transition.',
      }).ok,
    ).toBe(false)
  })

  it('still reads a legacy row that predates the flag', () => {
    withLedger((path) => {
      appendRecord({ sha: 'c'.repeat(40), model: 'Fable 5', verdict: 'merge', evidence: 'older row' }, path)
      const back = readRecords(path)
      expect(back).toHaveLength(1)
      expect(back[0].mode).toBeUndefined()
    })
  })
})

describe('the mode at the command line', () => {
  it('refuses a record without --mode, printing the usage', () => {
    const r = run(
      '--record', 'HEAD',
      '--model', 'Fable 5',
      '--verdict', 'merge',
      '--evidence', 'read the core against the spec and ran the pure cases',
    )
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('--mode')
    expect(r.stderr).toContain(usage())
    expect(r.stdout.trim()).toBe('')
  })

  it('refuses a mode that is neither of the two', () => {
    const r = run(
      '--record', 'HEAD',
      '--model', 'Fable 5',
      '--verdict', 'merge',
      '--evidence', 'read the core against the spec and ran the pure cases',
      '--mode', 'skimmed',
    )
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('skimmed')
    expect(r.stdout.trim()).toBe('')
  })

  it('reports --mdoe as the misspelling it is, rather than dropping it', () => {
    // Point 540 is what makes a mistyped --mode visible instead of silent — the
    // whole reason these two land together.
    const r = run('--record', 'HEAD', '--mdoe', 'review')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('unknown flag --mdoe')
    expect(r.stderr).toContain('did you mean --mode')
  })

  it('documents both modes and the framing in its usage', () => {
    const text = usage()
    expect(text).toContain('--mode')
    expect(text).toContain('--framing')
    for (const mode of MODES) expect(text).toContain(mode)
  })
})

describe('a boundary resolves against the object database, not against refs', () => {
  // Real `--disambiguate` only ever lists objects that CARRY the queried prefix,
  // so the fixtures do too: a fake free to answer with an unrelated sha would
  // pin a contract git does not have.
  const PREFIX = 'aaaaaaa'
  const OBJECT = `${PREFIX}${'0'.repeat(33)}`
  const SIBLING = `${PREFIX}${'1'.repeat(33)}`
  // What a hex-named REF would have resolved to: unrelated to the prefix, which
  // is exactly the damage — a different commit recorded than the one named.
  const SHADOW = 'b'.repeat(40)

  const runner = ({ objects = [OBJECT], types = {}, unreadable = [], calls = [] } = {}) => {
    const fake = (args) => {
      calls.push(args.join(' '))
      if (args[0] === 'rev-parse' && String(args[1]).startsWith('--disambiguate=')) {
        const prefix = String(args[1]).slice('--disambiguate='.length)
        return objects.filter((object) => object.startsWith(prefix)).join('\n')
      }
      if (args[0] === 'cat-file') {
        if (unreadable.includes(args[2])) throw new Error(`fatal: git cat-file: could not get object info`)
        return types[args[2]] ?? 'commit'
      }
      if (args[0] === 'rev-parse') return SHADOW
      if (args[0] === 'show') return String(args[2]).includes('%s') ? 'subject' : 'GPT-5.6 Sol <noreply@openai.com>'
      return ''
    }
    fake.calls = calls
    return fake
  }

  it('takes the object a prefix names, not the commit a hex-named ref points at', () => {
    const run = runner()
    expect(resolveCommit(PREFIX, { run }).sha).toBe(OBJECT)
    expect(run.calls.some((call) => call.includes('^{commit}'))).toBe(false)
  })

  it('resolves a full 40-character sha through the object database too', () => {
    const run = runner()
    // A ref may legally be named in 40 hex characters as well, so the long form
    // must not fall back to ref resolution either.
    expect(resolveCommit(OBJECT, { run }).sha).toBe(OBJECT)
    expect(run.calls.some((call) => call.includes('^{commit}'))).toBe(false)
  })

  it('refuses an ambiguous prefix instead of picking one', () => {
    const run = runner({ objects: [OBJECT, SIBLING] })
    expect(() => resolveCommit(PREFIX, { run })).toThrow(/ambiguous/)
  })

  it('refuses a prefix that names no commit', () => {
    expect(() => resolveCommit(PREFIX, { run: runner({ objects: [] }) })).toThrow(/names no commit/)
    const blob = runner({ types: { [OBJECT]: 'blob' } })
    expect(() => resolveCommit(PREFIX, { run: blob })).toThrow(/names no commit/)
  })

  it('passes over a non-commit object sharing the prefix', () => {
    const run = runner({ objects: [SIBLING, OBJECT], types: { [SIBLING]: 'tree' } })
    expect(resolveCommit(PREFIX, { run }).sha).toBe(OBJECT)
  })

  it('refuses when a candidate cannot be typed, rather than resolving around it', () => {
    // An unreadable object could itself be a commit; dropping it would let
    // ambiguity fail open, which is the one direction this check must not fail.
    const run = runner({ objects: [OBJECT, SIBLING], unreadable: [SIBLING] })
    expect(() => resolveCommit(PREFIX, { run })).toThrow(/cannot read/)
  })
})

// THE LEDGER FOLLOWS THE CHECKOUT THE COMMAND RUNS IN (point 780).
//
// It was pinned to the module's own directory, so a command invoked by its
// main-tree path from an isolation worktree — which is where CLAUDE.md §6 sends
// every delegated author — appended to the MAIN tree and then failed to commit
// it there. These cases build a real repository with a real worktree, because
// the defect lives exactly in the difference between the two.
describe('the ledger path follows the working directory', () => {
  const tempDirs = []
  const git = (cwd, ...args) => {
    const res = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })
    if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`)
    return (res.stdout ?? '').trim()
  }

  afterEach(() => {
    while (tempDirs.length) rmSync(tempDirs.pop(), { recursive: true, force: true })
  })

  const repoWithWorktree = () => {
    const root = mkdtempSync(join(tmpdir(), 'hoa-ledger-cwd-'))
    tempDirs.push(root)
    const main = join(root, 'main')
    mkdirSync(main, { recursive: true })
    git(main, 'init', '-q', '-b', 'main')
    git(main, 'config', 'user.email', 'test@example.invalid')
    git(main, 'config', 'user.name', 'Test')
    writeFileSync(join(main, 'seed.txt'), 'seed\n')
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'seed')
    const worktree = join(root, 'wt')
    git(main, 'worktree', 'add', '-q', '-b', 'feat/x', worktree)
    return { main, worktree }
  }

  it('resolves to the worktree from a worktree and to the main checkout from the main tree', () => {
    const { main, worktree } = repoWithWorktree()
    // realpathSync: macOS hands out /var symlinks for temp directories, and git
    // answers with the resolved form — the comparison, not the code, needs it.
    expect(recordsPathFor(worktree)).toBe(resolve(realpathSync(worktree), LEDGER_RELATIVE_PATH))
    expect(recordsPathFor(main)).toBe(resolve(realpathSync(main), LEDGER_RELATIVE_PATH))
    expect(recordsPathFor(worktree)).not.toBe(recordsPathFor(main))
  })

  it('names no ledger at all outside any checkout, and refuses the write', () => {
    // The cross-vendor review of point 780 asked for exactly this: with no
    // checkout there is no checkout-local ledger, and answering with the
    // module's own tree would silently write a DIFFERENT repository's tracked
    // file — the same defect, one level quieter.
    const outside = mkdtempSync(join(tmpdir(), 'hoa-ledger-nogit-'))
    tempDirs.push(outside)
    expect(gitToplevel(outside)).toBe('')
    expect(recordsPathFor(outside)).toBe(null)
    expect(readRecords(null)).toEqual([])
    expect(() => appendRecord({ sha: 'a'.repeat(40) }, null)).toThrow(/outside a git checkout/)
  })

  it('tells an absent ledger apart from one it merely cannot read', () => {
    // Round 3 of the cross-vendor review: every read failure answered "no
    // reviews recorded", so an unreadable ledger looked to a gate exactly like
    // an empty one. A directory in the ledger's place is unreadable, not absent.
    const root = mkdtempSync(join(tmpdir(), 'hoa-ledger-unreadable-'))
    tempDirs.push(root)
    expect(readRecords(join(root, 'not-there.jsonl'))).toEqual([])

    const blocked = join(root, 'ledger.jsonl')
    mkdirSync(blocked, { recursive: true })
    let thrown = null
    try {
      readRecords(blocked)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown.message).toMatch(/cannot read the review ledger/)
    // The flag is what keeps the two gates from waving it through as an
    // ordinary environment error.
    expect(thrown.ledgerUnreadable).toBe(true)
  })

  it('keeps a toplevel that ends in a space instead of trimming it away', () => {
    const root = mkdtempSync(join(tmpdir(), 'hoa-ledger-space-'))
    tempDirs.push(root)
    const odd = join(root, 'checkout ')
    mkdirSync(odd, { recursive: true })
    git(odd, 'init', '-q', '-b', 'main')
    expect(gitToplevel(odd)).toBe(realpathSync(odd))
    expect(recordsPathFor(odd)).toBe(resolve(realpathSync(odd), LEDGER_RELATIVE_PATH))
  })
})
