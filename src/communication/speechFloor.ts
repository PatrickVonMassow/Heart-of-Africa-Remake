// A situation owns its exchange; its words leave time for their visible effect.
// Only exchanges reaching the player's ear compete. Out-of-range work continues.
import { balance } from '../config/balance'
import { devAssert } from '../systems/devAssert'
import { isWithinHearing } from './heard'
import { utteranceSeconds, voiceRegister, type VoiceRegister } from './speaking'

export interface FloorSource { x: number; z: number; register: VoiceRegister }
export interface FloorRequest {
  situation: object
  name: string
  word: string
  source: FloorSource
  /** Live positions: walking into earshot must not evade an existing exchange. */
  sources: () => readonly FloorSource[]
  blocked?: boolean
  /** Seconds left BEFORE this step consumes the owning task's remaining life. */
  remaining?: number
  step?: number
  ends?: boolean
}
interface Situation { name: string; sources: FloorRequest['sources']; next: number }
interface HeldWord { since: number; deadline: number }

export class SpeechFloor {
  /** Count every forced release, independently of diagnostic log throttling. */
  forcedCount = 0
  private situations = new Map<object, Situation>()
  private held = new Map<object, Map<string, HeldWord>>()
  private consequence: { source: FloorSource; until: number } | null = null

  private readonly player: () => { x: number; z: number; active: boolean }
  private readonly now: () => number
  private readonly scope: string
  constructor(player: () => { x: number; z: number; active: boolean }, now: () => number, scope = 'village') {
    this.player = player
    this.now = now
    this.scope = scope
  }

  private audible(source: FloorSource): boolean {
    const player = this.player()
    return player.active && isWithinHearing(Math.hypot(source.x - player.x, source.z - player.z), voiceRegister(source.register).reach)
  }

  waiting(situation: object): boolean {
    return (this.held.get(situation)?.size ?? 0) > 0
  }

  release(situation: object): void {
    this.situations.delete(situation)
    this.held.delete(situation)
  }

  request(r: FloorRequest): boolean {
    const now = this.now()
    const own = this.situations.get(r.situation)
    // The oldest audible situation retains precedence if the player walks into
    // the reach of two exchanges that began independently outside his earshot.
    const first = [...this.situations.entries()].find(([, s]) => s.sources().some((p) => this.audible(p)))
    const foreign = this.audible(r.source) && first && first[0] !== r.situation ? first[1] : null
    const window = this.consequence && now < this.consequence.until && this.audible(r.source) && this.audible(this.consequence.source)
    const blocked = r.blocked || !!foreign || !!window || (own !== undefined && now < own.next)
    let words = this.held.get(r.situation)
    const queued = words?.get(r.word)
    // Look ahead one simulation step, releasing strictly before the hard kill.
    const life = Math.max(0, (r.remaining ?? Infinity) - (r.step ?? 0))
    const deadline = Math.min(queued?.deadline ?? now + balance.communication.speechHoldSeconds, now + life)
    const forced = (!!queued || blocked) && now + (r.step ?? 0) >= deadline
    if (blocked && !forced) {
      if (!words) this.held.set(r.situation, words = new Map())
      words.set(r.word, { since: queued?.since ?? now, deadline })
      return false
    }
    if (forced) {
      this.forcedCount++
      devAssert(false, 'adult-atom-lost', () => `${this.scope}: ${r.name}/${r.word}: forced after ${(now - (queued?.since ?? now)).toFixed(2)}s; overrun situation ${foreign?.name ?? own?.name ?? r.name}${r.blocked ? ' (hush or occupied site)' : ''}`)
    }
    words?.delete(r.word)
    const next = now + utteranceSeconds(4) + balance.communication.consequenceSeconds
    this.situations.set(r.situation, { name: r.name, sources: r.sources, next })
    if (this.audible(r.source)) this.consequence = { source: { ...r.source }, until: next }
    if (r.ends) this.release(r.situation)
    return true
  }
}
