// Decision sweep of the firewall guard: what counts as a live firewall command
// typed by hand, and — the larger half — everything that must keep working
// beside it. A guard that blocked a listing, a grep or the sanctioned scripts
// would only teach the session to rephrase the command that sealed the
// container, so the pass side carries most of the cases here.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  EXCERPT_CHARS,
  IPSET_MUTATING,
  IPSET_READONLY,
  baseNameOf,
  blankQuoted,
  commandOf,
  evaluate,
  findOffence,
  foldXargs,
  formatReason,
  offenceIn,
  segmentsOf,
  unwrapGrouping,
  unwrapShellRunners,
} from './firewall-guard-core.mjs'
import { GUARDED_TOOLS, commandFrom } from './firewall-guard.mjs'

const blocks = (command) => evaluate({ command }).block
const idOf = (command) => evaluate({ command }).id

describe('the incident itself', () => {
  it('denies the exact command that sealed the container on 04.08.2026', () => {
    expect(blocks('sudo /usr/local/bin/init-firewall.sh')).toBe(true)
    expect(idOf('sudo /usr/local/bin/init-firewall.sh')).toBe('init-firewall')
  })
  it('denies it however it is dressed up — a shell, a relative path, a timeout wrapper', () => {
    expect(blocks('sudo bash /usr/local/bin/init-firewall.sh')).toBe(true)
    expect(blocks('sudo sh /usr/local/bin/init-firewall.sh')).toBe(true)
    expect(blocks('./init-firewall.sh')).toBe(true)
    expect(blocks('/usr/local/bin/init-firewall.sh')).toBe(true)
    // the "fix" someone reaches for first — and it still kills the run mid-flush
    expect(blocks('timeout 300 sudo /usr/local/bin/init-firewall.sh')).toBe(true)
    expect(blocks('nohup sudo /usr/local/bin/init-firewall.sh')).toBe(true)
  })
})

describe('iptables', () => {
  it('denies every mutating form', () => {
    for (const cmd of [
      'sudo iptables -F',
      'sudo iptables -X',
      'sudo iptables -t nat -F',
      'sudo iptables -t mangle -X',
      'sudo iptables -P OUTPUT DROP',
      'sudo iptables -A OUTPUT -j REJECT',
      'sudo iptables -I INPUT 1 -j ACCEPT',
      'sudo iptables -D OUTPUT -j REJECT',
      'sudo iptables -N mychain',
      'sudo iptables -Z',
      'sudo ip6tables -F',
      'sudo iptables-legacy -F',
      'sudo iptables-restore < /tmp/rules',
      'sudo iptables-apply /tmp/rules',
    ]) {
      expect(blocks(cmd), cmd).toBe(true)
    }
  })
  it('lets every read through', () => {
    for (const cmd of [
      'iptables -L -n',
      'sudo iptables -L -n',
      'sudo iptables -L -n -v --line-numbers',
      'iptables -S',
      'sudo iptables -t nat -L -n',
      'sudo iptables -L OUTPUT -n',
      'iptables-save',
      'sudo iptables-save > /tmp/rules.txt',
      'iptables --version',
      'iptables -h',
      'iptables --help',
      'man iptables',
    ]) {
      expect(blocks(cmd), cmd).toBe(false)
    }
  })
  it('is not fooled by a lowercase flag that shares a letter with a mutating one', () => {
    expect(blocks('sudo iptables -L -n')).toBe(false) // -n, not -N
    expect(blocks('sudo iptables -N newchain')).toBe(true)
    expect(blocks('sudo iptables -L -v -x')).toBe(false) // -x, not -X
    expect(blocks('sudo iptables -X oldchain')).toBe(true)
  })
})

