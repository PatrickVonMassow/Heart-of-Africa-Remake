#!/usr/bin/env node
// ADDITIVE allowlist top-up for the dev container's egress firewall.
//
// WHY THIS EXISTS (incident 04.08.2026): the only tool the session had for "one
// more host has to be reachable" was `sudo /usr/local/bin/init-firewall.sh` —
// the container's full rebuild. That script FLUSHES every chain and destroys the
// ipset at the top while the default policies stay DROP (a flush clears rules,
// never policies), so from its first line until its last the container is
// sealed. The Bash tool's two-minute default timeout killed one such run at
// exit 143 and the session died with ConnectionRefused: no network, no way to
// ask for help, nothing left to run.
//
// This script is the answer to the common case. It NEVER flushes, NEVER
// destroys, NEVER touches a policy or a chain — it only adds addresses to the
// existing `allowed-domains` ipset. Every failure mode therefore leaves the
// firewall exactly as it was: an add that fails adds nothing. It cannot seal the
// container, which is the whole reason it is a separate script rather than a
// flag on the rebuild.
//
//   node scripts/firewall-allow.mjs                    # top up what this project needs
//   node scripts/firewall-allow.mjs cdn.example.com
//   node scripts/firewall-allow.mjs 1.2.3.4 10.0.0.0/8
//   node scripts/firewall-allow.mjs storage.googleapis.com --net24
//   node scripts/firewall-allow.mjs api.example.com --dry-run
//
// `--net24` adds the /24 around each resolved address, for the rotating CDN
// pools where the address resolved now is not the one the download lands on
// minutes later — the trigger of the incident: `cdn.playwright.dev` redirects to
// Chrome-for-Testing archives on Google's storage pool, the boot-time allowlist
// held one address out of that pool, the browser install failed, and the session
// reached for the rebuild because no smaller tool existed.
//
// With NO argument it tops up exactly that set — the Playwright CDN and its
// Chrome-for-Testing storage, Hugging Face, npm and the API host itself — and
// then VERIFIES each one is actually reachable, so the answer to "did that help?"
// comes from the network rather than from an exit code.
//
// A top-up is NOT persistent: the ipset lives in the kernel and a container
// restart re-runs init-firewall.sh from scratch. A host that is needed on every
// boot belongs in the domain list of `.devcontainer/init-firewall.sh` — this
// script says so when it succeeds, so a one-off does not quietly become the
// permanent arrangement.
import { execFileSync } from 'node:child_process'
import { promises as dns } from 'node:dns'
import { isMainModule } from './is-main.mjs'

/** The ipset init-firewall.sh creates and the OUTPUT chain matches against. */
export const DEFAULT_SET = 'allowed-domains'

/**
 * What a bare `firewall-allow` tops up: the hosts this project reaches for and
 * whose addresses drift. `net24` marks the rotating pools — the ones a single
 * boot-time address does not cover, which is what broke the browser install.
 *
 * `api.anthropic.com` is in here for a reason that is not convenience: it is the
 * host the session itself needs. A container that can reach nothing else can
 * still be repaired from inside as long as that one answers.
 */
