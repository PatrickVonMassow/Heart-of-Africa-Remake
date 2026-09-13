import { expect, it, vi } from 'vitest'
import { SpeechFloor } from '../../communication/speechFloor'
import { queuedDrummerVoice } from './drummerVoice'

it('keeps each requested CHIEF word behind the active exchange and its consequence', () => {
  let now = 0
  const floor = new SpeechFloor(() => ({ x: 0, z: 0, active: true }), () => now)
  const source = { x: 0, z: 0, register: 'talk' as const }
  const owner = {}
  floor.request({ situation: owner, name: 'dig', word: 'invite', source, sources: () => [source] })
  const speak = vi.fn()
  const queued = queuedDrummerVoice(floor, source, speak)
  queued.voice([1, 2]); queued.voice([3, 4])
  now = 10
  queued.step()
  expect(speak).not.toHaveBeenCalled()
  floor.release(owner)
  queued.step()
  expect(speak).toHaveBeenCalledExactlyOnceWith([1, 2])
  queued.step()
  expect(speak).toHaveBeenCalledTimes(1)
  now = 20
  queued.step()
  expect(speak).toHaveBeenLastCalledWith([3, 4])
  queued.dispose()
})