describe('ipset', () => {
  it('denies every set change, long form and short flag', () => {
    for (const cmd of [
      'sudo ipset add allowed-domains 1.2.3.4',
      'sudo ipset add allowed-domains 1.2.3.4 -exist',
      'sudo ipset del allowed-domains 1.2.3.4',
      'sudo ipset destroy allowed-domains',
      'sudo ipset flush allowed-domains',
      'sudo ipset create allowed-domains hash:net',
      'sudo ipset -F allowed-domains',
      'sudo ipset -X allowed-domains',
      'sudo ipset restore < /tmp/set',
    ]) {
      expect(blocks(cmd), cmd).toBe(true)
    }
  })
  it('lets every read through', () => {
    for (const cmd of [
      'ipset list',
      'sudo ipset list',
      'ipset list allowed-domains',
      'sudo ipset list -n',
      'ipset test allowed-domains 1.2.3.4',
      'ipset save',
      'ipset --version',
      'ipset --help',
      'ipset help add',
    ]) {
      expect(blocks(cmd), cmd).toBe(false)
    }
  })
  it('keeps the read and write verb sets disjoint', () => {
    for (const verb of IPSET_READONLY) expect(IPSET_MUTATING.has(verb)).toBe(false)
  })
})

describe('the other firewall front-ends and the network path', () => {
  it('denies nft, ufw, firewalld and route/link changes', () => {
    expect(blocks('sudo nft flush ruleset')).toBe(true)
    expect(blocks('sudo nft add rule inet filter output drop')).toBe(true)
    expect(blocks('sudo ufw disable')).toBe(true)
    expect(blocks('sudo ufw deny out 443')).toBe(true)
    expect(blocks('sudo firewall-cmd --add-service=http')).toBe(true)
    expect(blocks('sudo firewall-cmd --reload')).toBe(true)
    expect(blocks('sudo ip route del default')).toBe(true)
    expect(blocks('sudo ip route flush table main')).toBe(true)
    expect(blocks('sudo ip link set eth0 down')).toBe(true)
  })
  it('lets their reads through', () => {
    expect(blocks('nft list ruleset')).toBe(false)
    expect(blocks('sudo nft list tables')).toBe(false)
    expect(blocks('ufw status')).toBe(false)
    expect(blocks('sudo firewall-cmd --state')).toBe(false)
    expect(blocks('ip route')).toBe(false)
    expect(blocks('ip route | grep default')).toBe(false) // the init script's own probe
    expect(blocks('ip route show table all')).toBe(false)
    expect(blocks('ip route get 1.1.1.1')).toBe(false)
    expect(blocks('ip neigh')).toBe(false)
    expect(blocks('ip netns list')).toBe(false)
    expect(blocks('ip -4 addr show')).toBe(false)
    expect(blocks('ip link')).toBe(false)
  })
  // `up` was matched ANYWHERE after the object, so the standard way to list the
  // interfaces that are actually up read as `ip link set … up`. A guard that
  // denies a plain read is a guard the next session disarms.
  it('lets the up-FILTER reads through, which are not `set … up`', () => {
    expect(blocks('ip link show up')).toBe(false)
    expect(blocks('ip -br link show up')).toBe(false)
    expect(blocks('ip addr show up')).toBe(false)
    expect(blocks('ip -br -c link show up')).toBe(false)
  })
  it('still denies the mutation those reads were confused with', () => {
    expect(blocks('sudo ip link set eth0 up')).toBe(true)
    expect(blocks('sudo ip link set eth0 down')).toBe(true)
    expect(blocks('sudo ip link set dev eth0 down')).toBe(true)
  })
})

describe('the sanctioned routes always pass', () => {
  it('never blocks the additive top-up', () => {
    for (const cmd of [
      'node scripts/firewall-allow.mjs',
      'node scripts/firewall-allow.mjs api.github.com',
      'node scripts/firewall-allow.mjs cdn.playwright.dev --net24',
      'node scripts/firewall-allow.mjs 1.2.3.4 10.0.0.0/8 --dry-run',
    ]) {
      expect(blocks(cmd), cmd).toBe(false)
    }
  })
  it('never blocks the detached rebuild or its emergency unseal', () => {
    for (const cmd of [
      'node scripts/firewall-rebuild.mjs',
      'node scripts/firewall-rebuild.mjs --run',
      'node scripts/firewall-rebuild.mjs --status',
      'node scripts/firewall-rebuild.mjs --open',
      'node scripts/firewall-rebuild.mjs --run --watchdog-ms 30000 --force',
    ]) {
      expect(blocks(cmd), cmd).toBe(false)
    }
  })
  // The guard's own self-check hands it the command as an ARGUMENT — asking is
  // not running. It is the call the four-eyes review is told to make, and the
  // wrapper's header names it, so denying it would deny the review its way in.
  it('never blocks its own --check, whatever it is asked about', () => {
    for (const cmd of [
      "node scripts/firewall-guard.mjs --check 'sudo iptables -F'",
      'node scripts/firewall-guard.mjs --check \'eval "sudo iptables -F"\'',
      "node scripts/firewall-guard.mjs --check 'sudo /usr/local/bin/init-firewall.sh'",
    ]) {
      expect(blocks(cmd), cmd).toBe(false)
    }
  })
  it('but a real command CHAINED after a sanctioned one is still judged on its own', () => {
    expect(blocks('node scripts/firewall-guard.mjs --check x && sudo iptables -F')).toBe(true)
    expect(blocks('node scripts/firewall-allow.mjs api.github.com ; sudo ipset destroy allowed-domains')).toBe(true)
  })
})