export const DEFAULT_TOPUP = [
  { host: 'api.anthropic.com', net24: false },
  { host: 'cdn.playwright.dev', net24: true },
  { host: 'playwright.download.prss.microsoft.com', net24: true },
  { host: 'storage.googleapis.com', net24: true },
  { host: 'huggingface.co', net24: false },
  { host: 'cdn-lfs-us-1.hf.co', net24: false },
  // Where huggingface.co REDIRECTS the Kokoro model download today (measured
  // 04.08.2026): an AWS eu-west-3 pool, so a single boot-time address misses it
  // the same way storage.googleapis.com did. `huggingface.co` being reachable
  // proves nothing about the file — the API host answered 302 while the CDN was
  // unreachable, which is what killed `handwriting` and `voice`.
  { host: 'us.aws.cdn.hf.co', net24: true },
  // The ORT-WASM runtime the TTS worker loads (the other host ttsCache.mjs owns).
  { host: 'cdn.jsdelivr.net', net24: true },
  { host: 'registry.npmjs.org', net24: false },
  // THE REVIEWER'S HOSTS (added 11.08.2026, after a container restart cut them off).
  // `chatgpt.com` carries the Codex endpoint every Sol review speaks to, and Sol is
  // the project's cross-vendor reviewer — without it `review-sol.mjs` hands every
  // review to one of our OWN models and the four-eyes rule quietly loses the
  // decorrelation it exists for. These hosts sit behind Cloudflare and their
  // addresses ROTATE, so a boot-time snapshot goes stale exactly the way
  // storage.googleapis.com did: `.devcontainer/init-firewall.sh` already lists them,
  // yet after the 22:04 restart the resolved addresses were no longer in the set and
  // the review came back as "allowance exhausted" while the account had 96 % left.
  // NOT as /24, though that was the first attempt (GPT-5.6 Sol, 11.08.2026): a /24
  // around a Cloudflare anycast address is 256 addresses SHARED with unrelated
  // proxied hostnames, so it grants far more than the reviewer's endpoint — and it
  // still misses a rotation into a different block, which is the very thing it was
  // meant to cover. It buys reach nowhere and gives away reach everywhere. So exact
  // addresses, HERE rather than in the boot script, which runs once.
  //
  // WHAT THIS DOES NOT DO, stated because two earlier wordings overclaimed it: the
  // re-application does not COVER rotation, it REPAIRS it — and not "within one tick"
  // either, but at the next tick that actually gets to run this and succeeds. A
  // rotated host stays unreachable until then, so a review can still fail; what the
  // mechanism buys is that it heals by itself instead of standing until someone
  // notices. And nothing is ever removed, so yesterday's addresses accumulate for the
  // life of the container; that is a slow widening of the allowlist, and if it ever
  // matters the answer is an expiry on the entries, not a wider mask.
  { host: 'chatgpt.com', net24: false },
  { host: 'auth.openai.com', net24: false },
  { host: 'api.openai.com', net24: false },
]

/** Per-command ceiling. An `ipset add` is instant; anything slower is stuck. */
export const COMMAND_TIMEOUT_MS = 10_000

/** DNS ceiling. The firewall permits port 53 unconditionally, so this is fast. */
export const RESOLVE_TIMEOUT_MS = 15_000

/**
 * Reachability probe ceiling. Short on purpose: a blocked host does not answer
 * at all, and the whole point of this script is that nothing it does can hang
 * long enough to hit a tool timeout.
 */
export const PROBE_TIMEOUT_MS = 8_000

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
const IPV4_CIDR = /^(?:\d{1,3}\.){3}\d{1,3}\/(?:3[0-2]|[12]?\d)$/
const DOMAIN = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i

/** Is every octet in range? A regex alone lets 999.1.1.1 through. */
export function isIpv4(token) {
  if (!IPV4.test(String(token ?? ''))) return false
  return String(token).split('.').every((o) => Number(o) <= 255 && String(Number(o)) === o)
}

/** An IPv4 CIDR block, octets and prefix both in range. */
export function isIpv4Cidr(token) {
  const s = String(token ?? '')
  if (!IPV4_CIDR.test(s)) return false
  return isIpv4(s.split('/')[0])
}

/** A resolvable host name — deliberately strict, so a typo'd flag is not one. */
export function isDomain(token) {
  return DOMAIN.test(String(token ?? ''))
}

/** The /24 an address sits in: 34.5.6.7 → 34.5.6.0/24. */
export function to24(ip) {
  const parts = String(ip).split('.')
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
}

/**
 * Split the argv into targets and options, and REJECT anything that is neither a
 * domain, an address nor a known flag. A silently ignored target would be the
 * worst outcome here: the caller would believe a host was opened and debug the
 * wrong layer for an hour.
 */
