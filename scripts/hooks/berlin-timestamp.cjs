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
      `Current time: ${stamp} (Europe/Berlin). BEGIN your reply with this exact ` +
      `timestamp in bold ("**${stamp}**"), per the chat-timestamp rule.`,
  },
}) + '\n');