describe('a MENTION is not an execution', () => {
  it('lets a quoted command inside an echo through', () => {
    expect(blocks('echo "sudo iptables -F"')).toBe(false)
    expect(blocks("echo 'run sudo /usr/local/bin/init-firewall.sh to rebuild'")).toBe(false)
    expect(blocks('printf "%s\\n" "ipset destroy allowed-domains"')).toBe(false)
  })
  it('lets a commit message and a branch name through', () => {
    expect(blocks('git commit -m "Deny a hand-typed iptables -F"')).toBe(false)
    expect(blocks('git checkout -b feat/496-firewall-lockout')).toBe(false)
    expect(blocks('git log --oneline --grep "ipset add"')).toBe(false)
  })
  it('lets searching and reading the container script through', () => {
    expect(blocks('grep -rn iptables scripts/')).toBe(false)
    expect(blocks('grep -rn "iptables -F" scripts/')).toBe(false)
    expect(blocks('rg "ipset destroy" .')).toBe(false)
    expect(blocks('cat /workspace/.devcontainer/init-firewall.sh')).toBe(false)
    expect(blocks('less /usr/local/bin/init-firewall.sh')).toBe(false)
    expect(blocks('git show HEAD:.devcontainer/init-firewall.sh')).toBe(false)
    expect(blocks('ls -l /usr/local/bin/init-firewall.sh')).toBe(false)
  })
  it('still catches a real command whose ARGUMENT happens to be quoted', () => {
    expect(blocks('sudo ipset add allowed-domains "1.2.3.4"')).toBe(true)
    expect(blocks("sudo iptables -A OUTPUT -j REJECT --reject-with 'icmp-admin-prohibited'")).toBe(true)
  })
})

describe('compound and wrapped command lines', () => {
  it('finds the offence in any segment, not only the first', () => {
    expect(blocks('git status && sudo iptables -F')).toBe(true)
    expect(blocks('npm run build ; sudo ipset destroy allowed-domains')).toBe(true)
    expect(blocks('true || sudo /usr/local/bin/init-firewall.sh')).toBe(true)
    expect(blocks('echo start\nsudo iptables -F')).toBe(true)
  })
  it('unwraps a shell payload rather than treating it as a quoted mention', () => {
    expect(blocks('bash -c "sudo iptables -F"')).toBe(true)
    expect(blocks("sh -c 'sudo ipset destroy allowed-domains'")).toBe(true)
    expect(blocks('bash -lc "sudo /usr/local/bin/init-firewall.sh"')).toBe(true)
  })
  it('peels sudo flags and env assignments off the real command', () => {
    expect(blocks('sudo -n iptables -F')).toBe(true)
    expect(blocks('sudo -u root iptables -F')).toBe(true) // the value of -u is not the command
    expect(blocks('env FOO=1 sudo iptables -F')).toBe(true)
    expect(blocks('setsid sudo ipset flush allowed-domains')).toBe(true)
  })
  it('leaves an innocent pipeline alone', () => {
    expect(blocks('iptables -L -n | grep -c ACCEPT')).toBe(false)
    expect(blocks('ipset list | head -20')).toBe(false)
    expect(blocks('npm run test:unit && git push')).toBe(false)
  })
})

