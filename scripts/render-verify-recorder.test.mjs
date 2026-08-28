// What a RED verify run leaves behind for the accounting (point 550).
//
// The recorder taps the run's own output for the lines a suite already prints —
// `FAIL  <name> — <detail>`, `ERR: <text>` — and the guard decides from them
// whether every red is charged to an open point. Two properties matter more than
// the parsing: the tap can NEVER disturb the suite (the original write is always
// called, with the original arguments and its return value), and a run that DIED
// rather than reported is recognised as such, because a crash prints no FAIL line
// yet exits non-zero exactly like a reported failure.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { DECODE_WINDOW_BYTES, MAX_CAPTURE_CHARS, MAX_LINE_CHARS, MAX_RED_IDENTITIES, tapOutput } from './render-verify-recorder.mjs'

/** Text that is distinct in LETTERS, so the parser's own normalisation (digits,
 *  hex runs and URLs are folded away) cannot collapse it. That is exactly the
 *  content the ceiling exists for: a page error carrying a generated word mints
 *  a fresh red identity every time it prints, and no parser can fold it. */
const tag = (i) => String(i).replace(/\d/g, (d) => 'abcdefghij'[Number(d)])
import { consoleErrorChecks, failedChecks, parseCheckLines } from './verify/baseline-classify-core.mjs'
import { RETRY_ENV, chargeFor, chargeReds, droppedLinesOf, formatSuspectEnv, isIncompleteRecording, markVariedDetails, runIdentity, runVerdict, unexplainedRuns } from './render-verify-core.mjs'

// The record is stubbed, not written: these cases exercise the REAL arming and
// the REAL exit handler, and a test must never append to the checkout's own
// render-verify state.
const { recorded } = vi.hoisted(() => ({ recorded: [] }))
vi.mock('./render-verify-state.mjs', () => ({
  recordRun: (run) => recorded.push(run),
}))

// The armed cases drive the REAL tap, so the pre-test writes are saved and
// restored: a test must neither print a suite's fake output into the run log nor
// leave a wrapper behind for the next one.
//
// BOTH STREAMS (review finding, 28.08.2026, round 21). `armRunRecorder` wraps
// stderr as well, and only stdout was put back — so every armed case left its
// stderr tap installed and the next one wrote its crash lines into a stale
// recorder instance, which is the opposite of the fresh real wiring these cases
// claim.
let stdoutWrite = null
let stderrWrite = null
beforeEach(() => {
  stdoutWrite = process.stdout.write
  stderrWrite = process.stderr.write
})
afterEach(() => {
  process.stdout.write = stdoutWrite
  process.stderr.write = stderrWrite
})

/** Arm a FRESH recorder instance (the module keeps one armed run per process)
 *  under a chosen suite name, and return the record its exit handler writes. */
async function armed(suite = 'polish', featureLevel = null) {
  vi.resetModules()
  const mod = await import('./render-verify-recorder.mjs')
  const argv = process.argv[1]
  process.argv[1] = `/x/${suite}.mjs`
  // A sink UNDER the tap: the tap wraps this, so the test's lines are captured
  // exactly as in a real run but never reach the terminal.
  process.stdout.write = () => true
  mod.armRunRecorder('webgpu')
  // The WebGPU feature level the run came up at, recorded the way assertBackend
  // records it. A ledger entry scoped to the compatibility lane is unreachable
  // without it, which is the point of the scope.
  if (featureLevel) mod.markBackendAsserted(featureLevel)
  process.argv[1] = argv
  return {
    /** Fire the real exit handler and read what THIS instance recorded. */
    exit(code) {
      const before = recorded.length
      process.emit('exit', code)
      return recorded.slice(before).at(-1)
    },
  }
}

/** A stand-in for process.stdout/stderr that records what it was handed. */
function fakeStream() {
  const written = []
  return {
    written,
    write(chunk, ...rest) {
      written.push([chunk, ...rest])
      return 'the original return value'
    },
  }
}

function tapped() {
  // The real armed shape: the tap records varied identities beside the lines.
  const state = { lines: [], variedKeys: new Set(), crashed: false }
  const out = fakeStream()
  const err = fakeStream()
  const flush = tapOutput(state, [
    [out, false],
    [err, true],
  ])
  return { state, out, err, flush }
}

