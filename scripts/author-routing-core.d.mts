// Types for the authoring router (author-routing-core.mjs), used by the scarce-lane
// escalation prose check in src/config/scarceEscalationDoc.test.ts. Only what a
// typed caller imports is declared here; add a symbol when a TS consumer needs it.

/** The CLAUDE.md §6 threshold: unsuccessful review rounds before the scarce lane escalates. */
export declare const SCARCE_ESCALATION_ROUNDS: number

/** The round on which the spec itself is examined instead of re-authored. */
export declare const SPEC_EXAMINATION_ROUND: number

/** The words prose names the scarce lane by: its role and its family words. */
export declare const SCARCE_LANE_WORDS: readonly string[]