// Plausible REPHRASINGS of the same command, not evasion: each of these is
// what someone reaches for when the obvious form is denied and they still
// believe they need it. The list below them is the deliberate line: forms that
// hide the tool name from any static reader, which the guard does not chase
// because chasing them buys false positives rather than safety — the only
// actor this guard protects is the session running it.
describe('the rephrasings that used to slip through', () => {
  it('denies a quoted payload handed to eval, which is bash -c without the bash', () => {
    expect(blocks('eval "sudo iptables -F"')).toBe(true)
    expect(blocks("eval 'sudo ipset destroy allowed-domains'")).toBe(true)
    expect(blocks('eval "sudo /usr/local/bin/init-firewall.sh"')).toBe(true)
  })
  it('denies the su spellings, with and without a user and either side of the -c', () => {
    expect(blocks('sudo su -c "iptables -F"')).toBe(true)
    expect(blocks('sudo su root -c "iptables -F"')).toBe(true)
    expect(blocks('su -c "iptables -F" root')).toBe(true)
    expect(blocks('su -c "ipset destroy allowed-domains"')).toBe(true)
  })
  it('denies a command assembled across an xargs pipe, whichever half carries what', () => {
    expect(blocks('echo "-F" | xargs sudo iptables')).toBe(true) // the flag comes down the pipe
    expect(blocks('echo iptables -F | xargs sudo')).toBe(true) // the tool comes down the pipe
    expect(blocks('echo "destroy allowed-domains" | xargs sudo ipset')).toBe(true)
  })
  it('denies a run inside another namespace', () => {
    expect(blocks('nsenter -t 1 -n iptables -F')).toBe(true)
    expect(blocks('nsenter -t 1 -n -- iptables -F')).toBe(true)
    expect(blocks('sudo nsenter -t 1 -n ipset destroy allowed-domains')).toBe(true)
  })
  it('denies the container script behind a cleared environment', () => {
    expect(blocks('sudo env - /usr/local/bin/init-firewall.sh')).toBe(true)
    expect(blocks('sudo env -i /usr/local/bin/init-firewall.sh')).toBe(true)
  })
  it('denies a subshell, a brace group and a shell function', () => {
    expect(blocks('(sudo iptables -F)')).toBe(true)
    expect(blocks('( sudo iptables -F )')).toBe(true)
    expect(blocks('{ sudo iptables -F; }')).toBe(true)
    expect(blocks('f() { sudo iptables -F; }; f')).toBe(true)
  })
  it('reports each of them under the rule that actually bit', () => {
    expect(idOf('eval "sudo iptables -F"')).toBe('iptables-mutate')
    expect(idOf('echo iptables -F | xargs sudo')).toBe('iptables-mutate')
    expect(idOf('sudo env - /usr/local/bin/init-firewall.sh')).toBe('init-firewall')
  })
  // The widenings above must not cost the pipe, the group or the pipeline their
  // ordinary uses — every one of these is a shape the session runs daily.
  it('leaves the innocent forms of every widened shape alone', () => {
    expect(blocks('find . -name "*.log" | xargs rm')).toBe(false)
    expect(blocks('ipset list | xargs echo')).toBe(false)
    expect(blocks('git ls-files | xargs grep -l iptables')).toBe(false)
    expect(blocks('ipset list allowed-domains | xargs -n1 sudo ipset test allowed-domains')).toBe(false)
    expect(blocks('(cd /tmp && ls)')).toBe(false)
    expect(blocks('{ npm run build; npm run lint; }')).toBe(false)
    expect(blocks('run() { npm test; }; run')).toBe(false)
    expect(blocks('eval "$(ssh-agent -s)"')).toBe(false)
    expect(blocks('env - node --version')).toBe(false)
  })
})

// The line the review drew, recorded so nobody re-opens it as an oversight:
// these hide the tool name from any static reader, and the only actor the guard
// protects is the session typing the command. Chasing them buys false positives
// on ordinary substitution and interpreter use, not safety.
describe('deliberate evasion is out of scope, and that is a decision', () => {
  it('does not chase a substituted or variable-held tool name', () => {
    expect(blocks('sudo $(which iptables) -F')).toBe(false)
    expect(blocks('x=iptables; sudo $x -F')).toBe(false)
  })
  it('does not chase an interpreter one-liner or a renamed copy', () => {
    expect(blocks('node -e "require(\'child_process\').execSync(\'sudo iptables -F\')"')).toBe(false)
    expect(blocks('ln -s /sbin/iptables /tmp/x && sudo /tmp/x -F')).toBe(false)
  })
})

