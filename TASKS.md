# TASKS — sequential feature batch

Working file for the current batch. Exactly one point is in progress at a time.
Each point: implement → adapt docs (incl. README) → add acceptance tests → run
the full regression → commit atomically (only if fully green) → tick it here.

## Regression command

```sh
npm test          # boots the dev server + preview, runs all 20 verify suites
npm test -- flow  # a single suite (dev server managed for you)
```

`npm test` runs `scripts/verify/run-all.mjs`: it starts the Vite dev server
(:5173), runs the 19 behaviour suites against it, then builds and runs the
production-preview smoke test (`preview.mjs`, :4173). It exits non-zero if any
suite fails or logs a browser console error. Prerequisites: `npm install`
(Playwright + Chromium), a free :5173/:4173. Individual suites can also be run
directly with `node scripts/verify/<name>.mjs` against a running dev server.

Test basis: 20 headless Playwright suites in `scripts/verify/` covering
CLAUDE.md §7.1 — sufficient to guard the changes below.

## Checklist

- [x] 1. README veraltet: „All 18 acceptance criteria" vs. CLAUDE.md §7.1 = 32; Zahl nachziehen und README insgesamt überprüfen/überarbeiten.
- [x] 2. Prüfen: ist alles committet oder gibt es noch lokale modified Dateien? → Nur die von `npm test` neu erzeugten `verification/*.png` (Screenshot-Evidenz) waren modifiziert; kein Quellcode offen. Evidenz frisch committet → Baum sauber. (Reine Repo-Hygiene, kein Code-Change; kein stabiler Suite-Test möglich, da die Suite die Screenshots selbst neu erzeugt.)
- [ ] 3. Kanu-Geschwindigkeitsboost von 4x auf 2x reduzieren.
- [ ] 4. Ein Item, das im Einsatz ist, soll im Inventar aufleuchten.
- [ ] 5. Tagebuch-Bereich nicht bis ganz nach unten: Camp-/Journal-Button nicht verdecken, darüber etwas Abstand.
- [ ] 6. Canteen Capacity auf 500 reduzieren.
- [ ] 7. Überfall mit Gewehr: Sicherheitsabfrage; danach Beute mitteilen; Beute sehr reichhaltig.
- [ ] 8. Laufgeschwindigkeits-Malus mit Kanu funktioniert nicht / zu schwach — beheben.
- [ ] 9. Debounce-Radius für versehentliches erneutes Betreten von Siedlungen zu groß — verkleinern.
- [ ] 10. Hafenankunft: mitteilen, wie viel Geld für Entdeckungen und welche; Geld als „telegrafische Überweisung".
- [ ] 11. Beim Betreten einer Siedlung Fokus automatisch auf die Steuerung (kein Extra-Klick).
- [ ] 12. Karten-Labels (Wasserfall, Dorf …) erst nach Entdeckung anzeigen; bis dahin „?".
- [ ] 13. Flusswasser durchgängig (mind. der Nil hat Unterbrechungen).
- [ ] 14. Hintergrund-Landschaft von Siedlungen hat Clipping-Fehler (Berge hinter „Berber Village").

## Closing (only after all points)

1. Full regression over the whole state.
2. Thorough dead-code / stale-doc / stale-comment cleanup — as separate commits,
   not mixed with feature commits.
3. Full regression again.
