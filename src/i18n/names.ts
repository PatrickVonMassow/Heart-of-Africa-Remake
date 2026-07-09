// Helper for journal texts that need to list discovered place/landmark names
// from a comma-joined id list (design.md §10 discovery bounty). Kept out of the
// language files on purpose: the voice-markup scanner greps de.ts/en.ts for
// `[tag]` patterns, and an inline `dict[id]` index would look like a `[id]` tag.
export function namesFromCsv(csv: unknown, dict: Record<string, string>): string {
  return String(csv ?? '')
    .split(',')
    .filter(Boolean)
    .map((k) => dict[k] ?? k)
    .join(', ')
}