describe('everyday commands are untouched', () => {
  it('passes the project\u2019s own routine calls', () => {
    for (const cmd of [
      'npm run build',
      'npm run lint',
      'npm run test:unit',
      'node scripts/audit-check.mjs',
      'node scripts/point-brief.mjs 496',
      'git push -u origin feat/496-firewall-lockout',
      'ls -la',
      'curl -sS https://api.github.com/zen',
      'dig +short api.github.com',
      'ip addr show',
    ]) {
      expect(blocks(cmd), cmd).toBe(false)
    }
  })
})

describe('totality — the core never throws and never invents a block', () => {
  it('allows when reading the input itself throws — the fail-open promise', () => {
    const exploding = {
      get command() {
        throw new Error('internal failure')
      },
    }
    expect(() => evaluate(exploding)).not.toThrow()
    expect(evaluate(exploding).block).toBe(false)
  })
  it('allows empty, missing and non-string input', () => {
    expect(evaluate({ command: '' }).block).toBe(false)
    expect(evaluate({}).block).toBe(false)
    expect(evaluate().block).toBe(false)
    expect(evaluate({ command: null }).block).toBe(false)
    expect(evaluate({ command: 42 }).block).toBe(false)
    expect(evaluate({ command: '   \n  ' }).block).toBe(false)
  })
  it('survives pathological input', () => {
    expect(() => evaluate({ command: '"'.repeat(500) })).not.toThrow()
    expect(() => evaluate({ command: 'bash -c "'.repeat(50) })).not.toThrow()
    expect(() => evaluate({ command: '&&;||'.repeat(200) })).not.toThrow()
    expect(() => evaluate({ command: 'sudo '.repeat(1000) })).not.toThrow()
  })
})

describe('the helpers', () => {
  it('baseNameOf takes the last path component either way round', () => {
    expect(baseNameOf('/usr/local/bin/init-firewall.sh')).toBe('init-firewall.sh')
    expect(baseNameOf('C:\\tools\\ipset.exe')).toBe('ipset.exe')
    expect(baseNameOf('iptables')).toBe('iptables')
    expect(baseNameOf('')).toBe('')
  })
  it('blankQuoted keeps the quotes and erases only their content', () => {
    expect(blankQuoted('echo "abc"')).toBe('echo "   "')
    expect(blankQuoted("a 'bc' d")).toBe("a '  ' d")
    expect(blankQuoted('no quotes here')).toBe('no quotes here')
    expect(blankQuoted('unterminated "abc')).toBe('unterminated "   ')
  })
  it('unwrapShellRunners lifts the payload out and stops at its bound', () => {
    expect(unwrapShellRunners('bash -c "echo hi"')).toContain('echo hi')
    expect(unwrapShellRunners('eval "echo hi"')).toContain('echo hi')
    expect(unwrapShellRunners('su postgres -c "echo hi"')).toContain('echo hi')
    expect(unwrapShellRunners('x')).toBe('x')
    expect(() => unwrapShellRunners('bash -c "bash -c \'x\'"')).not.toThrow()
  })
  it('foldXargs folds the pipe into the one command it composes, and keeps both halves', () => {
    const folded = foldXargs('echo "-F" | xargs sudo iptables')
    expect(folded).toContain('echo "-F" | xargs sudo iptables') // the original is still judged
    expect(folded).toContain('sudo iptables -F') // and so is what it assembles
    expect(foldXargs('echo iptables -F | xargs sudo')).toContain('sudo iptables -F')
    expect(foldXargs('ls | grep x')).toBe('ls | grep x') // no xargs, no synthetic segment
    expect(foldXargs('')).toBe('')
    expect(() => foldXargs('| xargs')).not.toThrow()
  })
  it('unwrapGrouping strips the syntax that groups a command without being one', () => {
    expect(unwrapGrouping('(sudo iptables -F)')).toBe('sudo iptables -F')
    expect(unwrapGrouping('{ sudo iptables -F; }')).toBe('sudo iptables -F')
    expect(unwrapGrouping('f() { sudo iptables -F')).toBe('sudo iptables -F')
    expect(unwrapGrouping('npm run build')).toBe('npm run build')
    expect(unwrapGrouping('')).toBe('')
  })
  it('segmentsOf splits on every shell separator and drops the blanks', () => {
    expect(segmentsOf('a && b ; c | d || e')).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(segmentsOf('  ')).toEqual([])
  })
  it('commandOf names the command behind the wrappers', () => {
    expect(commandOf('sudo -n iptables -F').name).toBe('iptables')
    expect(commandOf('timeout 300 sudo /usr/local/bin/init-firewall.sh').name).toBe('init-firewall.sh')
    expect(commandOf('FOO=1 npm run build').name).toBe('npm')
    expect(commandOf('').name).toBe('')
    expect(commandOf('sudo').name).toBe('')
  })
  it('offenceIn judges a bare segment and reports which rule bit', () => {
    expect(offenceIn('sudo iptables -F').id).toBe('iptables-mutate')
    expect(offenceIn('sudo ipset destroy allowed-domains').id).toBe('ipset-mutate')
    expect(offenceIn('sudo ip route del default').id).toBe('ip-mutate')
    expect(offenceIn('iptables -L -n')).toBeNull()
    expect(offenceIn('')).toBeNull()
  })
})

