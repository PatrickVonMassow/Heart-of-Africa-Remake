// The pure half of the additive allowlist top-up: what counts as a target, what
// entries a target expands to, and the one mutating command shape the script is
// ever allowed to build. The safety property under test is ADDITIVITY — the
// argument builder must never produce a flush, a destroy or a policy change,
// because that is precisely the difference between this script and the rebuild
// that sealed the container on 04.08.2026.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SET,
  DEFAULT_TOPUP,
  addArgs,
  entriesFor,
  isDomain,
  isIpv4,
  isIpv4Cidr,
  parseArgs,
  planTargets,
  to24,
} from './firewall-allow.mjs'

describe('token classification', () => {
  it('accepts well-formed IPv4 addresses', () => {
    expect(isIpv4('1.2.3.4')).toBe(true)
    expect(isIpv4('255.255.255.255')).toBe(true)
    expect(isIpv4('0.0.0.0')).toBe(true)
  })
  it('rejects out-of-range, padded and malformed addresses', () => {
    expect(isIpv4('999.1.1.1')).toBe(false)
    expect(isIpv4('1.2.3')).toBe(false)
    expect(isIpv4('1.2.3.4.5')).toBe(false)
    expect(isIpv4('01.2.3.4')).toBe(false) // padded octet — not a canonical address
    expect(isIpv4('1.2.3.4/24')).toBe(false)
    expect(isIpv4('')).toBe(false)
    expect(isIpv4(undefined)).toBe(false)
  })
  it('accepts CIDR blocks with an in-range prefix', () => {
    expect(isIpv4Cidr('10.0.0.0/8')).toBe(true)
    expect(isIpv4Cidr('192.168.1.0/24')).toBe(true)
    expect(isIpv4Cidr('1.2.3.4/32')).toBe(true)
    expect(isIpv4Cidr('1.2.3.4/0')).toBe(true)
  })
  it('rejects impossible prefixes and bare addresses', () => {
    expect(isIpv4Cidr('10.0.0.0/33')).toBe(false)
    expect(isIpv4Cidr('10.0.0.0')).toBe(false)
    expect(isIpv4Cidr('999.0.0.0/8')).toBe(false)
  })
  it('accepts host names and rejects flags, bare labels and hyphen edges', () => {
    expect(isDomain('api.github.com')).toBe(true)
    expect(isDomain('cdn-lfs-us-1.hf.co')).toBe(true)
    expect(isDomain('storage.googleapis.com')).toBe(true)
    expect(isDomain('localhost')).toBe(false) // single label — never a firewall target here
    expect(isDomain('--cidr24')).toBe(false)
    expect(isDomain('-foo.com')).toBe(false)
    expect(isDomain('foo-.com')).toBe(false)
    expect(isDomain('')).toBe(false)
  })
})

describe('to24', () => {
  it('keeps the first three octets', () => {
    expect(to24('34.5.6.7')).toBe('34.5.6.0/24')
    expect(to24('1.2.3.255')).toBe('1.2.3.0/24')
  })
})

describe('parseArgs', () => {
  it('separates targets from flags and defaults the set', () => {
    const { targets, opts, unknown } = parseArgs(['api.github.com', '1.2.3.4', '10.0.0.0/8'])
    expect(targets).toEqual(['api.github.com', '1.2.3.4', '10.0.0.0/8'])
    expect(opts).toEqual({ net24: false, dryRun: false, verify: true, set: DEFAULT_SET })
    expect(unknown).toEqual([])
  })
  it('reads --net24, --dry-run/-n, --no-verify and --set', () => {
    const { targets, opts } = parseArgs(['--net24', 'a.example.com', '--set', 'other', '-n', '--no-verify'])
    expect(targets).toEqual(['a.example.com'])
    expect(opts.net24).toBe(true)
    expect(opts.dryRun).toBe(true)
    expect(opts.verify).toBe(false)
    expect(opts.set).toBe('other')
  })
  it('still accepts the older --cidr24 spelling as an alias', () => {
    expect(parseArgs(['--cidr24', 'a.example.com']).opts.net24).toBe(true)
  })
  it('reports anything that is neither a target nor a known flag instead of dropping it', () => {
    const { targets, unknown } = parseArgs(['api.github.com', '--flush', 'not a host'])
    expect(targets).toEqual(['api.github.com'])
    expect(unknown).toEqual(['--flush', 'not a host'])
  })
  it('handles an empty argv', () => {
    const { targets, unknown } = parseArgs([])
    expect(targets).toEqual([])
    expect(unknown).toEqual([])
  })
})

