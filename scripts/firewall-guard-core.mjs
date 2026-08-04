// Pure decision core of the firewall guard (firewall-guard.mjs is the thin
// fail-open PreToolUse wrapper).
//
// THE RULE: no live firewall command is typed by hand. On 04.08.2026 the session
// ran `sudo /usr/local/bin/init-firewall.sh` through the Bash tool. That script
// flushes every chain and destroys the ipset at the top while the default
// policies stay DROP — a flush clears RULES, never POLICIES — so the container
// is sealed from its first line to its last. The Bash tool's two-minute default
// timeout killed it at exit 143, mid-flush. No network, no way to ask for help,
// session dead with ConnectionRefused. The rule is not "be careful with
// iptables"; it is that the one command with that failure mode must be
// unreachable by hand, and the two safe routes must be the only ones open.
//
// WHAT IT DENIES: a command that MUTATES the packet filter — an iptables flush,
// policy, chain or rule change, an ipset add/destroy/flush, an nft/ufw change,
// a route or link change, and init-firewall.sh in execution position.
//
// WHAT IT LETS THROUGH, deliberately:
//   * every READ: `iptables -L -n`, `iptables -S`, `iptables-save`, `ipset list`,
//     `nft list ruleset`, `ip route`. Reading is how a firewall problem is
//     diagnosed at all, and no read has ever sealed anything.
//   * every MENTION: a quoted command inside an echo, a commit message, a grep
//     pattern, a `cat` of the container script. Blocking prose would make this
//     guard unusable in the very session that has to write about the incident.
//   * the two SANCTIONED routes: `node scripts/firewall-allow.mjs` (additive
//     top-up, cannot seal) and `node scripts/firewall-rebuild.mjs` (detached,
//     watchdogged). A guard that offered no way through would only teach the
//     session to phrase the same command differently.
//
// WHERE THE LINE IS. It catches plausible REPHRASINGS — `eval '…'`, `su -c`,
// an `xargs` pipe, `nsenter`, `env -`, a subshell/brace group/function — because
// those are what someone reaches for when the obvious form is denied and they
// still believe they need it. It does NOT chase deliberate evasion: a
// substituted tool name (`sudo $(which iptables)`), a variable holding it, a
// `node -e`/`python3 -c` one-liner, a renamed copy. The only actor this guard
// protects is the session typing the command, and chasing those buys false
// positives on ordinary substitution and interpreter use rather than safety.
//
// FAIL DIRECTION: allow. Every shape it cannot parse falls through to no
// finding, and the wrapper is fail-open on top of that. A missed mutation costs
// one risky command; a false deny costs the session the ability to work.

/** How much of the offending segment the deny message quotes back. */
export const EXCERPT_CHARS = 160

/** The container's rebuild script, by basename — any path form counts. */
export const FIREWALL_SCRIPT_NAME = 'init-firewall.sh'

/** Prefix words that wrap a command without being one. `sudo` is the big one. */
const WRAPPERS = new Set([
  'sudo',
  'doas',
  'su',
  'env',
  'nohup',
  'setsid',
  'time',
  'command',
  'exec',
  'builtin',
  'nice',
  'ionice',
  'stdbuf',
  'unbuffer',
  'timeout',
  'xargs',
  'nsenter',
  'then',
  'do',
  'else',
])

/** Shells that take a script path as their first non-flag argument. */
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])

/** iptables front-ends. `-save` reads, `-restore`/`-apply` write. */
const IPTABLES_RE = /^(?:ip6?tables)(?:-(?:legacy|nft|translate))?(?:-(?:save|restore|apply))?$/

/**
 * iptables options that CHANGE something. `-L`, `-S`, `-n`, `-v`, `-t` and
 * friends are absent on purpose: a listing is a read.
 */
export const IPTABLES_MUTATING_RE =
  /(?:^|\s)-(?:[AIDRNXFZEP]|-append|-insert|-delete|-replace|-new-chain|-delete-chain|-flush|-zero|-policy|-rename-chain)(?=\s|$)/

/** ipset verbs that change the set (long form and short flag). */
export const IPSET_MUTATING = new Set([
  'add',
  'del',
  'create',
  'destroy',
  'flush',
  'rename',
  'swap',
  'restore',
  '-A',
  '-D',
  '-N',
  '-X',
  '-F',
  '-E',
  '-W',
  '-R',
  '--add',
  '--del',
  '--create',
  '--destroy',
  '--flush',
  '--rename',
  '--swap',
  '--restore',
])