describe('the deny message', () => {
  it('quotes the offending segment, bounded', () => {
    const long = 'sudo iptables -F ' + 'x'.repeat(400)
    const offence = findOffence(long)
    expect(offence.excerpt.length).toBeLessThanOrEqual(EXCERPT_CHARS)
    expect(evaluate({ command: long }).reason).toContain('sudo iptables -F')
  })
  it('always leaves a route out, never only a refusal', () => {
    const reason = formatReason({ what: 'a packet-filter change', excerpt: 'sudo iptables -F' })
    expect(reason).toContain('scripts/firewall-allow.mjs')
    expect(reason).toContain('--net24')
    expect(reason).toContain('scripts/firewall-rebuild.mjs --run')
    expect(reason).toContain('--status')
    expect(reason).toContain('--open')
    expect(reason).toMatch(/iptables -L -n/) // says plainly that reading is fine
  })
  // The accepted price of catching a heredoc that EXECUTES: a heredoc that only
  // WRITES about the incident is judged line by line too, and prose that quotes
  // `sudo iptables -F` is denied. That is defensible only if the message names
  // the way out, or the session is left rephrasing a document.
  it('names the route for PROSE, which the heredoc rule also catches', () => {
    const reason = formatReason({ what: 'a packet-filter change', excerpt: 'sudo iptables -F' })
    expect(reason).toMatch(/heredoc/i)
    expect(reason).toMatch(/Write tool/)
  })
  it('is what a denied heredoc of prose actually gets told', () => {
    const heredoc = "cat >> docs/incident.md <<'EOF'\nsudo iptables -F\nEOF"
    const verdict = evaluate({ command: heredoc })
    expect(verdict.block).toBe(true)
    expect(verdict.reason).toMatch(/Write tool/)
  })
})

