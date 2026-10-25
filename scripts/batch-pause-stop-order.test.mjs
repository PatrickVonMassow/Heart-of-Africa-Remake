// Only an explicit user order stops the batch (point 1351).
import { describe, expect, it } from 'vitest'
import {
  classifyPause,
  formatPauseRecord,
  isExplicitStopOrder,
  quotesExplicitStopOrder,
  transcriptOrdersStop,
  userStopEnd,
} from './batch-pause-core.mjs'

const NOW = Date.parse('2026-10-13T06:00:00.000Z')
const human = (text) => JSON.stringify({ type: 'user', origin: { kind: 'human' }, message: { content: text } })

describe('explicit stop order', () => {
  it.each([
    'Hast du die Batch bekommen? Dazu habe ich dich nicht aufgefordert.',
    'Erstmal nur darüber reden',
    'Nein, nicht anhalten … Niemals in irgendeine meiner Fragen hineininterpretieren.',
    'Sollen wir die Batch anhalten?',
    'Vielleicht sollte die Batch pausieren',
    'Die Batch läuft halt weiter',
    'Warum stoppt die Batch ständig',
    "Don't stop the batch",
    'Don’t stop the batch.',
    'Ich musste die Batch anhalten.',
    'The batch has a pause button.',
    'Why did you stop the batch',
    'Stop asking questions about the work',
    'Bitte nicht\n die Batch anhalten.',
    'Stop the batch from stopping automatically.',
    'Halte die Batch an der Spitze der Prioritätenliste.',
    'Stopp die Batch. Nein, mach doch weiter.',
    'Stopp die Batch. Warum hängt der Build',
    'Stopp die Batch bis auf weiteres. Dann mach weiter.',
  ])('refuses %j', (text) => {
    expect(isExplicitStopOrder(text)).toBe(false)
  })

  it.each([
    'Halte die Batch an',
    'Stopp die Batch',
    'Stopp!',
    'Pausiere die Batch.',
    'Stop the batch',
    'Hör mit der Arbeit auf',
    'Claude, stopp die Batch bis morgen.',
    'Batch sofort anhalten!',
    'Stopp die Batch bis auf weiteres.',
  ])(
    'accepts %j',
    (text) => {
      expect(isExplicitStopOrder(text)).toBe(true)
    },
  )

  it('judges the quoted words of a pause reason, not the session prose around them', () => {
    expect(quotesExplicitStopOrder('user asked to stop the batch: »Hast du die Batch bekommen?«')).toBe(false)
    expect(quotesExplicitStopOrder('user: „Halte die Batch an“')).toBe(true)
    expect(quotesExplicitStopOrder('user: »Stopp die Batch. Nein, mach doch weiter.«')).toBe(false)
    expect(quotesExplicitStopOrder('user: »Stopp die Batch«; user correction: »Nein, mach weiter.«')).toBe(false)
    expect(quotesExplicitStopOrder('user: »Stopp die Batch«, then »Halte die Batch an«')).toBe(true)
    expect(quotesExplicitStopOrder('user: »Stop the batch«; correction: »No«')).toBe(false)
  })

  it('recovers a clockless user-stop record whose quote is no order', () => {
    const asked = formatPauseRecord({ reason: 'user: »Erstmal nur darüber reden«', cause: 'user-stop', retryAfter: null })
    expect(classifyPause({ text: asked, now: NOW })).toMatchObject({
      state: 'recover',
      misfiledUserStop: true,
      why: expect.stringContaining('no explicit stop order'),
    })
  })
})

describe('stop guard text', () => {
  it('offers the user stop only when a human message in the transcript ordered one', () => {
    const asked = [human('Hast du die Batch bekommen? Dazu habe ich dich nicht aufgefordert.')].join('\n')
    const ordered = [human('Wie weit bist du?'), human('Stopp die Batch')].join('\n')
    const injected = JSON.stringify({ type: 'user', message: { content: 'Stopp die Batch' } })
    expect(transcriptOrdersStop(asked)).toBe(false)
    expect(transcriptOrdersStop(injected)).toBe(false)
    expect(transcriptOrdersStop(null)).toBe(false)
    expect(transcriptOrdersStop(ordered)).toBe(true)
    expect(transcriptOrdersStop([human('Stopp die Batch'), human('Starte die Batch wieder.')].join('\n'))).toBe(false)
    expect(transcriptOrdersStop(human('Bitte nicht\n die Batch anhalten.'))).toBe(false)
    expect(userStopEnd(false)).not.toContain('--user-stop')
    expect(userStopEnd(false)).toContain('never one')
    expect(userStopEnd(true)).toContain('batch-pause.mjs --user-stop')
  })
})
