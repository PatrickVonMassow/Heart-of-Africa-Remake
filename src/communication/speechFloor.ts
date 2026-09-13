// A speaking situation owns the floor; silent work yields after its visible effect.
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
/** `sayable` separates a word the FLOOR defers from one its own speaker cannot
 *  yet say: only the former takes a turn away from the others. */
interface HeldWord { since: number; deadline: number; sources: FloorRequest['sources']; sayable: boolean }

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

  /** Keep the debt and its deadline when a queued speaker stops being ready. */
  suspend(situation: object, word: string): void {
    const held = this.held.get(situation)?.get(word)
    if (held) held.sayable = false
  }

  release(situation: object): void {
    this.situations.delete(situation)
    this.held.delete(situation)
  }

  request(r: FloorRequest): boolean {
    const now = this.now()
    const own = this.situations.get(r.situation)
    // A word and its consequence finish before any ready continuation. After
    // that, an exchange retains precedence only while it can actually speak:
    // walking, hush and an occupied site must not reserve the village for a
    // task's entire life. Use this request's live readiness for its own entry.
    const audible = [...this.situations.entries()].filter(([, s]) => s.sources().some((p) => this.audible(p)))
    const first = audible.find(([, s]) => now < s.next) ?? audible.find(([owner]) =>
      owner === r.situation ? !r.blocked : [...(this.held.get(owner)?.values() ?? [])].some((h) => h.sayable))
    const foreign = this.audible(r.source) && first && first[0] !== r.situation ? first[1] : null
    /** This exchange already holds the floor and is finishing its own words. */
    const holding = !!first && first[0] === r.situation
    const window = this.consequence && now < this.consequence.until && this.audible(r.source) && this.audible(this.consequence.source)
    let words = this.held.get(r.situation)
    const queued = words?.get(r.word)
    // FIRST COME, FIRST SPOKEN among audible exchanges. Without it the floor is
    // granted in villager-index order, and a pair the loop reaches late is
    // starved for its whole life: measured over 180 s at six villagers, pair 4/5
    // got the floor exactly once, when the bound forced its word out one step
    // before the task expired. The bound is a backstop, not a turn-taking
    // mechanism, so the longest-waiting sayable word goes next.
    const since = queued?.since ?? now
    // A ready continuation never queues behind the waiter it is blocking.
    const older = !holding && this.audible(r.source) && [...this.held].some(([situation, held]) =>
      situation !== r.situation &&
      [...held.values()].some((h) => h.sayable && h.since < since && h.sources().some((p) => this.audible(p))))
    const blocked = r.blocked || !!foreign || !!window || older || (own !== undefined && now < own.next)
    // Look ahead one simulation step, releasing strictly before the hard kill.
    const life = Math.max(0, (r.remaining ?? Infinity) - (r.step ?? 0))
    const deadline = Math.min(queued?.deadline ?? now + balance.communication.speechHoldSeconds, now + life)
    const forced = (!!queued || blocked) && now + (r.step ?? 0) >= deadline
    if (blocked && !forced) {
      if (!words) this.held.set(r.situation, words = new Map())
      words.set(r.word, { since, deadline, sources: r.sources, sayable: !r.blocked })
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