describe('tapOutput — observe-only', () => {
  it('passes every write through unchanged, arguments and return value alike', () => {
    const { out } = tapped()
    const cb = () => {}
    expect(out.write('PASS  something\n', 'utf8', cb)).toBe('the original return value')
    expect(out.written).toEqual([['PASS  something\n', 'utf8', cb]])
  })

  it('keeps the run\'s FAIL and ERR lines, and drops the PASS flood', () => {
    const { state, out } = tapped()
    out.write('PASS  a check that held\nFAIL  the goat stance — worst travel 0.967\n')
    out.write('ERR: [ASSERT] render-resource-leak — renderTargets grew back\n')
    expect(state.lines).toEqual([
      'FAIL  the goat stance — worst travel 0.967',
      'ERR: [ASSERT] render-resource-leak — renderTargets grew back',
    ])
  })

  it('keeps a repeated line ONCE — repetition is chatter, identity is the red (point 734)', () => {
    const { state, out } = tapped()
    for (let i = 0; i < 1000; i++) out.write('ERR: the same per-frame validation error\n')
    out.write('FAIL  the one check that failed — 3 of 4\n')
    expect(state.lines).toEqual([
      'ERR: the same per-frame validation error',
      'FAIL  the one check that failed — 3 of 4',
    ])
  })

  // A `console errors: <texts>` SUMMARY LINE CARRIES SEVERAL REDS (review
  // finding, 28.08.2026). Keying it by its FIRST parsed error collapsed two
  // such lines that shared that first one: the second line left the buffer, and
  // the reds only it carried never reached failedChecks — gone without being
  // fixed, charged or filed, and not even marked as varied.
  it('keeps two summary lines that share a first error but carry different further ones', () => {
    const { state, out } = tapped()
    out.write("console errors: ['the shared first error', 'the second error']\n")
    out.write("console errors: ['the shared first error', 'a THIRD error only this line saw']\n")
    expect(state.lines).toHaveLength(2)
    // Every red of both lines survives into the accounting the guard reads.
    expect(failedChecks(state.lines.join('\n')).map((c) => c.name)).toEqual([
      'console error: the shared first error',
      'console error: the second error',
      'console error: a THIRD error only this line saw',
    ])
    // A summary line that repeats identically is still chatter, kept once.
    out.write("console errors: ['the shared first error', 'the second error']\n")
    expect(state.lines).toHaveLength(2)
    // And a single-red line keys exactly as it always did — one entry per
    // identity, whichever of the two line shapes carried it.
    const single = tapped()
    single.out.write('ERR: the shared first error\n')
    single.out.write("console errors: ['the shared first error']\n")
    expect(single.state.lines).toHaveLength(1)
    expect(consoleErrorChecks(single.state.lines[0])).toHaveLength(1)
    expect(parseCheckLines(single.state.lines[0])).toEqual([])
  })

  // THE COMBINATION IS NOT AN IDENTITY (review finding, 28.08.2026, round 13).
  // Keying a line by its parts JOINED made `[A,B]`, `[A,C]`, `[B,C]` three keys
  // over two reds, so a suite that varies how it groups its summary lines minted
  // combinatorially many keys without ever printing a new red. A line now earns
  // its slot only by bringing an identity nothing kept yet.
  it('drops a line whose reds are ALL already kept, and does not call that a truncation', () => {
    const { state, out } = tapped()
    out.write("console errors: ['error A', 'error B']\n")
    out.write("console errors: ['error A', 'error C']\n")
    // Every red of this third line is already in the buffer under a kept line.
    out.write("console errors: ['error B', 'error C']\n")
    expect(state.lines).toHaveLength(2)
    // Nothing was LOST, so nothing is truncated — dropping pure repetition is
    // not a half-recording, and the counter is never even reached.
    expect(state.droppedLines ?? 0).toBe(0)
    expect(failedChecks(state.lines.join('\n')).map((c) => c.name)).toEqual([
      'console error: error A',
      'console error: error B',
      'console error: error C',
    ])
  })

  // THE CEILING, AND THAT IT IS LOUD (review finding, 28.08.2026, round 13).
  // "Bounded by the suite's checks and its distinct console errors" holds for
  // the checks and not for the errors: a page erroring with a UUID, a hash or a
  // generated path mints a fresh identity every print, which the parser cannot
  // fold away. Past the ceiling the buffer stops and the run says INCOMPLETE
  // RECORDING — the loud failure, never a silent half-recording.
  it('stops at the ceiling and counts what it refused', () => {
    const { state, out } = tapped()
    for (let i = 0; i < MAX_RED_IDENTITIES + 40; i++) out.write(`ERR: page error in span ${tag(i)}\n`)
    expect(state.lines).toHaveLength(MAX_RED_IDENTITIES)
    expect(state.droppedLines).toBe(40)
    // Repetition of an already-kept red still costs nothing after the ceiling.
    out.write(`ERR: page error in span ${tag(0)}\n`)
    expect(state.droppedLines).toBe(40)
  })

  // ONE LINE CAN CARRY AS MANY REDS AS THE PAGE PRINTED (review finding,
  // 28.08.2026, round 14). Asking "is the buffer full yet" and then adding every
  // fresh identity the line brought was no ceiling: a single `console errors:
  // [...]` summary could take the buffer, and the record with it, arbitrarily
  // far past the limit without ever marking the run incomplete. The line is
  // weighed whole.
  it('refuses a single summary line that alone would exceed the ceiling', () => {
    const { state, out } = tapped()
    const many = Array.from({ length: MAX_RED_IDENTITIES + 10 }, (_, i) => `'error ${tag(i)}'`).join(', ')
    out.write(`console errors: [${many}]\n`)
    // Nothing was kept — the line does not fit — and the refusal is LOUD.
    expect(state.lines).toHaveLength(0)
    expect(state.droppedLines).toBe(1)
    // A line that DOES fit is still kept whole afterwards.
    out.write("console errors: ['a red that fits']\n")
    expect(state.lines).toHaveLength(1)
  })

  it('never lets the kept identities exceed the ceiling across several fat lines', () => {
    const { state, out } = tapped()
    const chunk = (from, n) => Array.from({ length: n }, (_, i) => `'error ${tag(from + i)}'`).join(', ')
    out.write(`console errors: [${chunk(0, 400)}]\n`)
    out.write(`console errors: [${chunk(400, 400)}]\n`)
    // The second line's 400 fresh identities do not fit beside the first's 400.
    expect(state.lines).toHaveLength(1)
    expect(state.droppedLines).toBe(1)
    expect(failedChecks(state.lines.join('\n')).length).toBe(400)
    // …and a small line that still fits is taken.
    out.write(`console errors: [${chunk(800, 50)}]\n`)
    expect(failedChecks(state.lines.join('\n')).length).toBe(450)
    expect(state.droppedLines).toBe(1)
  })

  // A REPEATED RED IS ONE IDENTITY, HOWEVER OFTEN THE LINE PRINTS IT (review
  // finding, 28.08.2026, round 14). Counting the line's PARTS instead of its
  // identities made an ordinary repeated-error summary exceed the ceiling and
  // marked the run incomplete — a FALSE truncation, which blocks the render set
  // exactly the way this point exists to stop.
  it('counts one repeated red once against the ceiling', () => {
    const { state, out } = tapped()
    const same = Array.from({ length: MAX_RED_IDENTITIES + 100 }, () => "'the one page error'").join(', ')
    out.write(`console errors: [${same}]\n`)
    expect(state.lines).toHaveLength(1)
    expect(state.droppedLines ?? 0).toBe(0)
    expect(failedChecks(state.lines.join('\n'))).toHaveLength(1)
  })

  // A REFUSED LINE REMEMBERS NOTHING (review finding, 28.08.2026, round 14).
  // The varied-measurement map used to be filled before the ceiling was
  // consulted, so a refused line could fill it without a single line being
  // kept; a later, kept red then found no room in it, and its second, different
  // reading was dropped as repetition with nothing marking it — so a narrow
  // charge could own that red on the one reading that survived.
  it('does not let a refused line starve the variation tracking of a kept red', () => {
    const { state, out } = tapped()
    const many = Array.from({ length: MAX_RED_IDENTITIES + 10 }, (_, i) => `'refused ${tag(i)}'`).join(', ')
    out.write(`console errors: [${many}]\n`)
    expect(state.lines).toHaveLength(0)
    expect(state.droppedLines).toBe(1)
    // A red that arrives afterwards is kept, and its measurement IS watched.
    out.write('ERR: the kept error at frame 1: 1.42 m\n')
    out.write('ERR: the kept error at frame 4: 0.02 m\n')
    expect(state.lines).toHaveLength(1)
    const reds = markVariedDetails(failedChecks(state.lines.join('\n')), state.variedKeys)
    expect(reds).toHaveLength(1)
    expect(reds[0].detailVaried).toBe(true)
  })

  // AN IDENTITY CEILING IS NOT A MEMORY BOUND (review finding, 28.08.2026,
  // round 14). A summary repeating ONE error a million times brings a single
  // identity, so it was kept whole — and the retained string grew with the
  // page's output rather than with its red set, which is the exhausted process
  // the whole ceiling exists to prevent.
  it('refuses a single line longer than a line may be, and says so', () => {
    const { state, out } = tapped()
    out.write(`ERR: ${'x'.repeat(MAX_LINE_CHARS + 10)}\n`)
    expect(state.lines).toHaveLength(0)
    expect(state.droppedLines).toBe(1)
  })

  it('stops at the character budget even while identities are still free', () => {
    const { state, out } = tapped()
    // Each line brings ONE new identity and half a line's worth of text, so the
    // budget runs out after about 128 of them — long before the 500 identities.
    const body = 'y'.repeat(Math.floor(MAX_LINE_CHARS / 2))
    const fits = Math.floor(MAX_CAPTURE_CHARS / MAX_LINE_CHARS) * 2
    for (let i = 0; i < fits + 40; i++) out.write(`ERR: page error ${tag(i)} ${body}\n`)
    expect(state.lines.length).toBeLessThan(fits + 40)
    expect(state.lines.length).toBeGreaterThan(fits / 2)
    expect(state.droppedLines).toBeGreaterThan(0)
    expect(state.lines.join('\n').length).toBeLessThanOrEqual(MAX_CAPTURE_CHARS)
  })

  // THE BUDGET BOUNDS THE BUFFER THE PARSER IS HANDED, AND THAT BUFFER IS THE
  // JOINED TEXT (review finding, 28.08.2026, round 17). Weighing each line alone
  // ignored the newline `join` puts between them, so many small lines each just
  // under the ceiling carried the parsed buffer one character per line past it.
  // The case above cannot see it — its lines are 32 KB each, so its handful of
  // newlines disappears in the rounding.
  it('counts the newlines it will join with, so a budget filled EXACTLY cannot overrun it', () => {
    const { state, out } = tapped()
    // Lines that divide the budget exactly: 128 of them sum to MAX_CAPTURE_CHARS
    // to the character, which is where the missing newlines showed. Each mints
    // one fresh identity, so the identity ceiling (500) is never the binding one.
    const fits = 128
    const width = MAX_CAPTURE_CHARS / fits
    const line = (i) => {
      const head = `ERR: page error ${tag(i)} `
      return head + 'y'.repeat(width - head.length)
    }
    for (let i = 0; i < fits + 4; i++) {
      expect(line(i).length).toBe(width)
      out.write(`${line(i)}\n`)
    }
    expect(state.droppedLines).toBeGreaterThan(0)
    expect(state.lines.join('\n').length).toBeLessThanOrEqual(MAX_CAPTURE_CHARS)
  })

  // THE EXACT-CAP CARRY (review finding, 28.08.2026, round 17). A pending line
  // filled to exactly MAX_LINE_CHARS and completed by a LATER write is the one
  // shape that built its probe head out of the whole carry plus a fresh probe
  // slice — past the very cap the branch enforces. The refusal it produces must
  // be the same single one, and the stream must recover.
  it('refuses a line whose carry is filled to exactly the cap by an earlier write', () => {
    const { state, out } = tapped()
    out.write(`ERR: ${'z'.repeat(MAX_LINE_CHARS - 'ERR: '.length)}`)
    out.write('the rest of a line that was already full\n')
    expect(state.lines).toHaveLength(0)
    expect(state.droppedLines).toBe(1)
    out.write('ERR: an ordinary error after it\n')
    expect(state.lines).toEqual(['ERR: an ordinary error after it'])
    expect(state.droppedLines).toBe(1)
  })

  // AND THE ADVERTISED BUDGETS ARE REACHED, NOT MISSED BY ONE (review finding,
  // 28.08.2026, round 18). Proving a capture stays UNDER its ceiling says
  // nothing about premature refusal: a tap that stopped a thousand characters
  // early would pass that assertion and lose reds nobody asked it to lose. So
  // the capture is filled to the character and the exactly-full state is
  // ASSERTED accepted, and only the line after it is refused.
  it('accepts a capture filled to exactly the budget, and refuses only the line after it', () => {
    const { state, out } = tapped()
    const sized = (i, width) => {
      const head = `ERR: page error ${tag(i)} `
      return head + 'y'.repeat(width - head.length)
    }
    for (let i = 0; i < 63; i++) out.write(`${sized(i, MAX_LINE_CHARS)}\n`)
    // One more line, sized to the character so the joined text lands exactly on
    // the ceiling — the separator it will be joined with included.
    const room = MAX_CAPTURE_CHARS - state.lines.join('\n').length - 1
    expect(room).toBeGreaterThan(0)
    expect(room).toBeLessThanOrEqual(MAX_LINE_CHARS)
    out.write(`${sized(900, room)}\n`)
    expect(state.lines.join('\n').length).toBe(MAX_CAPTURE_CHARS)
    expect(state.droppedLines ?? 0).toBe(0)
    // Full to the character, the next result line is refused — loudly.
    out.write(`${sized(901, 200)}\n`)
    expect(state.droppedLines).toBe(1)
    expect(state.lines.join('\n').length).toBe(MAX_CAPTURE_CHARS)
  })

  // The same for the PER-LINE budget: a line of exactly MAX_LINE_CHARS is kept.
  it('keeps a line of exactly the per-line budget, and refuses the one character past it', () => {
    const { state, out } = tapped()
    out.write(`ERR: ${'z'.repeat(MAX_LINE_CHARS - 'ERR: '.length)}\n`)
    expect(state.lines).toHaveLength(1)
    expect(state.lines[0]).toHaveLength(MAX_LINE_CHARS)
    expect(state.droppedLines ?? 0).toBe(0)
    out.write(`ERR: ${'w'.repeat(MAX_LINE_CHARS - 'ERR: '.length + 1)}\n`)
    expect(state.lines).toHaveLength(1)
    expect(state.droppedLines).toBe(1)
  })

  // A BYTE CHUNK IS DECODED IN BOUNDED WINDOWS, and the decoder is kept per
  // stream (review finding, 28.08.2026, round 18). Decoding each write on its
  // own turned a multi-byte character split across two writes into U+FFFD, and
  // built the whole write as a fresh string before any budget looked at it.
  it('reassembles a character split across two byte writes', () => {
    const { state, out, flush } = tapped()
    const bytes = Buffer.from('ERR: page error in the café ☕ pane\n', 'utf8')
    const cut = bytes.indexOf(Buffer.from('☕', 'utf8')) + 1
    out.write(bytes.subarray(0, cut))
    out.write(bytes.subarray(cut))
    flush()
    expect(state.lines.join('\n')).toContain('café ☕')
    expect(state.lines.join('\n')).not.toContain('\uFFFD')
  })

  // EVERY ARRAYBUFFER VIEW IS READ AS BYTES (review finding, 28.08.2026, round
  // 19). A DataView has no `subarray` and fell through to `toString`, so a whole
  // write became the one line "[object DataView]" — past every budget, and with
  // nothing marking the run.
  it('reads a DataView write as the bytes it is, not as its toString', () => {
    const { state, out, flush } = tapped()
    const bytes = Buffer.from('ERR: page error from a DataView write\n', 'utf8')
    out.write(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    flush()
    expect(state.lines).toEqual(['ERR: page error from a DataView write'])
  })

  // AND THE WINDOW WALKS BYTES, NOT ELEMENTS. A view of wider elements measures
  // its `length` in elements, so the decode window advanced twice or four times
  // the bytes it advertises.
  it('decodes a wide-element view by its byteLength', () => {
    const { state, out, flush } = tapped()
    const text = 'ERR: page error carried in sixteen-bit elements\n'
    const bytes = Buffer.from(text, 'utf8')
    const even = bytes.byteLength % 2 === 0 ? bytes : Buffer.concat([bytes, Buffer.from(' ')])
    out.write(new Uint16Array(new Uint8Array(even).buffer))
    flush()
    expect(state.lines.join('\n')).toContain('page error carried in sixteen-bit elements')
  })

  // AND THE DECODE WINDOW IS A WINDOW. One write larger than DECODE_WINDOW_BYTES
  // must come out whole, characters intact across every window boundary — the
  // proof that bounding the decode did not cost the content.
  it('decodes a write far larger than one window without losing a character', () => {
    const { state, out, flush } = tapped()
    // MANY LINES, EACH WITHIN THE PER-LINE BUDGET (review finding, 28.08.2026,
    // round 20). One enormous line would be refused, and asserting "no
    // replacement character" over the empty result that leaves proves nothing.
    // Multi-byte characters at every offset, so a window boundary is bound to
    // land inside one of them.
    const line = (i) => `ERR: page error ${tag(i)} ${'ü☕é'.repeat(200)}`
    const lines = 200
    const whole = Buffer.from(`${Array.from({ length: lines }, (_, i) => line(i)).join('\n')}\n`, 'utf8')
    expect(whole.byteLength).toBeGreaterThan(DECODE_WINDOW_BYTES * 3)
    out.write(whole)
    flush()
    expect(state.lines).toHaveLength(lines)
    expect(state.lines[0]).toBe(line(0))
    expect(state.lines.at(-1)).toBe(line(lines - 1))
    expect(state.lines.join('\n')).not.toContain('\uFFFD')
    expect(state.droppedLines ?? 0).toBe(0)
  })

  // A STRING WRITE MUST NOT OVERTAKE BYTES THE DECODER STILL HOLDS (review
  // finding, 28.08.2026, round 20). A Buffer write ending mid-character leaves
  // those bytes in the decoder; the string then completed the line WITHOUT the
  // half character, and the decoder's tail arrived afterwards as text of its
  // own — a stored red silently renamed, with nothing marking the recording.
  it('keeps a string write behind the bytes an earlier Buffer write left half-read', () => {
    const { state, out, flush } = tapped()
    const bytes = Buffer.from('ERR: the café pane', 'utf8')
    out.write(bytes.subarray(0, bytes.indexOf(Buffer.from('é', 'utf8')) + 1))
    out.write(' failed to draw\n')
    flush()
    // The half character is marked where it really was, and nothing after it
    // moved: no line begins with the decoder's tail.
    expect(state.lines).toHaveLength(1)
    expect(state.lines[0]).toBe('ERR: the caf\uFFFD failed to draw')
  })

  // AND THE DECODERS ARE PER STREAM. Two interleaved half-characters, one on
  // each stream, must each reassemble with their own half and not with the
  // other's — a single shared decoder would splice them together.
  it('keeps a decoder per stream, so two split characters do not splice', () => {
    const { state, out, err, flush } = tapped()
    const a = Buffer.from('ERR: out says café\n', 'utf8')
    const b = Buffer.from('ERR: err says naïve\n', 'utf8')
    const cutA = a.indexOf(Buffer.from('é', 'utf8')) + 1
    const cutB = b.indexOf(Buffer.from('ï', 'utf8')) + 1
    out.write(a.subarray(0, cutA))
    err.write(b.subarray(0, cutB))
    out.write(a.subarray(cutA))
    err.write(b.subarray(cutB))
    flush()
    expect(state.lines).toEqual(['ERR: out says café', 'ERR: err says naïve'])
  })

  // AND THE DECODER IS CLOSED AT THE FLUSH (review finding, 28.08.2026, round
  // 19). Bytes held back for a character the last write cut in half live in the
  // DECODER, not in the pending text, so flushing without closing it dropped
  // them without a trace — from the very line a dying process leaves behind.
  // The half character cannot be recovered, and it must not vanish either: the
  // close marks it, which is what the record then carries.
  it('marks a final character cut in half rather than dropping it silently', () => {
    const { state, out, flush } = tapped()
    const line = Buffer.from('ERR: the last word is café', 'utf8')
    out.write(line.subarray(0, line.length - 1))
    flush()
    expect(state.lines).toEqual(['ERR: the last word is caf\uFFFD'])
  })

  // And a character that arrived WHOLE, with only the newline missing, reaches
  // the record intact — the ordinary shape of a line cut short by a crash.
  it('keeps a whole final character on a line that never got its newline', () => {
    const { state, out, flush } = tapped()
    out.write(Buffer.from('ERR: the last word is café', 'utf8'))
    flush()
    expect(state.lines).toEqual(['ERR: the last word is café'])
  })

  // THE BUDGETS ARE THE RUN'S, NOT EACH STREAM'S (review finding, 28.08.2026,
  // round 22). Every budget case wrote to stdout alone, so a per-stream
  // implementation allowing twice the advertised ceiling would have passed the
  // whole suite. The identities are split across both streams here, and the one
  // ceiling still holds over the pair.
  it('spends ONE identity budget across stdout and stderr together', () => {
    const { state, out, err } = tapped()
    for (let i = 0; i < MAX_RED_IDENTITIES; i++) {
      const stream = i % 2 === 0 ? out : err
      stream.write(`ERR: page error in span ${tag(i)}\n`)
    }
    expect(state.lines).toHaveLength(MAX_RED_IDENTITIES)
    expect(state.droppedLines ?? 0).toBe(0)
    // One past the ceiling, on either stream, is refused.
    err.write(`ERR: page error in span ${tag(MAX_RED_IDENTITIES)}\n`)
    out.write(`ERR: page error in span ${tag(MAX_RED_IDENTITIES + 1)}\n`)
    expect(state.lines).toHaveLength(MAX_RED_IDENTITIES)
    expect(state.droppedLines).toBe(2)
  })

  // THE CHARACTER BUDGET IS THE RUN'S TOO (review finding, 28.08.2026, round
  // 23). Every MAX_CAPTURE_CHARS case wrote to stdout alone, so a per-stream
  // implementation allowing twice the advertised capture would have passed.
  it('spends ONE character budget across stdout and stderr together', () => {
    const { state, out, err } = tapped()
    const sized = (i, width) => {
      const head = `ERR: page error ${tag(i)} `
      return head + 'y'.repeat(width - head.length)
    }
    for (let i = 0; i < 63; i++) (i % 2 === 0 ? out : err).write(`${sized(i, MAX_LINE_CHARS)}\n`)
    const room = MAX_CAPTURE_CHARS - state.lines.join('\n').length - 1
    expect(room).toBeGreaterThan(0)
    err.write(`${sized(900, room)}\n`)
    expect(state.lines.join('\n').length).toBe(MAX_CAPTURE_CHARS)
    expect(state.droppedLines ?? 0).toBe(0)
    // Full to the character, the next line is refused on EITHER stream.
    out.write(`${sized(901, 200)}\n`)
    expect(state.droppedLines).toBe(1)
  })

  // AND THE EXACT PER-LINE BOUNDARY HOLDS WHEN THE NEWLINE ARRIVES SEPARATELY
  // (review finding, 28.08.2026, round 23). One case delivers an exact-size line
  // whole and the other adds text past the cap; neither shows that a pending
  // carry filled to exactly the cap is still ACCEPTED when its newline follows.
  it('keeps an exact-size line whose newline arrives in a later write', () => {
    const { state, out } = tapped()
    out.write(`ERR: ${'z'.repeat(MAX_LINE_CHARS - 'ERR: '.length)}`)
    out.write('\n')
    expect(state.lines).toHaveLength(1)
    expect(state.lines[0]).toHaveLength(MAX_LINE_CHARS)
    expect(state.droppedLines ?? 0).toBe(0)
  })

  // EVERY OVERLONG STDERR LINE IS A LOST LINE (review finding, 28.08.2026, round
  // 23, corrected in round 24). Stderr is where the crash evidence arrives, and
  // a line cut at the per-line budget is evidence nobody read: CRASH_LINE's
  // stack-frame alternative needs the trailing :line:column, which a
  // pathological path pushes past the probe. Refusing only the UNDECIDABLE ones
  // left a crash frame short enough to recognise but too long to keep recorded
  // as if nothing had been cut — and on exit 0 the crash flag is not written
  // either, so such a run came out looking complete.
  it('records every overlong stderr line as a lost line, decidable or not', () => {
    const { state, err } = tapped()
    err.write(`    at run (/${'d'.repeat(MAX_LINE_CHARS)}/polish.mjs:89:7)\n`)
    // The tail that would say "crash" is past the probe, so nothing claims the
    // process died — but the loss is on the record.
    expect(state.crashed).toBe(false)
    expect(state.droppedLines).toBe(1)
    expect(state.lines).toHaveLength(0)
    // A headline DOES decide within the probe: the crash is marked, and the cut
    // line is still recorded as lost, which is the closure route it needs.
    const other = tapped()
    other.err.write(`TimeoutError: ${'x'.repeat(MAX_LINE_CHARS)}\n`)
    expect(other.state.crashed).toBe(true)
    expect(other.state.droppedLines).toBe(1)
  })

  // AND THE RUN THAT SHOWED IT: a recognisable crash frame, too long to keep,
  // on a process that still ended 0 (review finding, 28.08.2026, round 24). The
  // record came out looking complete — no reds, no crash flag, nothing dropped —
  // which is the silent half-recording this point exists to end.
  it('records an exit-0 run whose overlong crash frame was cut as INCOMPLETE', async () => {
    const run = await armed('polish')
    const before = process.stderr.write
    const wrapper = process.stderr.write
    process.stderr.write = (chunk, ...rest) => {
      wrapper.call(process.stderr, chunk, ...rest)
      return true
    }
    process.stderr.write(`    at run (/${'d'.repeat(MAX_LINE_CHARS)}/polish.mjs:89:7)\n`)
    process.stderr.write = before
    const record = run.exit(0)
    expect(record.droppedLines).toBe(1)
    expect(record.truncated).toBe(true)
    expect(runVerdict(record, { openPoints: [642] }).status).toBe('incomplete')
    expect(runVerdict(record, { openPoints: [642] }).covers).toBe(false)
  })

  // A line WITHIN the per-line budget that brings nothing new costs nothing,
  // however long it is — counting it would be a FALSE truncation, and a false
  // truncation blocks the gate.
  it('drops a long REPETITION for free, without calling it a truncation', () => {
    const { state, out } = tapped()
    out.write('ERR: the one page error\n')
    out.write(`ERR: the one page error${' '.repeat(Math.floor(MAX_LINE_CHARS / 2))}\n`)
    expect(state.lines).toHaveLength(1)
    expect(state.droppedLines ?? 0).toBe(0)
  })

  // AND THE REFUSAL DOES NOT DEPEND ON HOW THE PROCESS CHUNKED ITS WRITES
  // (review finding, 28.08.2026, round 15). An overlong line assembled across
  // several writes is damaged by the pending cap and refused; one delivered
  // whole was dropped for free where its content happened to be repetition, so
  // the same output was a truncation or not depending on the write boundaries.
  // The per-line budget is now asked of every result line, before it is parsed.
  it('refuses an overlong line the same way however it arrived', () => {
    const whole = tapped()
    whole.out.write(`ERR: page error${'z'.repeat(MAX_LINE_CHARS)}\n`)
    expect(whole.state.lines).toHaveLength(0)
    expect(whole.state.droppedLines).toBe(1)

    // THE SAME LINE, TO THE CHARACTER (review finding, 28.08.2026, round 24).
    // The split case used to append twice as much text as the whole one, so a
    // chunk-dependent bug near the boundary could pass on the length difference
    // rather than on the invariance the case claims.
    const split = tapped()
    const body = 'z'.repeat(MAX_LINE_CHARS)
    split.out.write('ERR: page error')
    for (let i = 0; i < 4; i++) split.out.write(body.slice((i * body.length) / 4, ((i + 1) * body.length) / 4))
    split.out.write('\n')
    expect(split.state.lines).toHaveLength(0)
    expect(split.state.droppedLines).toBe(1)
    // Both streams recover: the next whole line is kept normally.
    for (const t of [whole, split]) {
      t.out.write('ERR: an ordinary error after the flood\n')
      expect(t.state.lines).toEqual(['ERR: an ordinary error after the flood'])
      expect(t.state.droppedLines).toBe(1)
    }
  })

  // ...AND THE VARIED MEASUREMENT IS ASKED PER RED, NOT PER LINE (review
  // finding, 28.08.2026). Two summary lines with DIFFERENT membership have two
  // different composite keys, so both are kept and the line comparison never
  // ran — while `failedChecks` still keeps only the FIRST reading of the error
  // they share. That second reading was lost with nothing marking it, which is
  // exactly the silent loss this mechanism exists to prevent.
  it('marks a shared error whose measurement varied between two differently-made lines', () => {
    const { state, out } = tapped()
    out.write("console errors: ['the shared error at frame 1: 1.42 m', 'the second error']\n")
    out.write("console errors: ['the shared error at frame 4: 0.02 m', 'a THIRD error only this line saw']\n")
    // Both lines are kept — their membership differs — so every red survives.
    expect(state.lines).toHaveLength(2)
    const reds = markVariedDetails(failedChecks(state.lines.join('\n')), state.variedKeys)
    // The shared error reached the record ONCE, carrying the first reading.
    const shared = reds.filter((r) => r.name.includes('the shared error at frame'))
    expect(shared).toHaveLength(1)
    expect(shared[0].detail).toContain('1.42 m')
    // ...and it is marked, so a narrow charge refuses it instead of owning it
    // on the one reading that survived.
    expect(shared[0].detailVaried).toBe(true)
    const narrow = [{ point: 999, match: /the shared error/i, detailMatch: /1\.42 m/, why: 'the first reading' }]
    expect(chargeFor(shared[0], { ledger: narrow })).toBeNull()
    // The reds that printed once are NOT marked — the mark is per red identity,
    // never a property of the line they arrived on.
    for (const r of reds.filter((x) => !x.name.includes('the shared error at frame'))) {
      expect(r.detailVaried, r.name).toBeUndefined()
    }
  })

  it('joins a line split across two writes', () => {
    const { state, out } = tapped()
    out.write('FAIL  a check ')
    out.write('cut in half\n')
    expect(state.lines).toEqual(['FAIL  a check cut in half'])
  })

  it('flushes a last line that never got its newline', () => {
    const { state, out, flush } = tapped()
    out.write('FAIL  the run died mid-line')
    expect(state.lines).toEqual([])
    flush()
    expect(state.lines).toEqual(['FAIL  the run died mid-line'])
  })

  it('reads a Buffer write', () => {
    const { state, out } = tapped()
    out.write(Buffer.from('FAIL  a buffered check\n', 'utf8'))
    expect(state.lines).toEqual(['FAIL  a buffered check'])
  })

  it('never lets a collector failure reach the suite', () => {
    const { out } = tapped()
    const hostile = {
      toString() {
        throw new Error('hostile chunk')
      },
    }
    expect(() => out.write(hostile)).not.toThrow()
    expect(out.written.length).toBe(1)
  })
})

describe('tapOutput — a run that DIED rather than reported', () => {
  // WHAT THIS FAKE CANNOT PROVE (four-eyes finding F4): node prints an UNCAUGHT
  // exception from C++ straight to fd 2, so it never reaches a patched
  // stream.write at all. This case pins the probe for the stderr a suite writes
  // ITSELF; the real crash path is the uncaughtExceptionMonitor wiring below,
  // and the child-process case after it proves node really fires it.
  it('flags a stack trace on stderr as a crash', () => {
    const { state, err } = tapped()
    err.write('TimeoutError: page.waitForFunction: Timeout 300000ms exceeded\n    at run (/x/benchmark.mjs:89:7)\n')
    expect(state.crashed).toBe(true)
  })

  it('does not flag an ordinary red — a suite that reports is not a suite that crashed', () => {
    const { state, out, err } = tapped()
    out.write('FAIL  the goat stance — worst travel 0.967\n')
    err.write('vite dev server ready\n')
    expect(state.crashed).toBe(false)
  })
})

describe('the captured lines charge the way the guard reads them', () => {
  it('turns a red run\'s output into charged reds', () => {
    const { state, out, flush } = tapped()
    out.write('PASS  a check that held\n')
    out.write('FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967\n')
    out.write('ERR: [ASSERT] render-resource-leak — renderTargets grew back at place:maasai-village: 19 -> 22\n')
    out.write('FAIL  a NEW check nobody has filed — 3 of 4\n')
    flush()
    const reds = chargeReds(failedChecks(state.lines.join('\n')), {
      suite: 'polish',
      backend: 'webgpu',
      featureLevel: 'compatibility',
    })
    const pointOf = (needle) => reds.find((r) => r.name.includes(needle))?.point
    expect(reds.length).toBe(3)
    expect(pointOf('settlement walker (goat)')).toBe(642)
    // The leak was point 546's until it was fixed; with the point ticked its
    // ledger entry expired, so the same line now charges to nobody.
    expect(pointOf('render-resource-leak')).toBeNull()
    expect(pointOf('a NEW check nobody has filed')).toBeNull()
  })

  // AND THROUGH THE REAL EXIT HANDLER (review finding, 28.08.2026, round 20).
  // The case below builds the stored red by hand from the tap's lines, so it
  // would pass even if the recorder dropped the detail on its way to the record
  // — which is the exact defect this whole section is about.
  it('writes the printed measurement into the RECORD, through the real exit handler', async () => {
    const run = await armed('polish', 'compatibility')
    process.stdout.write('FAIL  no child walks without getting anywhere — worst child 1 at 22.2s, 1.42 m walked inside 0.31 m\n')
    const record = run.exit(1)
    expect(record.reds).toHaveLength(1)
    expect(record.reds[0].detail).toContain('1.42 m walked inside 0.31 m')
    expect(record.reds[0].point).toBe(694)
    // And the stored red is chargeable again when it is RE-READ from the record,
    // which is the retroactivity the detail exists for.
    expect(chargeFor(record.reds[0], { suite: 'polish', backend: 'webgpu', featureLevel: 'compatibility' })?.point).toBe(694)
  })

  it('keeps the printed measurement on the stored red, through the real tap', () => {
    // A red that reaches the record carries the MEASUREMENT it printed, not
    // only its name (point 734, review finding F1). Without it the ledger's
    // narrowest instrument — `detailMatch` — could never be applied to a run
    // already on disk, so an entry written today reached nothing recorded
    // yesterday, which is the retroactivity this point exists to deliver.
    const { state, out, flush } = tapped()
    out.write('FAIL  no child walks without getting anywhere — worst child 1 at 22.2s, 1.42 m walked inside 0.31 m\n')
    flush()
    const [stored] = chargeReds(failedChecks(state.lines.join('\n')), {
      suite: 'polish',
      backend: 'webgpu',
      featureLevel: 'compatibility',
    })
    expect(stored.detail).toContain('1.42 m walked inside 0.31 m')
    expect(stored.point).toBe(694)
  })

  it('refuses a NARROW charge when the same check printed two different measurements', () => {
    // The record holds one entry per check key, so the second measurement of a
    // check that failed twice is dropped (review finding, 28.08.2026). If a
    // signature matched the FIRST one, the second — which nothing owns — would
    // disappear behind the charge. It is marked instead, and the narrow charge
    // refuses it: loudly uncharged beats quietly excused.
    const { state, out, flush } = tapped()
    out.write('FAIL  no child walks without getting anywhere — worst child 1 at 22.2s, 1.42 m walked inside 0.31 m\n')
    out.write('FAIL  no child walks without getting anywhere — worst child 4 at 51.0s, 0.02 m walked inside 0.30 m\n')
    flush()
    // The buffer kept ONE line for the key — and remembered that a second,
    // different one came.
    expect(state.lines).toHaveLength(1)
    expect(state.variedKeys.size).toBe(1)
    const output = state.lines.join('\n')
    const [stored] = chargeReds(markVariedDetails(failedChecks(output), state.variedKeys), {
      suite: 'polish',
      backend: 'webgpu',
      featureLevel: 'compatibility',
    })
    expect(stored.detailVaried).toBe(true)
    expect(stored.point).toBeNull()
    // The mark survives to the RE-READ, or owned() would charge afterwards what
    // the recorder refused.
    expect(chargeFor(stored, { suite: 'polish', backend: 'webgpu' })).toBeNull()

    // One measurement, one reading: the ordinary case is untouched.
    const single = tapped()
    single.out.write('FAIL  no child walks without getting anywhere — worst child 1 at 22.2s, 1.42 m walked inside 0.31 m\n')
    single.flush()
    const one = single.state.lines.join('\n')
    const [ok] = chargeReds(markVariedDetails(failedChecks(one), single.state.variedKeys), {
      suite: 'polish',
      backend: 'webgpu',
      featureLevel: 'compatibility',
    })
    expect(ok.detailVaried).toBeUndefined()
    expect(ok.point).toBe(694)
  })

  it('charges the same output to the OTHER point on the other lane, where the goat red is real', () => {
    // The WebGPU entry disclaims the hardware lane in its own words, so a
    // hardware-lane occurrence is charged to nobody and blocks. Charging it to
    // the point that must classify it was tried and refused by the cross-vendor
    // review: an open owner would excuse every later red of the same wording on
    // the lane whose verdicts we trust.
    // THE OWNER MOVED 20.08.2026 from 506 to 642, which inherited its mechanism
    // when 506 was folded away — a charge to a ticked point expires. Only the
    // number changed; the lane split this case pins did not.
    const lines = 'FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967'
    const reds = chargeReds(failedChecks(lines), { suite: 'polish', backend: 'webgl' })
    expect(reds.map((r) => r.point)).toEqual([null])
  })

  it('charges a render-target leak to nothing, at maasai-village or anywhere else', () => {
    // Point 546 fixed the maasai-village leak and its entry left the ledger
    // with the tick, so no leak line is excused any more — wherever it appears,
    // it is a red the change under review has to answer for.
    for (const place of ['maasai-village|medium', 'cairo']) {
      const line = `ERR: [ASSERT] render-resource-leak — renderTargets grew back at place:${place}: 19 -> 22 (+3, allowed +2)`
      expect(chargeReds(failedChecks(line), { suite: 'polish', backend: 'webgl' }).map((r) => r.point)).toEqual([null])
    }
  })

  it('charges a red to nothing outside the suite its evidence was taken in (F2)', () => {
    const line = 'FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967'
    const lane = { backend: 'webgpu', featureLevel: 'compatibility' }
    expect(chargeReds(failedChecks(line), { suite: 'flow', ...lane }).map((r) => r.point)).toEqual([null])
    expect(chargeReds(failedChecks(line), { suite: 'polish', ...lane }).map((r) => r.point)).toEqual([642])
    // Nor outside the LANE it was taken on: the entry rests on the measured
    // compatibility adapter, so the core one the player runs stays red.
    expect(chargeReds(failedChecks(line), { suite: 'polish', backend: 'webgpu', featureLevel: 'core' }).map((r) => r.point)).toEqual([null])
  })
})

describe('the armed recorder — the REAL wiring, not a stand-in', () => {
  const openPoints = [642]

  it('records a red run with its charged reds, and the run then accounts', async () => {
    const run = await armed('polish', 'compatibility')
    process.stdout.write('FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967\n')
    const record = run.exit(1)
    expect(record.exit).toBe(1)
    expect(record.crashed).toBe(false)
    expect(record.featureLevel).toBe('compatibility')
    expect(record.reds.map((r) => r.point)).toEqual([642])
    expect(runVerdict(record, { openPoints }).status).toBe('accounted')
  })

  // THE SAME RUN ON THE ADAPTER THE PLAYER USES (review finding, 28.08.2026,
  // round 17). The entry rests on the measured compatibility lane, so the red
  // it excuses there is unexplained on core — end to end through the real tap,
  // not only through chargeFor.
  it('leaves the same red unaccounted when the run came up on the core adapter', async () => {
    const run = await armed('polish', 'core')
    process.stdout.write('FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967\n')
    const record = run.exit(1)
    expect(record.featureLevel).toBe('core')
    expect(record.reds.map((r) => r.point)).toEqual([null])
    expect(runVerdict(record, { openPoints }).status).toBe('red')
  })

  // THE TRUNCATION-VERSUS-CRASH BOUNDARY, ON THE REAL WIRING (review finding,
  // 28.08.2026, round 20). The suite models an exhausted process as one that
  // DIES, and a run that both refused a result line and then died is exactly
  // that shape — yet no case combined the two. A crash outranks the truncation,
  // so the record blocks as a crash and still owes the second signature for the
  // lines nobody read.
  it('records a run that refused a line AND then died as a crash that also lost output', async () => {
    const run = await armed('polish')
    process.stdout.write('FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967\n')
    process.stdout.write(`ERR: ${'z'.repeat(MAX_LINE_CHARS + 10)}\n`)
    process.emit('uncaughtExceptionMonitor', new Error('page.waitForFunction: Timeout 300000ms exceeded'))
    const record = run.exit(1)
    expect(record.crashed).toBe(true)
    expect(record.truncated).toBe(true)
    expect(record.droppedLines).toBe(1)
    // The crash outranks the truncation: that is what runVerdict answers.
    expect(runVerdict(record, { openPoints }).status).toBe('red')
    expect(runVerdict(record, { openPoints }).unaccounted[0].name).toMatch(/crash/)
    expect(isIncompleteRecording(record)).toBe(true)
  })

  // THE REAL STDERR WIRING (review finding, 28.08.2026, round 22). Every armed
  // case wrote to stdout, so `armRunRecorder` could have omitted or miswired
  // stderr capture entirely without failing this suite — while stderr is where
  // the crash frames arrive, which is the one signal the crash class rests on.
  it('captures a stack trace written to the REAL stderr, and the reds beside it', async () => {
    const before = process.stderr.write
    const run = await armed('polish')
    const stderrWasWrapped = process.stderr.write !== before
    const wrapper = process.stderr.write
    // The sink goes UNDER the tap, exactly as armed() does for stdout, so the
    // fake stack never reaches the terminal while the tap still sees it.
    process.stderr.write = (chunk, ...rest) => {
      wrapper.call(process.stderr, chunk, ...rest)
      return true
    }
    process.stderr.write('TimeoutError: page.waitForFunction: Timeout 300000ms exceeded\n    at run (/x/polish.mjs:89:7)\n')
    process.stdout.write('FAIL  a check the suite got out before it died — 0.4\n')
    const record = run.exit(1)
    expect(stderrWasWrapped).toBe(true)
    expect(record.crashed).toBe(true)
    expect(record.reds.map((r) => r.name)).toEqual(['a check the suite got out before it died'])
  })

  it('marks a run whose process raised an uncaught exception, and that run never accounts (F1)', async () => {
    const run = await armed('polish')
    process.stdout.write('FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967\n')
    // What node does to a suite that dies at a top-level await: the monitor
    // fires, the exit handler runs afterwards. Emitted here rather than thrown,
    // because a real throw would take the test runner with it — the child
    // process below proves node really fires it.
    process.emit('uncaughtExceptionMonitor', new Error('page.waitForFunction: Timeout 300000ms exceeded'))
    const record = run.exit(1)
    expect(record.crashed).toBe(true)
    expect(runVerdict(record, { openPoints }).status).toBe('red')
  })

  // Point 734, the chosen half: repetition never costs a red. A per-frame flood
  // of one identical error used to overflow the 400-line buffer and turn the run
  // into a half-recorded fragment; now repetition collapses at the capture and
  // every observed red keeps its identity, so a flood like this one produces no
  // truncation at all. (A run really past the stated budgets does — loudly, and
  // the cases above pin that; "no record is ever incomplete" stopped being true
  // when the budgets were added in round 13.)
  it('keeps every observed red under a per-frame flood — no truncation, no marker (point 734)', async () => {
    const run = await armed('polish')
    for (let i = 0; i < 420; i++) {
      process.stdout.write(
        'ERR: [ASSERT] render-resource-leak — renderTargets grew back at place:maasai-village: 19 -> 22\n',
      )
    }
    process.stdout.write('FAIL  a brand-new check nobody has filed — 3 of 4\n')
    const record = run.exit(1)
    expect(record.truncated).toBeUndefined()
    expect(record.droppedLines).toBeUndefined()
    // BOTH reds, each with its identity: the flooded assert and the new check.
    expect(record.reds.map((r) => r.name)).toEqual([
      'a brand-new check nobody has filed',
      'console error: [ASSERT] render-resource-leak — renderTargets grew back at place:maasai-village: 19 -> 22',
    ])
    // An ordinary red, closable the three ordinary ways — never 'incomplete'.
    expect(runVerdict(record, { openPoints }).status).toBe('red')
    expect(runVerdict(record, { openPoints }).covers).toBe(false)
  })

  // THE FLOOD THAT IS NOT REPETITION (review finding, 28.08.2026). Keeping each
  // distinct LINE was no bound at all: a per-frame error whose text carries a
  // counter prints a new distinct line every frame, so the buffer grew without
  // limit — and an exhausted process DIES, which turns a run full of observed
  // reds into a crash record that a signature can then close. The bound is the
  // red's IDENTITY, which the parser normalises the counter out of.
  it('bounds the buffer by the red\'s identity, not by the line, under a counting flood', async () => {
    const run = await armed('polish')
    for (let i = 0; i < 500; i++) {
      process.stdout.write(
        `ERR: [ASSERT] render-resource-leak — renderTargets grew back at place:maasai-village: ${19 + i} -> ${22 + i}\n`,
      )
    }
    const record = run.exit(1)
    // ONE red, not five hundred — and no truncation, because nothing was lost
    // that the record does not name.
    expect(record.reds).toHaveLength(1)
    expect(record.truncated).toBeUndefined()
    expect(record.reds[0].name).toMatch(/render-resource-leak/)
    // And the run says so: the measurement did not hold still, so no narrow
    // charge may own this red on the single reading that survived.
    expect(record.reds[0].detailVaried).toBe(true)
    expect(runVerdict(record, { openPoints }).status).toBe('red')
  })

  it('records a run that hit the ceiling as an INCOMPLETE RECORDING with its way out', async () => {
    const run = await armed('polish')
    for (let i = 0; i < MAX_RED_IDENTITIES + 7; i++) {
      process.stdout.write(`ERR: page error in span ${tag(i)}\n`)
    }
    const record = run.exit(1)
    expect(record.truncated).toBe(true)
    expect(record.droppedLines).toBe(7)
    expect(droppedLinesOf(record)).toBe(7)
    expect(isIncompleteRecording(record)).toBe(true)
    // The record stays BOUNDED — that is the whole point of the ceiling.
    expect(record.reds.length).toBe(MAX_RED_IDENTITIES)
    // And it leaves the guard by the incomplete class, not as an unexplained
    // red and not through a hand-written deferral.
    expect(runVerdict(record, { openPoints }).status).toBe('incomplete')
    // EVERY red it DID record keeps its chargeable name, which is what makes
    // the three closings of point 640 reachable for them.
    expect(record.reds.every((r) => typeof r.name === 'string' && r.name.length > 0)).toBe(true)
    expect(new Set(record.reds.map((r) => r.key)).size).toBe(MAX_RED_IDENTITIES)
  })

  // …and the same at the RECORD, which is where the unbounded growth would
  // actually have been paid for: `record.reds` is re-parsed from the kept lines,
  // so a fat line kept past the ceiling would put every red it carried on disk.
  it('keeps record.reds under the ceiling when the reds arrive on fat summary lines', async () => {
    const run = await armed('polish')
    const chunk = (from, n) => Array.from({ length: n }, (_, i) => `'error ${tag(from + i)}'`).join(', ')
    process.stdout.write(`console errors: [${chunk(0, 400)}]\n`)
    process.stdout.write(`console errors: [${chunk(400, 400)}]\n`)
    const record = run.exit(1)
    expect(record.reds.length).toBe(400)
    expect(record.reds.length).toBeLessThanOrEqual(MAX_RED_IDENTITIES)
    expect(record.truncated).toBe(true)
    expect(record.droppedLines).toBe(1)
    expect(runVerdict(record, { openPoints }).status).toBe('incomplete')
  })

  // AN EXIT CODE OF 0 DOES NOT MAKE A LOST RECORDING COMPLETE (review finding,
  // 28.08.2026, round 17, overturning round 16). Round 16 read a refused line as
  // chatter the accounting never wanted. It is not: `refuse()` is reached only
  // from a RESULT line — a `FAIL`, an `ERR:`, a `console errors:` summary — so
  // this record says the process ended 0 while its own output carried result
  // lines nobody read. Calling that clean made it count as picture COVERAGE,
  // which is the worst thing an unread recording can be taken for.
  it('calls an exit-0 run that dropped RESULT lines an incomplete recording', async () => {
    const run = await armed('polish')
    for (let i = 0; i < MAX_RED_IDENTITIES + 7; i++) {
      process.stdout.write(`ERR: page error in span ${tag(i)}\n`)
    }
    const record = run.exit(0)
    expect(record.droppedLines).toBe(7)
    expect(record.truncated).toBe(true)
    expect(isIncompleteRecording(record)).toBe(true)
    expect(runVerdict(record, { openPoints: [642] }).status).toBe('incomplete')
    expect(runVerdict(record, { openPoints: [642] }).covers).toBe(false)
  })

  // A LOST RECORDING OUTRANKS AN ACCOUNTED-FOR RUN (review finding, 28.08.2026,
  // round 18): the class boundary had no real-wiring case. A run whose every
  // recorded red is charged to an open point would otherwise read `accounted`
  // and COVER its backend — while the lines the cap ate are exactly the ones
  // nobody could charge, which is the whole reason this class exists.
  it('calls a run whose recorded reds are all charged incomplete, not accounted for', async () => {
    const run = await armed('polish', 'compatibility')
    process.stdout.write('FAIL  settlement walker (goat): the planted foot holds its ground spot — 0.967\n')
    // ONE refused line, and EVERY recorded red charged — otherwise the verdict
    // would be red for the uncharged ones and the boundary would never be
    // reached (review finding, 28.08.2026, round 19). The per-line budget is the
    // cheapest way to refuse exactly one line while keeping the record small.
    process.stdout.write(`ERR: ${'z'.repeat(MAX_LINE_CHARS + 10)}\n`)
    const record = run.exit(1)
    expect(record.truncated).toBe(true)
    expect(record.droppedLines).toBe(1)
    expect(record.reds.map((r) => r.point)).toEqual([642])
    // Charged throughout, this record would read ACCOUNTED FOR and COVER its
    // backend. The lines the cap ate are exactly the ones nobody could charge.
    expect(runVerdict({ ...record, truncated: undefined, droppedLines: undefined }, { openPoints })).toMatchObject({
      status: 'accounted',
      covers: true,
    })
    const verdict = runVerdict(record, { openPoints })
    expect(verdict.status).toBe('incomplete')
    expect(verdict.covers).toBe(false)
  })

  // THE VARIED-MEASUREMENT REFUSAL, THROUGH THE REAL EXIT HANDLER (review
  // finding, 28.08.2026, round 19). The case below it recreates the recorder's
  // own ordering by hand — charge, then mark — and would pass even if the real
  // handler charged before applying the mark. Only the armed run can say.
  it('stores a NARROW charge as unowned when the check printed two measurements', async () => {
    const run = await armed('polish', 'compatibility')
    process.stdout.write('FAIL  no child walks without getting anywhere — worst child 1 at 22.2s, 1.42 m walked inside 0.31 m\n')
    process.stdout.write('FAIL  no child walks without getting anywhere — worst child 4 at 51.0s, 0.02 m walked inside 0.30 m\n')
    const record = run.exit(1)
    expect(record.reds).toHaveLength(1)
    expect(record.reds[0].detailVaried).toBe(true)
    expect(record.reds[0].point).toBeNull()
    expect(runVerdict(record, { openPoints: [694] }).status).toBe('red')
  })

  // AND IT KEEPS WHAT IT DID RECORD (review finding, 28.08.2026, round 25). A
  // budget-hit run that still exited 0 kept only the truncation fields, so once
  // its lost part was signed off the reds it DID capture were gone —
  // unchargeable, unfileable, blocking nothing.
  it('keeps the reds an exit-0 truncation captured, so the signed-off run still owes them', async () => {
    const run = await armed('polish', 'compatibility')
    process.stdout.write('ERR: a console error the suite tolerated\n')
    for (let i = 0; i < MAX_RED_IDENTITIES + 7; i++) {
      process.stdout.write(`ERR: page error in span ${tag(i)}\n`)
    }
    const record = run.exit(0)
    expect(record.truncated).toBe(true)
    expect(record.reds.length).toBe(MAX_RED_IDENTITIES)
    expect(record.reds.map((r) => r.name)).toContain('console error: a console error the suite tolerated')
    // Signed off as an incomplete recording, the run is judged by what it still
    // holds — through the route that really judges it, not by stripping the
    // fields — and every one of those reds is unowned, so it keeps blocking.
    const closure = {
      run: runIdentity(record),
      backend: record.backend,
      suite: record.suite,
      at: record.at ?? null,
      droppedLines: record.droppedLines,
      evidence: 'local/verify-logs/ holds the whole run; the flood was the dev server',
    }
    const open = unexplainedRuns([record], 0, { openPoints: [642], incompleteClosures: [closure] })
    expect(open).toHaveLength(1)
    expect(open[0].status).toBe('red')
    expect(open[0].reds.length).toBeGreaterThan(1)
  })

  // And the other half of that rule, unchanged: a genuinely green run prints no
  // result line at all, so it can never reach a budget and is never marked.
  it('leaves a green run whose chatter never reached a budget completely clean', async () => {
    const run = await armed('polish')
    for (let i = 0; i < MAX_RED_IDENTITIES + 7; i++) {
      process.stdout.write(`PASS  a check that held ${tag(i)}\n`)
    }
    const record = run.exit(0)
    expect(record.droppedLines).toBeUndefined()
    expect(record.truncated).toBeUndefined()
    expect(runVerdict(record, { openPoints }).status).toBe('clean')
    expect(runVerdict(record, { openPoints }).covers).toBe(true)
  })

  // The finding the old cap could not survive (round 5, finding 4): hundreds of
  // DISTINCT reds. 60 were stored and the rest silently discarded — observed
  // reds losing their identity, i.e. the half-recording the spec forbids. Now
  // the record carries the whole set. (Distinct in LETTERS, because checkKey
  // folds digits.)
  it('stores hundreds of DISTINCT observed reds whole — no cap discards one', async () => {
    const run = await armed('polish')
    const name = (i) => `check ${String(i).replace(/\d/g, (d) => 'abcdefghij'[Number(d)])} broke`
    for (let i = 0; i < 401; i++) process.stdout.write(`FAIL  ${name(i)} — detail\n`)
    const record = run.exit(1)
    expect(record.truncated).toBeUndefined()
    expect(record.reds.length).toBe(401)
    expect(record.reds[0].name).toBe(name(0))
    expect(record.reds.at(-1).name).toBe(name(400))
    const verdict = runVerdict(record, { openPoints })
    expect(verdict.status).toBe('red')
    // Every one of them still actionable: all 401 are reported unaccounted.
    expect(verdict.unaccounted.length).toBe(401)
  })

  // A flood the suite itself tolerated: exit 0 means every check passed, and
  // with nothing dropped there is nothing unread — the run is a clean pass, as
  // it always was for a tolerated error below the old cap.
  it('leaves an exit-0 run clean under the same flood — nothing was dropped, nothing is unread', async () => {
    const run = await armed('polish')
    for (let i = 0; i < 420; i++) process.stdout.write('ERR: something the suite decided to tolerate\n')
    const record = run.exit(0)
    expect(record.truncated).toBeUndefined()
    expect(record.reds).toBeUndefined()
    expect(runVerdict(record, { openPoints }).status).toBe('clean')
  })

  // The tail line is read whatever the exit code (review, 19.08.2026): a red
  // printed as the process dies carries no newline, and it must reach the record
  // like any other — there is no cap left for it to overflow.
  it('records a red whose line never got its newline, beyond where the old cap ended', async () => {
    const run = await armed('polish')
    for (let i = 0; i < 400; i++) process.stdout.write(`ERR: a tolerated console error #${i}\n`)
    process.stdout.write('FAIL  the line the old cap would have eaten — and it never got its newline')
    const record = run.exit(1)
    expect(record.truncated).toBeUndefined()
    expect(record.reds.map((r) => r.name)).toContain('the line the old cap would have eaten')
    expect(runVerdict(record, { openPoints }).status).toBe('red')
  })

  it('leaves a green run with no accounting at all', async () => {
    const run = await armed('polish')
    const record = run.exit(0)
    expect(record.exit).toBe(0)
    expect(record.reds).toBeUndefined()
    expect(runVerdict(record, { openPoints }).status).toBe('clean')
  })

  // Point 566: the env → record → refusal chain, end to end on the real wiring.
  // The recorder reads the variable the runner set rather than trusting the
  // suite to declare its own partiality, and that stamp is what stops a
  // one-section run from ever counting as backend coverage.
  it('stamps a run started under VERIFY_SECTION partial, and that run never covers', async () => {
    const before = process.env.VERIFY_SECTION
    process.env.VERIFY_SECTION = 'crocodile-ambush'
    try {
      const run = await armed('enrichments')
      const record = run.exit(0)
      expect(record.partial).toBe(true)
      expect(record.section).toBe('crocodile-ambush')
      // Exit 0 and every check green — and still not coverage.
      const verdict = runVerdict(record, { openPoints })
      expect(verdict.status).toBe('partial')
      expect(verdict.covers).toBe(false)
    } finally {
      if (before === undefined) delete process.env.VERIFY_SECTION
      else process.env.VERIFY_SECTION = before
    }
  })

  // Point 595: the record names the TREE it was taken on, so "the full proof ran
  // on the exact merge candidate" is checkable instead of claimed.
  it('records the git HEAD the run was taken on, and whether that tree was dirty', async () => {
    const run = await armed('polish')
    const record = run.exit(0)
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim()
    expect(record.head).toBe(head)
    expect(typeof record.dirty).toBe('boolean')
    // Evidence, not a gate: naming the tree may never change what a run is worth.
    expect(runVerdict(record, { openPoints }).covers).toBe(true)
  })

  it('leaves a run without the variable unstamped, so it can still cover', async () => {
    const before = process.env.VERIFY_SECTION
    delete process.env.VERIFY_SECTION
    try {
      const run = await armed('enrichments')
      const record = run.exit(0)
      expect(record.partial).toBeUndefined()
      expect(record.section).toBeUndefined()
      expect(runVerdict(record, { openPoints }).covers).toBe(true)
    } finally {
      if (before !== undefined) process.env.VERIFY_SECTION = before
    }
  })

  // Point 640: the same chain for the RETRY. The runner knows a run is the second
  // attempt; the suite cannot, and the "PASSED ON RETRY" log line was the only
  // trace it left. Now the record carries it and the gate reads it.
  it('stamps the retry SUSPECT with what the first attempt failed on, and it covers nothing', async () => {
    const before = process.env[RETRY_ENV]
    process.env[RETRY_ENV] = formatSuspectEnv(['settlement walker (goat): the planted foot holds its ground spot'])
    try {
      const run = await armed('polish')
      const record = run.exit(0)
      expect(record.suspect).toBe(true)
      expect(record.suspectOf).toEqual([
        { name: 'settlement walker (goat): the planted foot holds its ground spot', kind: 'check' },
      ])
      const verdict = runVerdict(record, { openPoints })
      expect(verdict.status).toBe('suspect')
      expect(verdict.covers).toBe(false)
    } finally {
      if (before === undefined) delete process.env[RETRY_ENV]
      else process.env[RETRY_ENV] = before
    }
  })

  it('leaves a first attempt unstamped — the runner blanks the variable, so a stale export condemns nothing', async () => {
    const before = process.env[RETRY_ENV]
    process.env[RETRY_ENV] = ''
    try {
      const run = await armed('polish')
      const record = run.exit(0)
      expect(record.suspect).toBeUndefined()
      expect(runVerdict(record, { openPoints }).covers).toBe(true)
    } finally {
      if (before === undefined) delete process.env[RETRY_ENV]
      else process.env[RETRY_ENV] = before
    }
  })
})

describe('node really fires uncaughtExceptionMonitor where the tap cannot see (F1)', () => {
  it('fires it for a top-level-await rejection, whose trace bypasses a patched stderr.write', () => {
    const fixture = [
      "import { writeSync } from 'node:fs'",
      // The tap, as the recorder installs it.
      'let tapped = 0',
      'process.stderr.write = () => { tapped++; return true }',
      'let sawMonitor = false',
      "process.on('uncaughtExceptionMonitor', () => { sawMonitor = true })",
      // writeSync goes to fd 2 directly, so the patched write cannot hide it.
      "process.on('exit', () => writeSync(2, `MONITOR:${sawMonitor} TAPPED:${tapped}\\n`))",
      // Exactly the shape of an uncaught Playwright timeout in a suite.
      "await Promise.reject(new Error('page.waitForFunction: Timeout 300000ms exceeded'))",
    ].join('\n')
    let stderr = ''
    try {
      execFileSync(process.execPath, ['--input-type=module', '-e', fixture], {
        encoding: 'utf8',
        windowsHide: true,
        // Captured, not forwarded: the fixture's crash trace belongs in the
        // assertion, not in the run log.
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      stderr = String(e.stderr ?? '')
    }
    expect(stderr).toMatch(/MONITOR:true/)
    // The tap saw NOTHING of the crash — the finding this fix answers.
    expect(stderr).toMatch(/TAPPED:0/)
  })
})
