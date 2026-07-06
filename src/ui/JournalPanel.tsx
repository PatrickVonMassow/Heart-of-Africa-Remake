// Journal/chronicle panel (design.md §15): grows automatically, stores hints.
// POC simplification: entries are plain text; the animated handwriting of
// design.md §16 is out of POC scope (CLAUDE.md §8).

import { useEffect, useRef } from 'react'
import { useGame, formatDate } from '../state/store'

export function JournalPanel() {
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
        <span>Tagebuch</span>
        <button onClick={() => setOpen(false)}>Schließen (T)</button>
      </header>
      <div className="entries">
        {journal.map((e) => (
          <div key={e.id} className={`entry${e.kind === 'hint' ? ' hint' : ''}`}>
            <div className="date">{formatDate(e.day)}</div>
            <h4>{e.title}</h4>
            <p>{e.text}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
