// Drum pictures use the live performance, never a delay or a held speech label.
import { frameShutter } from './frameSubject.mjs'

/** Runs in the browser; the wall clock must be the performance's own clock. */
export function readDrumWindow() {
  const beating = window.__ui.getState().drumPerformance
  return {
    message: beating?.plan.message ?? null,
    startedAt: beating?.startedAt ?? null,
    endsAt: beating?.endsAt ?? null,
    now: performance.now(),
    chiefPhase: window.__chief?.phase ?? null,
  }
}

/** A stale performance object is not proof that the drums are still speaking. */
export function judgeDrumWindow(sample, message, startedAt = sample?.startedAt) {
  const ok = sample?.message === message &&
    Number.isFinite(sample.startedAt) && sample.startedAt === startedAt &&
    Number.isFinite(sample.now) && Number.isFinite(sample.endsAt) &&
    sample.now >= sample.startedAt && sample.now < sample.endsAt &&
    sample.chiefPhase === 'at-drummer'
  return {
    ok,
    detail: `drumPerformance must still be beating ${message}, with the chief at-drummer: ${JSON.stringify(sample)}`,
  }
}

/**
 * Compose and settle first, then ask for a normal repeat. This is a separate
 * performance for the picture, not a retry of a failed capture. Any previous
 * message finishes naturally. No beat, pause or lifetime is stretched.
 */
export async function frameSpeakingDrums(page, outDir, name, declaration, message) {
  let before
  const capture = frameShutter(page, outDir, {
    beforeCapture: async () => {
      await page.waitForFunction(() => window.__ui.getState().drumPerformance === null, null, { timeout: 40000 })
      await page.evaluate(() => {
        window.__ui.getState().setDialog(null)
        const game = window.__game.getState()
        game.setJournalOpen(false)
        game.requestDrumMessage()
      })
      try {
        await page.waitForFunction((wanted) => {
          const b = window.__ui.getState().drumPerformance
          return b?.plan.message === wanted && performance.now() < b.endsAt && window.__chief?.phase === 'at-drummer'
        }, message, { timeout: 40000 })
      } catch {
        throw new Error(`frame ${name}: no running drumPerformance for ${message} at the shutter`)
      }
      before = await page.evaluate(readDrumWindow)
      const verdict = judgeDrumWindow(before, message)
      if (!verdict.ok) throw new Error(`frame ${name}: ${verdict.detail}`)
    },
  })
  const buffer = await capture(name, declaration)
  // The SAME uninterrupted performance must outlast the screenshot itself;
  // an expired or replaced one cannot cover the image, even on a slow backend.
  const after = await page.evaluate(readDrumWindow)
  const verdict = judgeDrumWindow(after, message, before.startedAt)
  if (!verdict.ok) throw new Error(`frame ${name}: ${verdict.detail}`)
  return { buffer, before, after }
}
