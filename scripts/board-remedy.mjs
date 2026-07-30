// The board's remedy text, in ONE place (point 435).
//
// A remedy is read at the MOMENT OF A BLOCK and followed literally, so a stale
// one is not stale prose — it is an instruction into a path that no longer
// exists. Until 30.07.2026 five board guards, the one-command loop and the
// archive rotation each carried their own copy of the publish steps, and every
// copy still named the claude.ai mirror the user retired on 29.07.2026.
//
// Two rules keep that from recurring:
//   - the COMMANDS live here and nowhere else, so a transport change is one edit;
//   - the board CONTRACT — the four-section structure, the transport, the update
//     discipline — is stated exactly ONCE, in the memory `batch-dashboard-artifact`.
//     Every other place refers to it (CONTRACT below) instead of restating it.

/** Publish the board to the live page. Works in EVERY session, headless included. */
export const PUBLISH_CMD = 'node scripts/board-publish.mjs'

/** Attest the published board; doubles as the focus confirmation. */
export const SYNCED_CMD = 'node scripts/dashboard-guard.mjs --synced'

/** Edit a card without touching the markup (whole-card edits, no text replacement). */
export const EDIT_CMD = 'node scripts/board.mjs'

/** The tail every board remedy ends with. */
export const REPUBLISH = `republish (${PUBLISH_CMD}) and re-run ${SYNCED_CMD}`

/** Where the board's binding contract is stated — the ONE statement of it. */
export const CONTRACT = 'the board contract (memory batch-dashboard-artifact)'
