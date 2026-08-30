// The NAMES the F6 report suite prints about the downloaded archive — kept here,
// away from the Playwright suite, because two readers need them and only one of
// them can load a browser.
//
// The report suite prints a member list and one presence check per member. The
// red-charge table (scripts/render-verify-charges.mjs) matches those printed
// lines with anchored regexes so a KNOWN red is excused and nothing else is. A
// cross-vendor review of 30.08.2026 (GPT-5.6 Sol) found the gap that follows
// from writing those two sides independently: the ledger's tests hard-coded the
// joined string, so production could change its separator, its member order or
// its name shape and every boundary assertion would stay green while the charges
// silently stopped matching. Both sides now build the text HERE, so a change to
// the wording is a change both readers see.
//
// Pure string work — no imports, so the Vitest layer can read it.

/** The suffixes the archive carries, in the order the suite checks them. */
export const ARCHIVE_MEMBER_SUFFIXES = ['.png', '.json', '-overlay.json', '.txt']

/** The separator the member list is joined with. */
export const ARCHIVE_MEMBER_SEPARATOR = ', '

/** Every member name of an archive with the given download stem. */
export function archiveMemberNames(stem, suffixes = ARCHIVE_MEMBER_SUFFIXES) {
  return suffixes.map((suffix) => `${stem}${suffix}`)
}

/** The detail line the composite member check prints. */
export function archiveMemberDetail(names) {
  return names.join(ARCHIVE_MEMBER_SEPARATOR)
}

/** The name of the check that asserts one member is in the archive. */
export function memberPresentCheckName(stem, suffix) {
  return `member ${stem}${suffix} is present`
}
