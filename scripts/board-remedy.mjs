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

/** Put a card up for the work that is starting — the answer to a board-first deny. */
export const NOW_CARD_CMD = `${EDIT_CMD} now`

/**
 * Write the "nothing is running" card WITHOUT a point to close (point 470).
 *
 * The boundary is exactly the moment when no point is open, and until this
 * command existed the only writer was `board.mjs done <n> --none`, which needs a
 * current-work card for the point it closes. So a session at a boundary
 * hand-edited the board file — and a hand-edit appends, which is how three idle
 * cards came to stand stacked on the user's phone. `batch-boundary.mjs` prints
 * THIS constant, so its instruction cannot name a path that does not work.
 */
export const NONE_CARD_CMD = `${EDIT_CMD} none`

/**
 * Write the "only the closing duties are left" card (point 544).
 *
 * The third thing a session can truthfully say. A session that has merged and
 * ticked its point but still owes its closing duties is neither idle nor working
 * a numbered point, so under the idle card the point-470 deny fired on every
 * call while neither of its two remedies could reach the state. This one can,
 * and the deny names it.
 */
export const CLOSING_CARD_CMD = `${EDIT_CMD} closing`

/** The tail every board remedy ends with. */
export const REPUBLISH = `republish (${PUBLISH_CMD}) and re-run ${SYNCED_CMD}`

/** Where the board's binding contract is stated — the ONE statement of it. */
export const CONTRACT = 'the board contract (memory batch-dashboard-artifact)'