export function parseArgs(argv = []) {
  const targets = []
  const unknown = []
  const opts = { net24: false, dryRun: false, verify: true, set: DEFAULT_SET }
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i])
    // `--cidr24` is kept as an alias only so an older note in a transcript still
    // works; `--net24` is the name.
    if (a === '--net24' || a === '--cidr24') opts.net24 = true
    else if (a === '--dry-run' || a === '-n') opts.dryRun = true
    else if (a === '--no-verify') opts.verify = false
    else if (a === '--set') opts.set = String(argv[++i] ?? DEFAULT_SET)
    else if (a.startsWith('-')) unknown.push(a)
    else if (isIpv4(a) || isIpv4Cidr(a) || isDomain(a)) targets.push(a)
    else unknown.push(a)
  }
  return { targets, opts, unknown }
}

/**
 * What to top up: the named targets, or — with none given — the project's own
 * set, each with the /24 treatment its address pool needs. An explicit
 * `--net24` applies to every named target; the default set carries its own
 * per-host answer, because widening a stable host to a /24 opens more than it
 * has to.
 */
export function planTargets(targets = [], { net24 = false } = {}) {
  if (targets.length) return targets.map((target) => ({ target, net24 }))
  return DEFAULT_TOPUP.map(({ host, net24: hostNet24 }) => ({ target: host, net24: net24 || hostNet24 }))
}

/**
 * The ipset arguments for one entry. The ONLY mutating command this script ever
 * builds, and `add … -exist` is idempotent — re-running it is a no-op, never a
 * change of state that some later step has to undo.
 */
export function addArgs(set, entry) {
  return ['ipset', 'add', set, entry, '-exist']
}

/**
 * Which entries a target contributes. Pure, so the expansion is testable without
 * a resolver: `resolved` is the address list DNS gave for a domain.
 */
export function entriesFor(target, resolved = [], { net24 = false } = {}) {
  if (isIpv4Cidr(target)) return [target]
  if (isIpv4(target)) return net24 ? [to24(target)] : [target]
  const out = []
  for (const ip of resolved) {
    if (!isIpv4(ip)) continue
    out.push(net24 ? to24(ip) : ip)
  }
  return [...new Set(out)]
}

/** Run one command, capture its output, never inherit a shell. */
function run(args, { timeout = COMMAND_TIMEOUT_MS } = {}) {
  return execFileSync('sudo', ['-n', ...args], {
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/**
 * Does the ipset exist? `ipset list -n` only NAMES the sets — read-only and
 * instant, no member dump.
 *
 * A missing set is not something this script repairs. Creating it would produce
 * a set nothing matches against (the OUTPUT rule referencing it is gone too),
 * i.e. a silent no-op dressed as success. A missing set means the firewall
 * itself is gone, and the answer to that is the rebuild.
 */
export function setExists(set) {
  try {
    const out = run(['ipset', 'list', '-n'], { timeout: COMMAND_TIMEOUT_MS })
    return out.split('\n').some((line) => line.trim() === set)
  } catch {
    return false
  }
}

/** Resolve a host to IPv4 addresses, bounded. */
async function resolve4(host) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`DNS timeout for ${host}`)), RESOLVE_TIMEOUT_MS).unref(),
  )
  return Promise.race([dns.resolve4(host), timer])
}

/**
 * Is the host actually reachable now? ANY HTTP answer counts — a 404 or a 400
 * came back through the firewall, which is the only question being asked. Only a
 * transport failure means the allowlist did not take.
 *
 * This is the difference between "the command exited 0" and "the thing works".
 * The incident began with an install that failed while everything looked fine.
 */