/** ipset verbs that only read. */
export const IPSET_READONLY = new Set([
  'list',
  'save',
  'test',
  'help',
  'version',
  '-L',
  '-S',
  '-T',
  '-h',
  '-v',
  '--list',
  '--save',
  '--test',
  '--help',
  '--version',
])

/** `ip` sub-objects whose verbs can cut the container off. */
const IP_OBJECTS = new Set(['route', 'rule', 'link', 'addr', 'address', 'netns', 'neigh'])

/**
 * `ip` verbs that CHANGE something. `up`/`down` are deliberately absent: they
 * only mutate as the tail of `ip link set … up`, which `set` already catches,
 * while `ip link show up`, `ip -br link show up` and `ip addr show up` are pure
 * READS — `up` there is a filter for the interfaces that are up. Matching it
 * anywhere after the object denied all three, and a guard that blocks ordinary
 * reads gets disarmed by the next session.
 */
const IP_MUTATING = new Set(['add', 'del', 'delete', 'change', 'replace', 'append', 'flush', 'set'])

/**
 * The sanctioned routes. A segment naming one is never an offence.
 * `firewall-guard.mjs` is in here for its `--check '<command>'` self-test: the
 * command it is ASKED about is an argument, never an execution, and without
 * this the guard denied the one call the four-eyes review is told to make.
 */
export const SANCTIONED_RE = /scripts[/\\]firewall-(?:allow|rebuild|guard)\.mjs/

/**
 * Everything that takes a QUOTED command line and runs it: `bash -c '…'` and
 * its shell siblings, `su [user] -c '…'` (with or without a `sudo` in front),
 * and `eval '…'`, which is `bash -c` without the bash. The quote and the
 * payload are the same two groups whichever alternative matched.
 */
