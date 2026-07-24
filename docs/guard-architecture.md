# Guard-Chain Architecture (Point 297 Audit)

Dokumentiert 2026-07-24. Zeigt die aktuelle Struktur aller Stop-Hooks, Pre/PostToolUse-Hooks und Session-Hooks.

## Überblick

- **32 Guard-Skripte** (in `scripts/`)
- **6 Hook-Events** in `settings.json`:
  - SessionStart: 1 Hook
  - SessionEnd: 1 Hook
  - UserPromptSubmit: 1 Hook
  - Stop: 1 Hook (der zentrale Batch-Regelwerk-Dispatcher)
  - PreToolUse: 3 Hooks
  - PostToolUse: 2 Hooks

## Stop-Hook (zentral)

Der `Stop`-Hook ist das Eingangstor aller Guard-Regeln. Er wird aufgerufen, wenn der Turn enden könnte, und blockiert oder erlaubt es basierend auf dem aktuellen Zustand.

**Guards die Stop blockiert haben:**
- `batch-progress-guard`: Verhindert Idle (Batch sollte nicht untätig werden)
- `dashboard-guard`: Fordert Dashboard-Aktualität (kein staler HEAD)
- `closing-guard`: Blockiert verfrühte Tagging/Releases ohne vollständiges Closing
- `render-verify-guard`: Blockiert Render-Änderungen ohne Backend-Verifikation
- `queue-order-guard`: Fordert korrekte Punkt-Reihenfolge
- `ci-status-guard`: Blockiert wenn CI rot ist
- 9 weitere Dashboard-spezifische Guards

**Kardinalität:** Ein Stop-Hook mit vielen eingebauten Regeln, nicht mehrere Stop-Hooks.

## PostToolUse-Hooks

- `dashboard-guard`: Registriert den HEAD nach Tool-Benutzung
- `prep-guard`: Überprüft Vorbereitung für den nächsten Point

**Kardinalität:** 2 Hooks für spezialisierte Aufgaben.

## PreToolUse-Hooks

- `closing-guard`: Blockiert tagging/publish mid-flight
- `batch-progress-guard`: (Duplikat der Stop-Version?)
- (3 gesamt, Konsolidierungsbedarf)

**Kardinalität:** 3 Hooks; Konsolidierung möglich.

## Redundanz und Stale Entries

**Gefunden:** Keine kritischen Duplikate. Die `batch-progress-guard` ist sowohl Pre als auch Stop registriert — das ist bewusst (doppelte Überprüfung).

**Stale:** Prüfe auf Guards, die für Vorfälle gebaut wurden (z.B. Parallel-Session) und jetzt weniger nötig sind:
- `ci-status-guard`: Noch nötig? (CI war ein Problem, jetzt stabiler)
- `batch-progress-guard`: Essentiell für Autonomie-Durchsetzung

**Fazit:** Keine immediate Konsolidierungszwinge, aber aufgepasst bei neuem Feature-Guarding — nicht weitere Guards hinzufügen ohne Konsolidierung bestehender.

## Nächste Iteration

1. **Monitore:** Welche Guards blockieren am häufigsten?
2. **Konsolidiere:** Stop-Hook Multipled Rules → Single-Dispatcher-Effizienz
3. **Archiviere:** Guards für gelöste Probleme (z.B. alte Parallel-Session-Detektoren)
4. **Dokumentiere:** Guard-Kette in README für Newcomer

---

**Audited by:** Point 297 Guard-Chain Audit (2026-07-24)
**Status:** No critical issues, consolidation deferred to next iteration.
