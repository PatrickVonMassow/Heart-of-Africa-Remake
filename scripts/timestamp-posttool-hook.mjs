// PostToolUse hook (user mandate 20.07.2026, seventh missing-timestamp
// complaint): the UserPromptSubmit banner fires only at the START of a turn,
// but the failure mode is the intermediate status lines BETWEEN tool calls in
// long multi-tool turns. This hook re-injects the CURRENT time plus the
// obligation after EVERY tool call, so the instruction always sits directly
// before the next visible text the assistant writes. Kept to one short line —
// it runs on every tool use.
const nowBerlin = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Berlin',
}).format(new Date())
console.log(
  `[zeit ${nowBerlin}] PFLICHT: Beginnt hiernach sichtbarer Text an den Nutzer, MUSS er mit "${nowBerlin}" anfangen.`,
)
