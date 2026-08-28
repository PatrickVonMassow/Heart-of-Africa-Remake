import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('the CI guard wires the durable observer', () => {
  const source = readFileSync(resolve(process.cwd(), 'scripts', 'ci-status-guard.mjs'), 'utf8')
  const code = source.split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n')

  it('stands down before creating or repairing a wait', () => {
    const gather = code.slice(code.indexOf('export async function gatherCiStatusInputs'))
    expect(gather.indexOf('existsSync(PAUSE)')).toBeLessThan(gather.indexOf('startWaitObserver'))
    expect(gather.indexOf('heldByOtherLiveOwner(sessionId)')).toBeLessThan(gather.indexOf('startWaitObserver'))
  })

  it('checks author liveness without running the unrelated slot census', () => {
    expect(code).toMatch(/gatherInFlight\(sessionId, \{ now, includeSlots: false \}\)/)
  })

  it('persists the renewable record before starting its detached observer', () => {
    expect(code).toMatch(/mutateState\([\s\S]*?reconcileCiWait\([\s\S]*?ciWait: nextWait/)
    expect(code).toMatch(/durableWait = persisted\?\.ciWait[\s\S]*?startWaitObserver\(durableWait\)/)
    expect(code).toMatch(/spawn\(process\.execPath, \[SELF, '--observe', wait\.wakeToken\]/)
    expect(code).toMatch(/detached: true/)
  })

  it('claims one observer durably and polls by bounded backoff past the interaction deadline', () => {
    expect(code).toMatch(/async function observeDurableWait\(wakeToken\)/)
    expect(code).toMatch(/assessment\.observerAlive && wait\.observer\?\.pid !== process\.pid/)
    expect(code).toMatch(/observer: \{ pid: process\.pid, startedAt \}/)
    expect(code).toMatch(/setTimeout\(resolve, ciWaitBackoffMs\(/)
    const observer = code.match(/async function observeDurableWait[\s\S]*?\n\}/)?.[0] ?? ''
    expect(observer).not.toMatch(/deadline[^\n]*(?:return|break|exit)/)
  })

  it('persists terminal evidence before requesting the immediate guarded successor', () => {
    const observer = code.slice(code.indexOf('async function observeDurableWait'))
    expect(observer.indexOf('finished = observeCiWait')).toBeLessThan(observer.indexOf('wakeSuccessorUntilRecovered(finished)'))
    expect(code).toMatch(/'--immediate',[\s\S]*?'--cause', 'ci-terminal',[\s\S]*?'--wake-token', wait\.wakeToken/)
    expect(code).toMatch(/terminal: finished\.terminal/)
  })

  it('retries a refused terminal wake by bounded backoff without crossing a pause', () => {
    expect(code).toMatch(/async function wakeSuccessorUntilRecovered\(wait\)[\s\S]*?current\.wakeToken !== wait\.wakeToken[\s\S]*?!existsSync\(PAUSE\)[\s\S]*?requestSuccessor\(current\)[\s\S]*?ciWaitBackoffMs\(current\)/)
  })

  it('keeps terminal wake state until a spawned successor acknowledges it', () => {
    expect(code).toMatch(/export function acknowledgeCiWait\(wakeToken/)
    expect(code).toMatch(/acknowledgeCiWaitState\(current, wakeToken, \{ now \}\)/)
  })

  it('dispatches only failed jobs and feeds the accepted re-run into the durable wait', () => {
    expect(code).toMatch(/actions\/runs\/\$\{runId\}\/rerun-failed-jobs/)
    expect(code).toMatch(/method: 'POST'/)
    expect(code).toMatch(/res\?\.status === 201/)
    expect(code).toMatch(/rerunWait: state\.ciWait/)
    expect(code).toMatch(/allowRerun: !readOnly/)
    expect(code).toMatch(/standDown && judged\.rerunWait\?\.state === 'pending'/)
  })
})
