// Pure decision core of the container-ask Stop-hook guard
// (container-ask-guard.mjs is the thin fail-open I/O wrapper).
//
// THE RULE (user 04.08.2026, memory container-work-is-mine): no step that runs
// INSIDE the dev container is ever handed back to the user. He granted full
// rights for it, so an install, a package manager, a script invocation or a file
// edit under the workspace is the session's own work. On 04.08.2026 the session
// handed him `sudo bash scripts/verify-host-setup.sh` — which could not work,
// the image gives `node` exactly one passwordless command — and then a
// `docker exec -u root …` line, which the sandbox firewall would have blocked
// for root as well. Two round trips of his time for work that was ours.
//
// WHAT THIS MUST NOT BECOME: a gag. The one thing the session legitimately has
// to ask for is a CAPABILITY that does not exist inside the container at all — a
// right, a device, a mount, a line in the image. A guard that blocked those
// would push the session into failing silently instead of asking, which is worse
// than the problem it fixes. The exemptions below are therefore the actual
// design, not decoration, and they are what the test cases pin down.
//
// HOW IT DECIDES — three factors, never a single keyword:
//   1. a REQUEST addressed to the user (an imperative, a "bitte/please …",
//      "kannst du …", or a fenced command block with a second-person lead-in);
//   2. a CONTAINER STEP in the same block (a command, a script, a repo path);
//   3. no EXEMPTION in the clause that carries the request.
// Everything is judged per BLOCK (a paragraph plus any fenced code attached to
// it) and per CLAUSE, never over the whole message: a windowed scan over the
// full text let one honest sentence clear a demand three sentences away.
//
// FAIL DIRECTION: allow. Every unclear shape falls through to "no finding", and
// the wrapper is fail-open on top of that.

/** How much of the offending clause the block message quotes back. */
export const EXCERPT_CHARS = 160

/**
 * Steps that are UNMISTAKABLY an execution inside the container. These beat the
 * capability exemption below, because none of them is a capability: `docker
 * exec`, `sudo bash …` and `npm run …` are the running of the work itself. The
 * historic pair — `sudo bash scripts/verify-host-setup.sh` and the
 * `docker exec -u root …` line — are both here by construction.
 */
export const EXECUTION_STEP_PATTERNS = [
  { id: 'docker-exec', re: /\bdocker\s+(?:container\s+)?exec\b/i },
  { id: 'sudo-command', re: /\bsudo\s+(?:-\w+\s+)*(?:bash|sh|zsh|node|npm|npx|apt|apt-get|chmod|chown|tee|cp|mv|rm|install)\b/i },
  { id: 'npm-command', re: /\b(?:npm|pnpm|yarn)\s+(?:run|test|install|ci|exec|audit)\b/i },
  { id: 'node-script', re: /\bnode\s+[\w@./-]*\.(?:mjs|cjs|js|ts)\b/i },
  { id: 'shell-script', re: /\b(?:bash|sh|zsh)\s+[\w./-]*\.sh\b/i },
  { id: 'git-command', re: /\bgit\s+(?:add|commit|push|pull|merge|rebase|checkout|reset|clone|fetch|tag|worktree)\b/i },
]

/**
 * Steps that run in the container but MAY legitimately appear inside a
 * capability request — `apt-get install …` is an execution in a terminal and an
 * image line in a Dockerfile, and a repo path is named in half of all sentences.
 * A capability cue near the request therefore exempts these (see the ladder in
 * `judgeRequest`), which the stronger set above it does not allow.
 */
