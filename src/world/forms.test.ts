// The form/socket system: a shape carried, a place shaped to take it.
// These are the RULES of the mechanism, decided once for every lock that will
// ever use it — not the rules of the one lock the PoC ships.
import { describe, it, expect } from 'vitest'
import { withWorld } from '../test/store'
import { balance } from '../config/balance'
import {
  FORM_IDS,
  FORM_SOCKETS,
  resolveFormUse,
  socketPosition,
  type FormId,
  type FormSocket,
  type SocketId,
} from './forms'
import { CULTURAL_LANDMARKS } from './data/landmarks'

withWorld()

/** The reach the digging uses — the same kind of radius the point asks for. */
const REACH = balance.digRadius / 10

const talus = FORM_SOCKETS.find((s) => s.id === 'bandiagara-talus') as FormSocket
const MOULD: FormId = 'rock-relief'

const use = (
  lat: number,
  lon: number,
  carriedForms: readonly FormId[] = [MOULD],
  spentSockets: readonly SocketId[] = [],
) => resolveFormUse({ lat, lon, radiusDeg: REACH, carriedForms, spentSockets })

describe('where the sockets are', () => {
  it('names only forms that exist', () => {
    for (const s of FORM_SOCKETS) expect(FORM_IDS).toContain(s.form)
  })

  it('reads its position from the landmark the scene draws, not from a copy', () => {
    const drawn = CULTURAL_LANDMARKS.find((c) => c.id === 'bandiagara')!
    expect(socketPosition(talus)).toEqual({ lat: drawn.lat, lon: drawn.lon })
  })

  it('refuses a socket whose landmark is not in the world', () => {
    expect(() => socketPosition({ ...talus, landmarkId: 'nowhere' })).toThrow(/nowhere/)
  })
})

describe('what the use key resolves', () => {
  it('fits at the talus foot, with the form in the pack', () => {
    const at = socketPosition(talus)
    const r = use(at.lat, at.lon)
    expect(r.kind).toBe('fits')
    expect(r.kind === 'fits' && r.socket.id).toBe('bandiagara-talus')
  })

  it('still fits at the rim of the reach, and no longer just outside it', () => {
    const at = socketPosition(talus)
    expect(use(at.lat + REACH * 0.99, at.lon).kind).toBe('fits')
    expect(use(at.lat + REACH * 1.01, at.lon).kind).toBe('no-fit')
  })

  it('answers a wrong place with a miss, however far away', () => {
    const at = socketPosition(talus)
    expect(use(at.lat + REACH * 4, at.lon).kind).toBe('no-fit')
    expect(use(0, 0).kind).toBe('no-fit')
  })

  it('takes no form the traveller does not carry', () => {
    const at = socketPosition(talus)
    expect(use(at.lat, at.lon, []).kind).toBe('no-fit')
  })

  it('picks the matching form out of several and ignores the rest', () => {
    const at = socketPosition(talus)
    // Nothing has to be "selected" first: the socket does the choosing.
    const carried = ['no-such-form' as FormId, MOULD, 'another' as FormId]
    expect(use(at.lat, at.lon, carried).kind).toBe('fits')
  })

  it('answers a SPENT socket exactly like a wrong place', () => {
    const at = socketPosition(talus)
    const spent = use(at.lat, at.lon, [MOULD], ['bandiagara-talus'])
    expect(spent).toEqual(use(at.lat + REACH * 4, at.lon))
    expect(spent.kind).toBe('no-fit')
  })

  it('is a pure query — resolving consumes nothing', () => {
    const at = socketPosition(talus)
    const carried: FormId[] = [MOULD]
    expect(use(at.lat, at.lon, carried).kind).toBe('fits')
    expect(carried).toEqual([MOULD])
    expect(use(at.lat, at.lon, carried).kind).toBe('fits')
  })
})
