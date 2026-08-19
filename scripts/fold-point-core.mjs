// FOLDING A POINT AWAY, as pure decisions (point 614).
//
// WHAT A FOLD IS. Not every point in the work order is delivered; some are
// FOLDED — their content is taken over by another point, or the work they asked
// for turns out to be already done. The tick and the archive move are the same
// as a landing's, but there is no branch, no merge and no gate: nothing was
// built.
//
// WHY IT NEEDED ITS OWN COMMAND (measured 13.08.2026). A point filed and folded
// within the hour could be ticked and archived, but NO board command could give
// it the Erledigt card the dashboard audit then demands: `done` needs a
// current-work card, `promote` needs a queue card, and the Warteschlange is a
// PROJECTION of the OPEN work order the point has just left. The only way past
// it was `--waive-audit`, which bypasses the audit instead of satisfying it. So
// the fold carries its own board path: one command that ticks, archives and
// writes the Erledigt card naming where the content went.
//
// THE ORDER IS FORCED, and it is the opposite of what one would guess. The board
// edit runs AFTER the tick, because `runBoardEdit` refuses to publish a board
// that does not show every OPEN point (`boardMissingPoints`): move the card to
// Erledigt while N is still open in TASKS.md and the publish precondition fires
// on the point being folded. Once the tick is written, N is no longer open and
// the same edit is exactly what the board should say.
//
// WHY THE DECISIONS ARE PURE AND THE DOING IS NOT — the same reason as the
// landing chain beside it (scripts/land-point-core.mjs): everything that goes
// wrong here goes wrong QUIETLY, so every judgment is a function with no I/O,
// pinned in scripts/fold-point-core.test.mjs, and scripts/fold-point.mjs only
// performs what these decide.
import { LandingError, VERDICT, tickAndArchive } from './land-point-core.mjs'
import { closeCard, nowCard, queueCard, toNow } from './board-core.mjs'

export { LandingError }

export const USAGE =
  'usage: node scripts/fold-point.mjs <point> (--into <survivor> | --delivered "<evidence>")\n' +
  '                                   --model "<authoring model>"\n' +
  '                                   [--text "<German card text>" | --text-stdin]\n' +
  '                                   [--next <m> "<status>" | --none "<reason>"]\n' +
  '                                   [--dry] [--no-commit]'

// ── The steps ────────────────────────────────────────────────────────────────

/**
 * The chain, in order. Two adjacencies are load-bearing:
 *
 *   - the BOARD edit runs after the TICK, because the publish precondition reads
 *     the open work order off TASKS.md (see the header);
 *   - the COMMIT runs LAST, so it can carry the whole transition — the tick, the
 *     archive move and whatever tracked file the board edit moved — as one
 *     commit, and so a failed board edit never leaves a commit claiming a fold
 *     the board never got.
 */
export const FOLD_STEPS = Object.freeze([
  { id: 'validate', label: 'check the point, the survivor and the board card' },
  { id: 'tick', label: 'tick the point in the work order' },
  { id: 'archive', label: 'move the block into docs/tasks-archive.md' },
  { id: 'board', label: 'move the queue card into Erledigt and publish' },
  { id: 'commit', label: 'commit the work-order transition' },
])

export const FOLD_STEP_IDS = Object.freeze(FOLD_STEPS.map((s) => s.id))

/** A step's human label, or the id for one this table does not know. */
export const foldStepLabel = (id) => FOLD_STEPS.find((s) => s.id === id)?.label ?? String(id)

// ── The argv ─────────────────────────────────────────────────────────────────

/** Flags that take one value; `--next` takes two and is handled beside them. */
const VALUE_FLAGS = new Set(['--into', '--model', '--text', '--delivered'])

/**
 * Split the argv into its buckets. Pure, so the flag handling is pinned by tests
 * rather than by the shape of one `indexOf` — the same reason `parseDoneArgs`
 * lives in board-core.
 *
 * An UNKNOWN flag is an error rather than a silently ignored word: a mistyped
 * `--delivered` would otherwise fold the point with no evidence text at all.
 */
