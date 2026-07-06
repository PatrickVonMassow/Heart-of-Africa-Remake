// Journal/chronicle panel (design.md §15): grows automatically, stores hints.
// Entries are stored as language-neutral text references and rendered in the
// currently selected language (design.md §17). POC simplification: plain
// text; the animated handwriting of design.md §16 is out of POC scope.

import { useEffect, useRef } from 'react'
import { useGame } from '../state/store'
import { START_YEAR } from '../config/balance'
import { Sketch } from '../journal/sketches'
import { resolveText, useStrings } from '../i18n'

export function JournalPanel() {
  const t = useStrings()
  const journal = useGame((s) => s.journal)
  const open = useGame((s) => s.journalOpen)
  const setOpen = useGame((s) => s.setJournalOpen)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [open, journal.length])

  if (!open) return null

  return (
    <div className="journal">
      <header>
        <span>{t.journalPanel.title}</span>
        <button onClick={() => setOpen(false)}>{t.journalPanel.close}</button>
      </header>
      <div className="entries">
        {journal.map((e) => (
          <div key={e.id} className={`entry${e.kind === 'hint' ? ' hint' : ''}`}>
            <div className="date">{t.formatDate(e.day, START_YEAR)}</div>
            <h4>{resolveText(t, e.title)}</h4>
            {e.sketch && <Sketch id={e.sketch} />}
            <p>{resolveText(t, e.text)}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