export const CONTAINER_STEP_PATTERNS = [
  ...EXECUTION_STEP_PATTERNS,
  { id: 'package-manager', re: /\b(?:apt|apt-get|apk|dnf|yum|pip3?|dpkg|corepack)\b/i },
  { id: 'shell-tool', re: /\b(?:chmod|chown|mkdir|rmdir|tar|unzip|curl|wget|ln\s+-s)\b/i },
  { id: 'destructive-shell', re: /\brm\s+-[rf]/i },
  { id: 'toolchain', re: /\b(?:npm|npx|pnpm|yarn|vitest|playwright|tsc|vite|eslint|oxlint)\b/i },
  { id: 'git', re: /\bgit\s+[a-z]/i },
  { id: 'repo-path', re: /(?:^|[\s`'"([])(?:\.\/)?(?:scripts|src|docs|public|verification)\/[\w./-]+/ },
  { id: 'dotclaude-path', re: /(?:^|[\s`'"([])\.claude\/[\w./-]+/ },
  { id: 'workspace-path', re: /\/workspace\// },
]

/**
 * A request ADDRESSED to the user. Deliberately action-shaped: a bare "bitte"
 * or a bare "du" is not enough, because an answer that merely mentions a file
 * ("bitte beachte, dass `src/x.ts` jetzt …") is not a handed-over step.
 */
export const REQUEST_PATTERNS = [
  // "bitte / kannst du …" followed by an action verb (either order)
  {
    id: 'de-polite-action',
    re: /\b(?:bitte|kannst du|könntest du|würdest du|magst du)\b[^\n]{0,50}\b(?:ausführen|auszuführen|ausführst|führe?|führst|starte[nst]?|start|installier\w*|setz\w*|trag\w*|füg\w*|ergänz\w*|änder\w*|lösch\w*|leg\w*|öffne|kopier\w*|lauf\w*|mach\w*|erstell\w*|editier\w*|schreib\w*|gib|gebe|nimm|nehme|mount\w*|hinterleg\w*|bau(?:e|en)|erweiter\w*|erlaub\w*|gewähr\w*|richte|schalte|aktivier\w*|konfigurier\w*|run|execute|install|add|edit|create|delete|grant|mount)\b/i,
  },
  {
    id: 'de-action-polite',
    re: /\b(?:ausführen|auszuführen|führe?|führst|starte[nst]?|installier\w*|trag\w*|ergänz\w*|änder\w*|editier\w*)\b[^\n]{0,30}\bbitte\b/i,
  },
  // "führe … aus" / "führ das mal aus" — the historic offender's own shape
  { id: 'de-fuehre-aus', re: /\bführ(?:e|st|t)?\b[^\n]{0,60}\baus\b/i },
  // an imperative opening a line or a list item
  {
    id: 'de-imperative',
    re: /^[\s*\-–>]*(?:bitte\s+)?(?:führe?|starte|installiere|setze|trage|füge|ergänze|ändere|lösche|lege|öffne|kopiere|editiere|erstelle|mach|gib|nimm|mounte|hinterlege|baue|erweitere|erlaube|gewähre|richte|schalte|aktiviere|konfiguriere)\b/im,
  },
  // Obligation modals only. A bare "du kannst …" / "you can …" is how an answer
  // POINTS at something ("du kannst das in `docs/x.md` nachlesen"), and reading
  // it as a demand was the widest false-positive class in the probe over this
  // repository's own German prose. The polite request keeps its own pattern
  // above ("kannst du bitte … ausführen"), so nothing real is lost.
  { id: 'de-modal', re: /\bdu\s+(?:musst|müsstest|solltest|brauchst)\b/i },
  { id: 'de-you-execute', re: /\b(?:du|dir|dein\w*)\b[^\n]{0,60}\b(?:ausführen|auszuführen|ausgeführt werden)\b/i },
  { id: 'en-please-action', re: /\bplease\b[^\n]{0,50}\b(?:run|execute|install|start|add|edit|create|apply|delete|open)\b/i },
  { id: 'en-modal', re: /\byou\s+(?:need to|have to|should|must)\b/i },
  { id: 'en-run-this', re: /\b(?:run|execute)\s+(?:this|that|it|the following|these)\b/i },
  // An English line-start imperative counts only when the line also addresses
  // the user: this project's own documents are full of "- Run the LARGE
  // regression …" instructions, and an answer quoting one is not a hand-over.
  { id: 'en-imperative', re: /^[\s*\-–>]*(?:run|execute|install|open|edit|apply)\b[^\n]{0,80}\b(?:you|your|please)\b/im },
  { id: 'en-go-ahead', re: /\bgo ahead and\b/i },
]

/**
 * Enough to make a fenced command block an ASK when no request verb precedes it
 * ("Bei dir im Terminal:" + a fence). Only used for that one case — as a
 * general request marker these would fire on ordinary prose.
 */
export const SECOND_PERSON_PATTERNS = [
  { id: 'de-second-person', re: /\b(?:du|dir|dich|dein\w*|bei dir|bitte)\b/i },
  { id: 'en-second-person', re: /\b(?:you|your|yours|please)\b/i },
]

/**
 * The clause speaks about what the SESSION did — a command quoted as a report,
 * not handed over. `\bich\b` is the workhorse here: a real hand-over almost
 * never says "I" in the same clause, and clause-level scoping keeps an honest
 * "Ich habe X gebaut, bitte führe Y aus" from clearing its own demand.
 */
// Only the SUBJECT "ich" counts, never "mir"/"mich": "schick mir die Ausgabe von
// `npm run test`" is a hand-over that happens to mention me, and an object
// pronoun would have cleared it. Likewise no bare "Ausgabe"/"Ergebnis" — "run it
// and paste the output" is the demand, not the report.
export const REPORT_CUES = [
  { id: 'de-first-person', re: /\bich\b/i },
  { id: 'de-passive-report', re: /\b(?:wurde[n]?\s+(?:ausgeführt|gestartet|gebaut)|lief(?:en)?|gelaufen|ergab)\b/i },
  { id: 'en-first-person', re: /\b(?:i|i've|i'm)\b/ },
  { id: 'en-report', re: /\b(?:was run|were run|for reference|for the record|fyi)\b/i },
  { id: 'de-info', re: /\b(?:zur info|zum nachlesen|nachvollziehen)\b/i },
]

/**
 * The user is asked to LOOK, JUDGE or DECIDE — the project's normal flow (he
 * judges the deployed picture, he approves a permission prompt, he answers a
 * decision card). None of that is a step inside the container.
 */
export const JUDGEMENT_CUES = [
  { id: 'de-look', re: /\b(?:schau\w*|anschau\w*|ansehen|sieh\w*|sieht|aussehen|aussieht|betrachte|nachles\w*|lies|liest|find(?:e|est)|steht)\b/i },
  { id: 'de-judge', re: /\b(?:beurteil\w*|urteil\w*|meinung|entscheid\w*|bestätig\w*|genehmig\w*|freigab\w*|abnahme|gut genug|bescheid|sag(?:e|st)?\s+mir|antworte)\b/i },
  { id: 'en-judge', re: /\b(?:take a look|have a look|let me know|tell me|looks? right|your call|approve|confirm|decide|review)\b/i },
]

/**
 * A CAPABILITY that does not exist inside the container: a right, a device, a
 * mount, a line in the image, a network allowlist entry, a credential. Asking
 * for one of these — once — is explicitly allowed; that is the whole point of
 * the exemption, and the reason the guard cannot be a keyword blacklist.
 *
 * NOT here, deliberately: the LOCATION of the terminal. "Auf deinem Windows-
 * Terminal" was the second offender's framing, and a `docker exec` into this
 * container is a container step no matter which shell types it.
 */
export const CAPABILITY_CUES = [
  { id: 'rights', re: /\b(?:recht(?:e|en)?|berechtigung\w*|privileg\w*|sudoers?|passwortlos\w*|freischalt\w*|grant|permission\w*|capability|fähigkeit\w*)\b/i },
  { id: 'device-mount', re: /\b(?:mount\w*|einhäng\w*|volume|gerät\w*|device|gpu|usb|kamera|camera)\b/i },
  { id: 'image', re: /\b(?:image|abbild|dockerfile|devcontainer|container-?definition|rebuild|neu bauen|basis-?image)\b/i },
  { id: 'network', re: /\b(?:allowlist|freigabeliste|firewall|proxy|whitelist)\b/i },
  { id: 'credential', re: /\b(?:credential\w*|secret|zugangsdaten|api-?key|token)\b/i },
  { id: 'absent', re: /\b(?:gibt es im container nicht|existiert im container nicht|im container nicht (?:vorhanden|verfügbar)|außerhalb des containers|outside the container|not available inside the container)\b/i },
]

const FENCE_RE = /^\s*(?:```|~~~)/

/**
 * The message as BLOCKS: a paragraph together with any fenced code that follows
 * it (blank lines between lead-in and fence included — that is how a fenced
 * command block is normally written). Blocks are the scope for "is a container
 * step named here", so a lead-in keeps its command and nothing else does.
 */
export function blocksOf(text) {
  const lines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
  const blocks = []
  let current = []
  let inFence = false
  const flush = () => {
    if (current.join('\n').trim() !== '') blocks.push(current.join('\n'))
    current = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      current.push(line)
      continue
    }
    if (inFence) {
      current.push(line)
      continue
    }
    if (line.trim() === '') {
      // A blank run followed by a fence does NOT end the block: the fence
      // belongs to the sentence that introduces it.
      let j = i + 1
      while (j < lines.length && lines[j].trim() === '') j++
      if (j < lines.length && FENCE_RE.test(lines[j])) {
        i = j - 1
        continue
      }
      flush()
      continue
    }
    current.push(line)
  }
  flush()
  return blocks
}

/** A block split into its prose (outside fences) and its fenced code. */
export function splitFence(block) {
  const prose = []
  const code = []
  let inFence = false
  for (const line of String(block ?? '').split('\n')) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      continue
    }
    ;(inFence ? code : prose).push(line)
  }
  return { prose: prose.join('\n'), code: code.join('\n') }
}

/**
 * Prose split into clauses at sentence and comma boundaries. The clause is the
 * scope for the request marker and its exemptions; the container step is looked
 * for in the whole block, because the command usually sits one clause (or one
 * fence) further on.
 */
export function clausesOf(prose) {
  // The separator must be FOLLOWED by whitespace or the end, so `foo.sh`,
  // `devcontainer.json` and `test:unit` stay in one piece — splitting inside a
  // file name once tore a capability cue away from the request it exempts.
  return String(prose ?? '')
    .split(/[.!?;:,](?=\s|$)|\n/)
    .map((c) => c.trim())
    .filter((c) => c !== '')
}

/** The first matching pattern of a list, or null. */
export function firstMatch(patterns, text) {
  const s = String(text ?? '')
  for (const p of patterns) {
    if (p.re.test(s)) return p.id
  }
  return null
}

const excerpt = (s) => {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim()
  return one.length > EXCERPT_CHARS ? `${one.slice(0, EXCERPT_CHARS - 1)}…` : one
}

/**
 * The ladder, applied to one request found in one block. Order is the design:
 * every exemption that can be judged from the clause itself is asked BEFORE the
 * step patterns, and the unmistakable execution steps beat only the WIDER
 * (neighbouring-clause) capability reading — never the clause's own.
 *
 * Returns a finding, or null when the request is allowed.
 */
export function judgeRequest({ block, clause, before = '', after = '', request }) {
  if (firstMatch(REPORT_CUES, clause)) return null
  if (firstMatch(JUDGEMENT_CUES, clause)) return null
  if (firstMatch(CAPABILITY_CUES, clause)) return null

  const execution = firstMatch(EXECUTION_STEP_PATTERNS, block)
  if (execution) return { request, step: execution, kind: 'execution', clause: excerpt(clause) }

  const neighbourhood = [before, clause, after].join(' ')
  if (firstMatch(CAPABILITY_CUES, neighbourhood)) return null

  const step = firstMatch(CONTAINER_STEP_PATTERNS, block)
  return step ? { request, step, kind: 'step', clause: excerpt(clause) } : null
}

/**
 * Every hand-over of a container step found in `text`, at most one per block
 * (a second finding in the same paragraph says nothing new). Empty for any
 * non-string, so the wrapper's fail-open never depends on a throw.
 */
export function findContainerAsks(text) {
  const findings = []
  if (typeof text !== 'string' || text.trim() === '') return findings

  for (const block of blocksOf(text)) {
    const { prose, code } = splitFence(block)
    const clauses = clausesOf(prose)
    const requests = []
    clauses.forEach((clause, i) => {
      const request = firstMatch(REQUEST_PATTERNS, clause)
      if (request) requests.push({ clause, i, request })
    })
    // A fenced command block with a second-person lead-in is an ask even
    // without a request verb ("Bei dir im Terminal:" + the fence).
    if (requests.length === 0 && code && firstMatch(EXECUTION_STEP_PATTERNS, code)) {
      const i = clauses.length - 1
      const clause = clauses[i] ?? ''
      const request = firstMatch(SECOND_PERSON_PATTERNS, clause)
      if (request) requests.push({ clause, i, request: `fence-leadin:${request}` })
    }

    for (const r of requests) {
      const finding = judgeRequest({
        block,
        clause: r.clause,
        before: clauses[r.i - 1] ?? '',
        after: clauses[r.i + 1] ?? '',
        request: r.request,
      })
      if (finding) {
        findings.push(finding)
        break // one per block
      }
    }
  }
  return findings
}

/** The rule and the way out — the block message's fixed half. */
export const REMEDY =
  'NO STEP INSIDE THE CONTAINER IS HANDED BACK TO THE USER: he granted this session full ' +
  'rights on 04.08.2026, so installs, package managers, script invocations and file edits ' +
  'under the workspace are OURS to perform (memory container-work-is-mine). A blocked path ' +
  'means the route is wrong, not that the work is his. FIND THE ROUTE AND TAKE IT — the ' +
  "project's own command, another tool, a different mechanism. If a CAPABILITY is genuinely " +
  'missing — a right, a device, a mount, a line in the container image, a network allowlist ' +
  'entry — ask ONCE for that capability, naming it as a capability, never for the execution ' +
  'of the steps. Then close the turn with what you DID, not with an instruction for him.'

/**
 * Top-level decision on the outgoing answer. `{ block, reason }`, the shape the
 * wrapper and the preflight both read. Total by contract: any bad input, any
 * internal surprise → allow.
 */
export function evaluate(input) {
  try {
    // Read INSIDE the try, never in the parameter list: a destructure in the
    // signature runs before the body, so a hostile/broken input object would
    // throw past the fail-open contract this function promises.
    const { lastText } = input ?? {}
    const findings = findContainerAsks(lastText)
    if (findings.length === 0) return { block: false, reason: '' }
    const listed = findings
      .slice(0, 3)
      .map((f) => `“${f.clause}” (${f.kind === 'execution' ? 'executes' : 'names'} ${f.step})`)
      .join(' | ')
    return {
      block: true,
      reason:
        `Your answer asks the USER to perform a step that runs inside the container: ${listed}. ` +
        REMEDY,
    }
  } catch {
    return { block: false, reason: '' }
  }
}