export function parseFoldArgs(argv) {
  const args = (Array.isArray(argv) ? argv : []).map((a) => String(a))
  const out = {
    number: null,
    into: null,
    delivered: '',
    model: '',
    text: '',
    textStdin: false,
    dry: false,
    noCommit: false,
    next: null,
    nextStatus: '',
    hasNone: false,
    none: '',
  }
  const bad = (message) => new LandingError(message, { step: 'validate', repair: USAGE })
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]
    if (VALUE_FLAGS.has(a)) {
      const v = args[i + 1]
      if (v === undefined || v.startsWith('--')) throw bad(`${a} needs a value`)
      i += 1
      if (a === '--into') {
        if (!/^\d+$/.test(v)) throw bad(`--into takes the SURVIVING point's number, got "${v}"`)
        out.into = Number(v)
      } else if (a === '--model') out.model = v
      else if (a === '--text') out.text = v
      else out.delivered = v
      continue
    }
    if (a === '--next') {
      const v = args[i + 1]
      if (v === undefined || !/^\d+$/.test(v)) throw bad(`--next takes the successor's POINT NUMBER, got "${v ?? ''}"`)
      out.next = Number(v)
      const status = args[i + 2]
      if (status !== undefined && !status.startsWith('--')) {
        out.nextStatus = status
        i += 1
      }
      i += 1
      continue
    }
    if (a === '--none') {
      out.hasNone = true
      const v = args[i + 1]
      if (v !== undefined && !v.startsWith('--')) {
        out.none = v
        i += 1
      }
      continue
    }
    if (a === '--text-stdin') {
      out.textStdin = true
      continue
    }
    if (a === '--dry') {
      out.dry = true
      continue
    }
    if (a === '--no-commit') {
      out.noCommit = true
      continue
    }
    if (/^\d+$/.test(a)) {
      if (out.number != null) throw bad(`two point numbers given (${out.number} and ${a}) — a fold takes ONE`)
      out.number = Number(a)
      continue
    }
    throw bad(`unknown argument "${a}"`)
  }
  return out
}

/**
 * The fold's REASON, as one of two shapes — and never both, never neither.
 *
 * The two are not interchangeable: `--into` says the content lives on in another
 * OPEN point, `--delivered` says there is nothing left to carry because the work
 * is already done. The Erledigt card says which, so the reader of the board
 * never has to guess whether something was dropped.
 */
export function foldReason({ into = null, delivered = '' } = {}) {
  const evidence = String(delivered ?? '').trim()
  const survivor = into == null ? null : Number(into)
  if (survivor != null && evidence) {
    throw new LandingError('a fold takes EITHER --into or --delivered, never both', {
      step: 'validate',
      repair: 'name the surviving point with --into <m>, or the evidence with --delivered "<what shows it is done>"',
    })
  }
  if (survivor == null && !evidence) {
    throw new LandingError('a fold must say WHERE the content went', {
      step: 'validate',
      repair: 'pass --into <m> (the point that now carries it) or --delivered "<what shows the work is already done>"',
    })
  }
  if (survivor != null && (!Number.isInteger(survivor) || survivor <= 0)) {
    throw new LandingError(`--into is not a point number: ${into}`, { step: 'validate', repair: USAGE })
  }
  return survivor != null ? { kind: 'into', into: survivor } : { kind: 'delivered', delivered: evidence }
}

// ── The survivor ─────────────────────────────────────────────────────────────

const openLine = (n) => new RegExp(`^- \\[ \\] ${n}\\.`, 'm')
const tickedLine = (n) => new RegExp(`^- \\[x\\] ${n}\\.`, 'm')

/**
 * May point `into` receive the folded content? It must be OPEN in TASKS.md — a
 * point already archived cannot take work on, and pointing a fold at one would
 * lose the content while the board claims it was kept.
 *
 * Every refusal names its repair, because the caller is one flag away from the
 * right command in each case.
 */
export function resolveSurvivor({ tasksText = '', archiveText = '', number, into } = {}) {
  const n = Number(into)
  if (Number(number) === n) {
    throw new LandingError(`point ${n} cannot be folded into itself`, {
      step: 'validate',
      repair: 'name the OTHER point with --into <m>, or use --delivered when the work is already done',
    })
  }
  if (openLine(n).test(String(tasksText))) return { point: n }
  if (tickedLine(n).test(String(tasksText))) {
    throw new LandingError(`point ${n} is ticked but still sitting in TASKS.md`, {
      step: 'validate',
      repair: `move its block to docs/tasks-archive.md first (tasks-archive-guard is already blocking on it), then fold into an OPEN point`,
    })
  }
  if (new RegExp(`^- \\[[ x]\\] ${n}\\.`, 'm').test(String(archiveText))) {
    throw new LandingError(`point ${n} is ARCHIVED — a closed point cannot take the folded content on`, {
      step: 'validate',
      repair: 'name an OPEN point with --into <m>, or use --delivered "<evidence>" when the work is already done',
    })
  }
  throw new LandingError(`point ${n} is nowhere in the work order`, {
    step: 'validate',
    repair: 'check the number — the survivor must be an OPEN point in TASKS.md',
  })
}