// THE WRAPPER, PROVEN BY RUNNING IT (the shape guard-hooks.test.mjs uses).
//
// WHY this exists rather than a source review: everything above judges the pure
// core, and the core can be perfect while the process around it says nothing.
// The body sits behind `isMainModule(import.meta.url)`, the verdict has to
// travel out as a PreToolUse JSON payload on stdout, and the exit code has to
// stay 0 whichever way it lands \u2014 a hook that exits non-zero is an error, not a
// denial. None of that is visible in the code; only spawning it shows it. The
// harness's own promise is fail-OPEN, so the allow cases carry as much weight
// here as the deny: a guard that crashes the Bash tool would be removed within
// the hour, and then nothing guards the container at all.
describe('the wrapper, spawned the way the harness spawns it', { timeout: 60_000 }, () => {
  const GUARD = resolve(process.cwd(), 'scripts', 'firewall-guard.mjs')

  /** `node scripts/firewall-guard.mjs` with a PreToolUse payload on stdin. */
  const hook = (payload, args = []) => {
    const r = spawnSync(process.execPath, [GUARD, ...args], {
      input: typeof payload === 'string' ? payload : JSON.stringify(payload),
      encoding: 'utf8',
      windowsHide: true,
    })
    let decision = null
    try {
      decision = r.stdout.trim() ? JSON.parse(r.stdout.trim()).hookSpecificOutput : null
    } catch {
      /* not a decision payload \u2014 the assertions report the raw stdout instead */
    }
    return { ...r, decision }
  }
  const bash = (command) => ({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
  })

  it('DENIES the command that sealed the container, as a PreToolUse payload', () => {
    const r = hook(bash('sudo /usr/local/bin/init-firewall.sh'))
    expect(r.status, `exited ${r.status}: ${r.stderr}`).toBe(0)
    expect(r.decision, `stdout was ${JSON.stringify(r.stdout)}`).toBeTruthy()
    expect(r.decision.hookEventName).toBe('PreToolUse')
    expect(r.decision.permissionDecision).toBe('deny')
    expect(r.decision.permissionDecisionReason).toMatch(/scripts\/firewall-rebuild\.mjs --run/)
  })

  it('DENIES a hand-typed mutation and the rephrasings, through the real process', () => {
    for (const command of ['sudo iptables -F', 'eval "sudo iptables -F"', 'echo iptables -F | xargs sudo']) {
      const r = hook(bash(command))
      expect(r.status, `${command} exited ${r.status}: ${r.stderr}`).toBe(0)
      expect(r.decision?.permissionDecision, `${command} was not denied`).toBe('deny')
    }
  })

  it('says NOTHING at all for a read, a sanctioned route and an everyday command', () => {
    for (const command of [
      'iptables -L -n',
      'ip link show up',
      'node scripts/firewall-rebuild.mjs --status',
      'node scripts/firewall-allow.mjs api.github.com',
      'npm run test:unit',
    ]) {
      const r = hook(bash(command))
      expect(r.status, `${command} exited ${r.status}: ${r.stderr}`).toBe(0)
      // An allow is SILENCE, not an "allow" payload: anything on stdout that the
      // harness cannot parse is a hook error, and a hook error is a broken tool.
      expect(r.stdout.trim(), `${command} printed something`).toBe('')
    }
  })

  it('ignores a tool that is not a shell', () => {
    const r = hook({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { command: 'sudo iptables -F' } })
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe('')
  })

  it('is fail-OPEN on garbled, empty and absent input', () => {
    for (const input of ['', 'not json at all', '{"tool_name":', '{}', 'null']) {
      const r = hook(input)
      expect(r.status, `input ${JSON.stringify(input)} exited ${r.status}: ${r.stderr}`).toBe(0)
      expect(r.stdout.trim()).toBe('')
    }
  })

  it('answers --check, which is how the guard is asked ahead of time', () => {
    const denied = spawnSync(process.execPath, [GUARD, '--check', 'sudo iptables -F'], {
      encoding: 'utf8',
      windowsHide: true,
    })
    expect(denied.status, denied.stderr).toBe(0)
    expect(denied.stdout).toMatch(/WOULD DENY \(iptables-mutate\)/)

    const allowed = spawnSync(process.execPath, [GUARD, '--check', 'iptables -L -n'], {
      encoding: 'utf8',
      windowsHide: true,
    })
    expect(allowed.status, allowed.stderr).toBe(0)
    expect(allowed.stdout).toMatch(/firewall-guard: OK/)
  })
})

describe('the wrapper\u2019s payload reader', () => {
  it('reads the command out of a Bash tool call', () => {
    expect(commandFrom({ tool_name: 'Bash', tool_input: { command: 'sudo iptables -F' } })).toBe(
      'sudo iptables -F',
    )
  })
  it('covers PowerShell for the same repository on a Windows host', () => {
    expect(GUARDED_TOOLS.has('Bash')).toBe(true)
    expect(GUARDED_TOOLS.has('PowerShell')).toBe(true)
  })
  it('yields nothing for another tool, a missing input or a malformed payload', () => {
    expect(commandFrom({ tool_name: 'Read', tool_input: { command: 'sudo iptables -F' } })).toBe('')
    expect(commandFrom({ tool_name: 'Bash', tool_input: {} })).toBe('')
    expect(commandFrom({ tool_name: 'Bash' })).toBe('')
    expect(commandFrom({ tool_name: 'Bash', tool_input: { command: 42 } })).toBe('')
    expect(commandFrom(null)).toBe('')
    expect(commandFrom('nonsense')).toBe('')
    expect(commandFrom(undefined)).toBe('')
  })
})