export const SHELL_RUNNER_RE =
  /\b(?:(?:bash|sh|zsh|dash|ksh)\s+-[a-z]*c|su(?:\s+(?:-[a-z]+|[\w.-]+))*?\s+-[a-z]*c|eval)\s+(['"])([\s\S]*?)\1/

/**
 * Unwrap a quoted payload (see SHELL_RUNNER_RE) so a mutation hidden inside it
 * is still scanned. Done BEFORE quotes are blanked, because blanking would
 * otherwise erase exactly this payload.
 *
 * Bounded, so a pathological nesting cannot spin: five levels is far past
 * anything a human writes, and the sixth simply falls through to allow.
 */
export function unwrapShellRunners(command, maxDepth = 5) {
  let text = String(command ?? '')
  for (let i = 0; i < maxDepth; i++) {
    const m = SHELL_RUNNER_RE.exec(text)
    if (!m) break
    text = text.slice(0, m.index) + ' ' + m[2] + ' ' + text.slice(m.index + m[0].length)
  }
  return text
}

/**
 * `A | xargs B` runs B with A's output appended to it, so neither half is a
 * command the segment scan can judge on its own: `echo "-F" | xargs sudo
 * iptables` hides the flag on the left, `echo iptables -F | xargs sudo` hides
 * the tool. Fold the pair into ONE synthetic segment — B plus A's arguments —
 * and APPEND it, so both halves keep being judged on their own terms too.
 *
 * The quotes are dropped from the synthetic segment rather than blanked: what
 * the pipe delivers to B is the string, not the quoting around it.
 */
export function foldXargs(command) {
  const text = String(command ?? '')
  const parts = text.split('|')
  const folded = []
  for (let i = 1; i < parts.length; i++) {
    const right = parts[i].trim()
    if (!/^xargs\b/.test(right)) continue
    const producedArgs = parts[i - 1].trim().split(/\s+/).filter(Boolean).slice(1)
    const target = right.replace(/^xargs\b/, '').trim()
    const line = `${target} ${producedArgs.join(' ')}`.replace(/['"]/g, '').trim()
    if (line) folded.push(line)
  }
  return folded.length ? `${text}\n${folded.join('\n')}` : text
}

/**
 * Blank the CONTENT of quoted strings, keeping the quotes so token boundaries
 * survive. This is what makes `echo "sudo iptables -F"`, a commit message and a
 * grep pattern pass while `sudo ipset add allowed-domains "1.2.3.4"` — whose
 * command word sits outside the quotes — still reads as a mutation.
 *
 * KNOWN GAP, in the allow direction: a mutation inside a double-quoted command
 * substitution ("$(sudo iptables -F)") is blanked and missed.
 */
export function blankQuoted(command) {
  let out = ''
  let quote = null
  for (const ch of String(command ?? '')) {
    if (quote) {
      out += ch === quote ? ch : ' '
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      out += ch
      continue
    }
    out += ch
  }
  return out
}

/** Split a command line into the pieces the shell would run separately. */
export function segmentsOf(command) {
  return String(command ?? '')
    .split(/\|\||&&|[;|&\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** The last path component, whichever separator was used. */
export function baseNameOf(token) {
  return String(token ?? '').split(/[/\\]/).pop() ?? ''
}

/**
 * Strip the shell syntax that GROUPS a command without being one: a subshell
 * `( … )`, a brace group `{ …; }` and a function definition `f() { … }`. All
 * three read as ordinary command words otherwise — `(sudo` is not `sudo`, and
 * `-F)` is not the `-F` the mutation pattern looks for.
 */
export function unwrapGrouping(segment) {
  return String(segment ?? '')
    .replace(/^[\s({]+/, '')
    .replace(/^[A-Za-z_]\w*\s*\(\s*\)\s*\{?\s*/, '')
    .replace(/[\s);}]+$/, '')
}

/**
 * The command a segment actually runs, plus its arguments — with `sudo`, `env
 * VAR=…`, `timeout 300` and the rest of the wrapper words peeled off. `sudo -u
 * root` needs its value skipped too, or `root` would read as the command.
 */
export function commandOf(segment) {
  const tokens = unwrapGrouping(segment)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (WRAPPERS.has(baseNameOf(t))) {
      i++
      continue
    }
    if (t === '-' || t === '--') {
      i++ // `env - <cmd>` clears the environment; `--` ends a wrapper's flags
      continue
    }
    if (/^-[-\w]/.test(t)) {
      // a wrapper's own flag; these eat their value too (`sudo -u root`,
      // `nsenter -t 1`) — but never a value that is itself a flag
      if (/^(?:-u|-g|-t|--user|--group|--target)$/.test(t) && !/^-/.test(tokens[i + 1] ?? '-')) i++
      i++
      continue
    }
    if (/^\w+=/.test(t)) {
      i++
      continue
    }
    if (/^\d+(?:\.\d+)?[smhd]?$/.test(t)) {
      i++ // a `timeout` duration
      continue
    }
    break
  }
  return { name: baseNameOf(tokens[i] ?? ''), raw: tokens[i] ?? '', args: tokens.slice(i + 1) }
}

/** The first argument that is not a flag — an ipset verb, an `ip` object. */
function firstWord(args) {
  return args.find((a) => !a.startsWith('-')) ?? ''
}

/**
 * Judge ONE segment. Returns an offence `{ id, what }` or null.
 *
 * Every branch names the tool explicitly rather than pattern-matching a keyword
 * anywhere in the line: `grep -rn iptables scripts/` runs grep, not iptables,
 * and a guard that could not tell those apart would block its own development.
 */
export function offenceIn(segment) {
  const text = String(segment ?? '')
  if (!text.trim()) return null
  if (SANCTIONED_RE.test(text)) return null

  const { name, args } = commandOf(text)
  if (!name) return null

  // The container's rebuild script, run directly or through a shell.
  if (name === FIREWALL_SCRIPT_NAME) return { id: 'init-firewall', what: 'the container firewall rebuild' }
  if (SHELLS.has(name) && args.some((a) => baseNameOf(a) === FIREWALL_SCRIPT_NAME)) {
    return { id: 'init-firewall', what: 'the container firewall rebuild' }
  }

  if (IPTABLES_RE.test(name)) {
    if (/-save$/.test(name)) return null // a dump is a read
    if (/-(?:restore|apply)$/.test(name)) return { id: 'iptables-restore', what: `a ruleset load (${name})` }
    if (IPTABLES_MUTATING_RE.test(' ' + args.join(' '))) {
      return { id: 'iptables-mutate', what: `a packet-filter change (${name})` }
    }
    return null // -L / -S / -n / -t nat -L … : a listing
  }

  if (name === 'ipset') {
    const verb = firstWord(args)
    if (IPSET_READONLY.has(verb)) return null
    if (IPSET_MUTATING.has(verb) || args.some((a) => IPSET_MUTATING.has(a))) {
      return { id: 'ipset-mutate', what: `an allowlist set change (ipset ${verb || '…'})` }
    }
    return null
  }

  if (name === 'nft') {
    const verb = firstWord(args)
    if (!verb || verb === 'list') return null
    return { id: 'nft-mutate', what: `an nftables change (nft ${verb})` }
  }

  if (name === 'ufw') {
    const verb = firstWord(args)
    if (!verb || verb === 'status' || verb === 'show') return null
    return { id: 'ufw-mutate', what: `a ufw change (ufw ${verb})` }
  }

  if (name === 'firewall-cmd') {
    if (args.some((a) => /^--(?:add|remove|reload|set|change|new|delete|permanent)/.test(a))) {
      return { id: 'firewalld-mutate', what: 'a firewalld change' }
    }
    return null
  }

  if (name === 'ip') {
    const object = firstWord(args)
    if (!IP_OBJECTS.has(object)) return null
    const rest = args.slice(args.indexOf(object) + 1).filter((a) => !a.startsWith('-'))
    if (rest.some((a) => IP_MUTATING.has(a))) {
      return { id: 'ip-mutate', what: `a network path change (ip ${object})` }
    }
    return null
  }

  return null
}

/** The first offence in a command line, or null. Never throws. */
export function findOffence(command) {
  try {
    const text = blankQuoted(foldXargs(unwrapShellRunners(command)))
    for (const segment of segmentsOf(text)) {
      const offence = offenceIn(segment)
      if (offence) return { ...offence, excerpt: segment.slice(0, EXCERPT_CHARS) }
    }
    return null
  } catch {
    return null // fail-open: an unparsable line is not evidence of anything
  }
}

/** The deny text. It must leave the caller with a route, not just a refusal. */
export function formatReason(offence) {
  return (
    `BLOCKED — this runs ${offence.what} by hand:\n\n  ${offence.excerpt}\n\n` +
    'On 04.08.2026 exactly this sealed the container. `init-firewall.sh` flushes every chain and\n' +
    'destroys the ipset at the top while the default policies stay DROP (a flush clears rules, never\n' +
    'policies), so the container is unreachable from its first line to its last — and the Bash tool\n' +
    'killed it at its two-minute default timeout, mid-flush. No network, no way to ask for help, the\n' +
    'session died with ConnectionRefused. A hand-typed iptables/ipset change has the same failure\n' +
    'mode with less warning.\n\n' +
    'Take one of the two routes instead:\n' +
    '  • one more host has to be reachable →\n' +
    '      node scripts/firewall-allow.mjs <domain|ip|cidr> [--net24]\n' +
    '      node scripts/firewall-allow.mjs             # tops up this project’s own set\n' +
    '    Additive only: it never flushes, so it cannot seal anything, and it verifies\n' +
    '    afterwards that the host actually answers.\n' +
    '  • the firewall really has to be rebuilt →\n' +
    '      node scripts/firewall-rebuild.mjs          # the plan, changes nothing\n' +
    '      node scripts/firewall-rebuild.mjs --run    # opens the gate, arms a watchdog, detaches\n' +
    '      node scripts/firewall-rebuild.mjs --status # the outcome\n' +
    '    No tool timeout can reach a detached run, and the watchdog re-opens the gate if it fails.\n' +
    '  • sealed already → node scripts/firewall-rebuild.mjs --open (emergency unseal).\n\n' +
    'Reading is not blocked: `iptables -L -n`, `iptables -S`, `iptables-save`, `ipset list` all pass.\n' +
    'WRITING ABOUT IT is not blocked either — but a heredoc is judged line by line, because that is\n' +
    'how a heredoc EXECUTES one. If this was prose (`cat <<EOF` into a doc, an incident note), use the\n' +
    'Write tool for the file instead of piping it through the shell.'
  )
}

/**
 * The guard's verdict for one tool call. Total: it never throws.
 *
 * The input is read INSIDE the try, not destructured in the parameter list — a
 * throwing getter there would escape before the first line of the body, and the
 * fail-open promise would hold everywhere except the one place it is needed.
 */
export function evaluate(input) {
  try {
    const command = (input && input.command) || ''
    const offence = findOffence(command)
    if (!offence) return { block: false, reason: '' }
    return { block: true, reason: formatReason(offence), id: offence.id }
  } catch {
    return { block: false, reason: '' }
  }
}
