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
const IP_MUTATING = new Set(['add', 'del', 'delete', 'change', 'replace', 'append', 'flush', 'set', 'up', 'down'])

/** The sanctioned routes. A segment naming one is never an offence. */
export const SANCTIONED_RE = /scripts[/\\]firewall-(?:allow|rebuild)\.mjs/

/**
 * Unwrap `bash -c '<inner>'` (and sh/zsh/dash) so a mutation hidden in the
 * quoted payload is still scanned. Done BEFORE quotes are blanked, because
 * blanking would otherwise erase exactly this payload.
 *
 * Bounded, so a pathological nesting cannot spin: five levels is far past
 * anything a human writes, and the sixth simply falls through to allow.
 */
export function unwrapShellRunners(command, maxDepth = 5) {
  let text = String(command ?? '')
  const re = /\b(?:bash|sh|zsh|dash|ksh)\s+-[a-z]*c\s+(['"])([\s\S]*?)\1/
  for (let i = 0; i < maxDepth; i++) {
    const m = re.exec(text)
    if (!m) break
    text = text.slice(0, m.index) + ' ' + m[2] + ' ' + text.slice(m.index + m[0].length)
  }
  return text
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
 * The command a segment actually runs, plus its arguments — with `sudo`, `env
 * VAR=…`, `timeout 300` and the rest of the wrapper words peeled off. `sudo -u
 * root` needs its value skipped too, or `root` would read as the command.
 */
export function commandOf(segment) {
  const tokens = String(segment ?? '')
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
    if (/^-[-\w]/.test(t)) {
      // a wrapper's own flag; `-u`/`-g`/`--user`/`--group` also eat their value
      if (/^(?:-u|-g|--user|--group)$/.test(t)) i++
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
    const text = blankQuoted(unwrapShellRunners(command))
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
    'Reading is not blocked: `iptables -L -n`, `iptables -S`, `iptables-save`, `ipset list` all pass.'
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