/**
 * Can the board edit be made at all? Asked BEFORE anything is written, because
 * its remedy stops being reachable afterwards: the Warteschlange is derived from
 * the OPEN work order, so a queue card missing for N can be rebuilt while N is
 * still open and never again after the tick.
 */
export function boardCardReady(html, point) {
  const doc = String(html ?? '')
  if (nowCard(doc, point)) return { ok: true, from: 'now' }
  if (queueCard(doc, point)) return { ok: true, from: 'queue' }
  throw new LandingError(`the board carries no card for point ${point} — the fold has nothing to move into Erledigt`, {
    step: 'validate',
    repair:
      `node scripts/board-queue.mjs   (rebuild the Warteschlange while point ${point} is still OPEN — ` +
      'after the tick the queue can no longer derive a card for it)',
  })
}

// ── What the Erledigt card says ──────────────────────────────────────────────

/** German prose ends in a full stop; an evidence string handed in may not. */
const terminate = (text) => (/[.!?…]$/.test(text) ? text : `${text}.`)

/**
 * The German text of the Erledigt card.
 *
 * IT MUST NAME WHERE THE CONTENT WENT. That is the whole reason the fold needed
 * a board path of its own: an Erledigt card reading only "erledigt" would tell
 * the reader on his phone that a point he never saw worked on is finished, with
 * no way to find out what became of it. Naming another point is allowed here and
 * nowhere else — `dashboard-card-topic-guard` exempts the Erledigt section
 * exactly because history cards legitimately narrate cross-point context.
 *
 * A caller-supplied text OVERRIDES this one: a fold whose reason needs a
 * sentence of its own must not have to fight the generator for it.
 */
export function foldCardText({ into = null, delivered = '', text = '' } = {}) {
  const own = String(text ?? '').trim()
  if (own) return own
  const reason = foldReason({ into, delivered })
  if (reason.kind === 'into') {
    return (
      `Eingefaltet in Punkt ${reason.into}: der Inhalt dieses Punktes wird dort weitergeführt. ` +
      'Hier bleibt nichts eigenständig offen.'
    )
  }
  return `Ohne eigenen Punkt erledigt: ${terminate(reason.delivered)} Hier bleibt nichts eigenständig offen.`
}

/**
 * The commit message for the fold, trailer included.
 *
 * THE MODEL CANNOT BE GUESSED, so it is demanded — the same rule as the landing's
 * tick commit: that trailer is the only machine-readable evidence
 * `scripts/model-guard.mjs` has of who authored a commit, and the `commit-msg`
 * hook rejects a trailer naming no model.
 *
 * The subject describes the CHANGE and names no point number (the house rule);
 * the body carries the numbers, where the work order already carries them.
 */
export function foldCommitMessage({ number, into = null, delivered = '', model } = {}) {
  const name = String(model ?? '').trim()
  if (!name) {
    throw new LandingError('no authoring model given for the fold commit', {
      step: 'commit',
      repair: 'pass --model "Claude Opus 5" (the model running this fold) — the trailer is model-guard\'s only evidence',
    })
  }
  const reason = foldReason({ into, delivered })
  const why =
    reason.kind === 'into'
      ? `Point ${number} is folded into point ${reason.into}, which now carries its`
      : `Point ${number} is folded away as already delivered:`
  const tail = reason.kind === 'into' ? 'content; nothing of it stays open on its own.' : terminate(reason.delivered)
  return [
    'Move a folded point out of the open work order',
    '',
    `${why} ${tail}`,
    'Its block moves verbatim into docs/tasks-archive.md so TASKS.md keeps only',
    'the open work.',
    '',
    `Co-Authored-By: ${name} <noreply@anthropic.com>`,
    '',
  ].join('\n')
}

// ── The board transform ──────────────────────────────────────────────────────

/**
 * The ONE board transform of a fold: promote the queue card into current work
 * and close it in the SAME transaction, so the board is never observed with a
 * folded point standing as work in progress.
 *
 * `closeCard`'s refusal is KEPT, deliberately. Promoting strips the two state
 * cards ("nothing is running", "closing duties"), so a fold made while one of
 * them was the only thing in "Woran ich gerade arbeite" would leave that section
 * EMPTY — which the reader reads as "nothing is happening" and the unit layer
 * reads as a failure. The refusal names the two ways out, and this command takes
 * both flags so its own message stays true.
 *
 * A point that already stands as CURRENT WORK skips the promotion: `toNow` needs
 * a queue card, and a board that shows the point in both sections is exactly the
 * double listing the dashboard guard blocks.
 */
