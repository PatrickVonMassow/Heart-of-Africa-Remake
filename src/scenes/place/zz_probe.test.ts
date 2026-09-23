import { it } from 'vitest'
import { play } from './tagShuffleHarness'
import { shuffleWindows, CHILD_MOTION } from '../../../scripts/verify/childMotionMetric.mjs'
it('probe', () => {
  for (const [place, seed] of [['maasai-village', 2972259115], ['cairo', 2972259115], ['cairo', 42], ['maasai-village', 42], ['maasai-village', 46], ['cairo', 46], ['cairo', 7], ['maasai-village', 7], ['cairo', 11], ['maasai-village', 11]] as const) {
    const paths = play(place, seed, 60)
    const r = shuffleWindows(paths); const b = shuffleWindows(paths, CHILD_MOTION.short)
    console.log('R', place, seed, (r.worstShare*100).toFixed(3), (b.worstShare*100).toFixed(3))
  }
}, 600000)