export async function probeReachable(host, timeoutMs = PROBE_TIMEOUT_MS) {
  try {
    const res = await fetch(`https://${host}/`, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return { ok: true, detail: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, detail: (e && (e.cause?.code || e.name || e.message)) || 'no answer' }
  }
}

const USAGE =
  'usage: node scripts/firewall-allow.mjs [domain|ip|cidr]… [--net24] [--dry-run] [--no-verify] [--set <name>]\n' +
  '       with no target it tops up what this project needs:\n' +
  `         ${DEFAULT_TOPUP.map((d) => d.host).join(', ')}`

async function main(argv) {
  const { targets, opts, unknown } = parseArgs(argv)
  if (unknown.length) {
    console.error(`firewall-allow: not a host, address or known flag: ${unknown.join(', ')}`)
    console.error(USAGE)
    return 1
  }

  const plan = planTargets(targets, opts)
  if (!targets.length) console.log('firewall-allow: no target given — topping up this project’s own set.\n')

  if (!opts.dryRun && !setExists(opts.set)) {
    console.error(
      `firewall-allow: ipset "${opts.set}" does not exist. That means the firewall is not up at all,\n` +
        'not that a host is missing from it — adding to a set nothing matches against would look like\n' +
        'success and change nothing. Rebuild instead:\n' +
        '  node scripts/firewall-rebuild.mjs --run',
    )
    return 2
  }

  // Resolve first, add second, so a resolver failure on one host is reported
  // beside the others instead of aborting the run half-applied.
  const work = []
  for (const { target, net24 } of plan) {
    if (!isDomain(target)) {
      work.push({ target, net24, entries: entriesFor(target, [], { net24 }) })
      continue
    }
    try {
      const resolved = await resolve4(target)
      if (!resolved.length) {
        work.push({ target, net24, entries: [], error: 'resolved to no IPv4 address' })
        continue
      }
      work.push({ target, net24, entries: entriesFor(target, resolved, { net24 }) })
    } catch (e) {
      work.push({ target, net24, entries: [], error: (e && e.message) || 'could not resolve' })
    }
  }

  // One line per TARGET, not per address: the question is always "is this host
  // open now", and a rotating pool would otherwise bury it under ten addresses.
  const width = Math.max(...work.map((w) => w.target.length), 10)
  let failures = 0
  for (const item of work) {
    const label = item.target.padEnd(width)
    if (item.error) {
      console.error(`${label}  — ${item.error}`)
      failures++
      continue
    }
    if (opts.dryRun) {
      console.log(`${label}  would add ${item.entries.length} entr${item.entries.length === 1 ? 'y' : 'ies'}: ${item.entries.join(', ')}`)
      continue
    }
    let added = 0
    const errors = []
    for (const entry of item.entries) {
      try {
        run(addArgs(opts.set, entry))
        added++
      } catch (e) {
        // Additive by construction: a failed add left the firewall untouched, so
        // there is nothing to roll back and no reason to abandon the rest.
        errors.push((e && e.message) || 'failed')
      }
    }
    const how = item.net24 ? ' (as /24 ranges)' : ''
    let line = `${label}  ${added}/${item.entries.length} added${how}`
    if (errors.length) {
      failures++
      line += `  — ${errors[0]}`
    } else if (opts.verify && isDomain(item.target)) {
      const probe = await probeReachable(item.target)
      if (!probe.ok) failures++
      line += `  — ${probe.ok ? 'reachable' : 'STILL UNREACHABLE'} (${probe.detail})`
    }
    console.log(line)
  }

  if (opts.dryRun) {
    console.log('\nPLAN ONLY — nothing was changed.')
    return 0
  }
  console.log(
    '\nThis is a RUNTIME top-up: the ipset lives in the kernel and a container restart re-runs\n' +
      'init-firewall.sh from scratch. A host needed on every boot belongs in the domain list of\n' +
      '.devcontainer/init-firewall.sh.',
  )
  if (failures) {
    console.error(
      `\n${failures} target(s) did not come out reachable. Nothing was flushed and nothing was\n` +
        'undone — the firewall is exactly as it was. If the allowlist itself is gone:\n' +
        '  node scripts/firewall-rebuild.mjs --run',
    )
  }
  return failures ? 4 : 0
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(`firewall-allow: ${e && e.message}`)
      process.exit(1)
    })
}
