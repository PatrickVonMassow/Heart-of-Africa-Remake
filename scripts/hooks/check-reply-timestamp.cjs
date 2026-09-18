#!/usr/bin/env node
// Stop hook (user-global, soft enforcement): after each turn, check whether the
// last assistant reply BEGAN with a bold Europe/Berlin timestamp
// ("**Donnerstag, 23.07.2026, 07:04**"). If not, emit a systemMessage nudge.
// NEVER blocks (no decision/continue fields) — a soft reminder only, so the
// batch and subagent sessions are never stalled by this hook.
// Fail-soft by design: any read/parse problem exits 0 with no output.
// Live install: C:\Users\Patri\.claude\hooks\check-reply-timestamp.cjs
// Versioned copy: scripts/hooks/check-reply-timestamp.cjs in the hoa repo.
'use strict';

const fs = require('fs');

const TIMESTAMP_RE = /^\*\*[A-Za-zÄÖÜäöüß]+, \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}\*\*/;

function main() {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch { return; }
  let payload;
  try { payload = JSON.parse(input); } catch { return; }
  const transcriptPath = payload && payload.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return;

  // The user-visible reply of the current turn is the LAST assistant text block
  // AFTER the most recent real user prompt (tool results also arrive as type
  // "user" entries but carry tool_result blocks, not text/string). Earlier text
  // blocks of the same turn are progress notes written between tool calls; the
  // harness asks for them and they carry no timestamp, so checking the FIRST
  // block flagged every reply that ran a tool (false positive, 18.09.2026).
  let lastText = null;
  let lines;
  try { lines = fs.readFileSync(transcriptPath, 'utf8').split('\n'); } catch { return; }
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || !entry.message) continue;
    const content = entry.message.content;
    if (entry.type === 'user') {
      const isRealPrompt = typeof content === 'string'
        || (Array.isArray(content) && content.some((c) => c && c.type === 'text'));
      if (isRealPrompt) lastText = null; // new turn — start looking again
      continue;
    }
    if (entry.type !== 'assistant') continue;
    if (!Array.isArray(content)) continue;
    const textBlock = content.find(
      (c) => c && c.type === 'text' && typeof c.text === 'string' && c.text.trim() !== '',
    );
    if (textBlock) lastText = textBlock.text.trim();
  }
  if (lastText === null) return;
  if (TIMESTAMP_RE.test(lastText)) return;

  process.stdout.write(JSON.stringify({
    systemMessage:
      'Chat-Zeitstempel-Regel verletzt: Die letzte Antwort begann NICHT mit dem ' +
      'fetten Berlin-Zeitstempel (z. B. "**Donnerstag, 23.07.2026, 07:04**"). ' +
      'Jede Chat-Antwort muss damit beginnen.',
  }) + '\n');
}

main();