export function foldBoardTransform({ point, cardText, stamp, next = null, nextStatus = '', none = '' } = {}) {
  return (html) => {
    const promoted = nowCard(html, point) ? html : toNow(html, point, cardText, { stamp })
    return closeCard(promoted, point, {
      text: cardText,
      end: stamp,
      next: next == null ? null : String(next),
      nextStatus,
      none,
      stamp,
    })
  }
}

// ── The plan, and the summary ────────────────────────────────────────────────

/** The chain as a list of planned steps: { id, label, run, reason }. */
export function planFold({ number, into = null, delivered = '', cardText = '', commit = true } = {}) {
  const reason = foldReason({ into, delivered })
  const steps = FOLD_STEPS.map((s) => ({ id: s.id, label: s.label, run: true, reason: '' }))
  const at = (id) => steps.find((s) => s.id === id)
  at('validate').reason =
    reason.kind === 'into' ? `point ${number} folds into point ${reason.into}` : `point ${number} is already delivered`
  at('tick').reason = `point ${number}`
  at('archive').reason = 'docs/tasks-archive.md'
  at('board').reason = cardText ? `Erledigt: ${cardText}` : 'queue card → Erledigt'
  const c = at('commit')
  c.run = commit
  c.reason = commit ? 'TASKS.md + docs/tasks-archive.md (the board file is git-ignored)' : '--no-commit'
  return { number: Number(number), reason, steps }
}

const MARK = {
  [VERDICT.ok]: 'OK  ',
  [VERDICT.skipped]: 'SKIP',
  [VERDICT.failed]: 'FAIL',
  [VERDICT.notReached]: '--  ',
}

/**
 * THE ONE SUMMARY, as lines — one per step with its verdict, then the overall
 * verdict, then, on a failure, the repair. Same contract as the landing's: this
 * is what the session reads INSTEAD of five tool outputs.
 */
export function formatFoldVerdict({ number, into = null, delivered = '', results = [], error = null } = {}) {
  const rows = Array.isArray(results) ? results : []
  const failed = rows.find((r) => r.verdict === VERDICT.failed)
  const where =
    into != null ? `into point ${into}` : delivered ? `as already delivered: ${delivered}` : 'as already delivered'
  const lines = [`folding point ${number} ${where}`]
  for (const r of rows) {
    const mark = MARK[r.verdict] ?? '?   '
    lines.push(`  ${mark} ${String(r.id).padEnd(8)} ${foldStepLabel(r.id)}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  if (failed) {
    lines.push(`FOLD FAILED at "${failed.id}" — nothing past it ran.`)
    const repair = error?.repair ?? failed.repair
    if (repair) lines.push(`  repair: ${repair}`)
  } else if (rows.length && rows.every((r) => r.verdict === VERDICT.ok || r.verdict === VERDICT.skipped)) {
    lines.push(`FOLDED. Point ${number} is ticked, archived and stands in Erledigt — ${where}.`)
  } else {
    lines.push('FOLD INCOMPLETE — see the marks above.')
  }
  return lines
}

/**
 * The whole validation, in one place: the reason, the tick preview, the survivor
 * and the board card. Returns what the doing half needs; throws a LandingError
 * naming its repair otherwise.
 *
 * NOTHING HAS BEEN WRITTEN when this runs, and that is the point: every refusal
 * a fold can produce is produced here, while a rollback is still free.
 */
export function validateFold({ tasksText = '', archiveText = '', boardHtml = '', number, into = null, delivered = '', text = '' } = {}) {
  const n = Number(number)
  if (!Number.isInteger(n) || n <= 0) throw new LandingError(`not a point number: ${number}`, { step: 'validate', repair: USAGE })
  const reason = foldReason({ into, delivered })
  // The tick is COMPUTED here, before anything moves: a number that is not in
  // TASKS.md, one that appears twice, or one already archived fails while the
  // files are still untouched.
  const moved = tickAndArchive({ tasksText, archiveText, number: n })
  if (reason.kind === 'into') resolveSurvivor({ tasksText, archiveText, number: n, into: reason.into })
  const card = boardCardReady(boardHtml, n)
  return { number: n, reason, moved, card, cardText: foldCardText({ into, delivered, text }) }
}
