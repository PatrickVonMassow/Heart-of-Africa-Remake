#!/usr/bin/env node
// UserPromptSubmit hook (user-global): inject the current Europe/Berlin timestamp
// into the model context on EVERY user prompt, so each chat reply can begin with
// it per the chat-timestamp rule ("**Donnerstag, 23.07.2026, 07:04**").
// Computed via Node ICU (toLocaleString with timeZone), never via TZ= in Git-Bash.
// Live install: C:\Users\Patri\.claude\hooks\berlin-timestamp.cjs
// Versioned copy: scripts/hooks/berlin-timestamp.cjs in the hoa repo.
'use strict';

const now = new Date();
const berlin = { timeZone: 'Europe/Berlin' };
const weekday = now.toLocaleString('de-DE', { ...berlin, weekday: 'long' });
const date = now.toLocaleString('de-DE', {
  ...berlin, day: '2-digit', month: '2-digit', year: 'numeric',
});
const time = now.toLocaleString('de-DE', {
  ...berlin, hour: '2-digit', minute: '2-digit', hour12: false,
});
const stamp = `${weekday}, ${date}, ${time}`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext:
      `Turn START time: ${stamp} (Europe/Berlin) — this is a reading taken NOW, ` +
      `at the top of the turn, and it AGES while the turn runs. BEGIN your reply ` +
      `with the timestamp in bold ("**${stamp}**") per the chat-timestamp rule; ` +
      `if tool calls have run since, MEASURE the time again immediately before ` +
      `writing the reply instead of using this value or extrapolating from it ` +
      `(the guard compares exactly, and step durations are systematically ` +
      `over-estimated): node -e "console.log(new Intl.DateTimeFormat('de-DE',` +
      `{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',` +
      `minute:'2-digit',timeZone:'Europe/Berlin'}).format(new Date()))"`,
  },
}) + '\n');