describe('the default top-up set', () => {
  it('covers the hosts the incident actually needed', () => {
    const hosts = DEFAULT_TOPUP.map((d) => d.host)
    for (const host of [
      'cdn.playwright.dev',
      'storage.googleapis.com',
      'huggingface.co',
      'registry.npmjs.org',
      'api.anthropic.com',
    ]) {
      expect(hosts, host).toContain(host)
    }
  })
  it('widens exactly the rotating pools to /24 and leaves the stable hosts alone', () => {
    const by = Object.fromEntries(DEFAULT_TOPUP.map((d) => [d.host, d.net24]))
    expect(by['cdn.playwright.dev']).toBe(true)
    expect(by['storage.googleapis.com']).toBe(true)
    expect(by['registry.npmjs.org']).toBe(false)
    expect(by['api.anthropic.com']).toBe(false)
  })
  it('names only well-formed hosts', () => {
    for (const { host } of DEFAULT_TOPUP) expect(isDomain(host), host).toBe(true)
  })
})

describe('planTargets', () => {
  it('falls back to the project set when nothing was named', () => {
    const plan = planTargets([])
    expect(plan.map((p) => p.target)).toEqual(DEFAULT_TOPUP.map((d) => d.host))
    expect(plan.find((p) => p.target === 'storage.googleapis.com').net24).toBe(true)
    expect(plan.find((p) => p.target === 'registry.npmjs.org').net24).toBe(false)
  })
  it('uses the named targets and applies --net24 to all of them', () => {
    expect(planTargets(['a.example.com', '1.2.3.4'], { net24: true })).toEqual([
      { target: 'a.example.com', net24: true },
      { target: '1.2.3.4', net24: true },
    ])
    expect(planTargets(['a.example.com'])).toEqual([{ target: 'a.example.com', net24: false }])
  })
  it('lets an explicit --net24 widen even the stable hosts of the default set', () => {
    expect(planTargets([], { net24: true }).every((p) => p.net24)).toBe(true)
  })
})

describe('entriesFor', () => {
  it('passes a CIDR block through untouched, even with --net24', () => {
    expect(entriesFor('10.0.0.0/8', [], { net24: false })).toEqual(['10.0.0.0/8'])
    expect(entriesFor('10.0.0.0/8', [], { net24: true })).toEqual(['10.0.0.0/8'])
  })
  it('takes a literal address as itself, or as its /24 on request', () => {
    expect(entriesFor('1.2.3.4', [])).toEqual(['1.2.3.4'])
    expect(entriesFor('1.2.3.4', [], { net24: true })).toEqual(['1.2.3.0/24'])
  })
  it('expands a domain to its resolved addresses', () => {
    expect(entriesFor('a.example.com', ['1.2.3.4', '5.6.7.8'])).toEqual(['1.2.3.4', '5.6.7.8'])
  })
  it('collapses a rotating pool to its distinct /24s — the case that broke the browser install', () => {
    const pool = ['34.5.6.7', '34.5.6.9', '34.5.7.1']
    expect(entriesFor('storage.googleapis.com', pool, { net24: true })).toEqual([
      '34.5.6.0/24',
      '34.5.7.0/24',
    ])
  })
  it('drops non-IPv4 answers rather than feeding them to ipset', () => {
    expect(entriesFor('a.example.com', ['1.2.3.4', '::1', 'nonsense'])).toEqual(['1.2.3.4'])
  })
  it('yields nothing for a domain that resolved to nothing', () => {
    expect(entriesFor('a.example.com', [])).toEqual([])
  })
})

describe('addArgs — the only mutating command this script builds', () => {
  it('is an idempotent additive ipset add', () => {
    expect(addArgs('allowed-domains', '1.2.3.4')).toEqual([
      'ipset',
      'add',
      'allowed-domains',
      '1.2.3.4',
      '-exist',
    ])
  })
  it('never builds a flush, destroy, policy or chain change', () => {
    for (const entry of ['1.2.3.4', '10.0.0.0/8', '34.5.6.0/24']) {
      const args = addArgs(DEFAULT_SET, entry)
      expect(args[0]).toBe('ipset')
      expect(args[1]).toBe('add')
      expect(args).not.toContain('destroy')
      expect(args).not.toContain('flush')
      expect(args).not.toContain('create')
      expect(args).not.toContain('-F')
      expect(args).not.toContain('-X')
      expect(args).not.toContain('-P')
      expect(args.some((a) => /iptables/.test(a))).toBe(false)
    }
  })
})
