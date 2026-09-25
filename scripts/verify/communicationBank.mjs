import assert from 'node:assert/strict'

/** One healthy cycle at its configured backstops. Every child can own a run;
 * stone approaches can outlast a run, and tap/return/end holds stop its clock.
 * Include the ordinary floor window for the call, climb, announcements, taps
 * and each child's arrivals. Floor starvation remains a product assertion. */
export function bankCycleSeconds(bank, communication, childCount) {
  assert(childCount >= 2, 'The bank lesson needs at least two children')
  const gap = Math.max(bank.utteranceGapSeconds,
    4 * communication.syllableSeconds + communication.consequenceSeconds)
  const roam = bank.roamSeconds * (1 + bank.roamSpread) + bank.roamGuardSeconds +
    bank.climbRiseSeconds + bank.climbHoldSeconds + bank.climbSinkSeconds
  const run = bank.runSeconds + bank.tapPauseSeconds + bank.tapReturnSeconds +
    bank.arrivalApproachSeconds + bank.arrivalHoldSeconds + (2 + childCount) * gap
  return roam + bank.gatherSeconds + childCount * run +
    (childCount - 1) * bank.regroupSeconds + bank.partSeconds + bank.endPauseSeconds + 2 * gap
}

/** Stay within earshot through ROCK, then give the following visible call its
 * own full cycle. A short polling timeout only means follow the moving group
 * again. The ROCK event comes from the subscribed hearing history, so a word
 * heard during a walk is retained even after its note disappears. */
export async function followBankTeaching({ cycleSeconds, approach, readRock, waitForRock, onRock, call, now = Date.now }) {
  const budgetMs = Math.ceil(cycleSeconds * 1000)
  const deadline = now() + budgetMs
  let rock = await readRock()
  while (!rock) {
    assert(now() < deadline, `No ROCK hearing within the ${cycleSeconds}s bank cycle`)
    await approach()
    rock = await readRock()
    if (rock) break
    const remaining = deadline - now()
    assert(remaining > 0, `No ROCK hearing within the ${cycleSeconds}s bank cycle`)
    rock = await waitForRock(Math.min(20000, remaining))
  }
  await onRock(rock)
  return call(budgetMs)
}

/** Keep the actual hearing records in the receipt, including both clocks and
 * the earlier vocabulary, rather than reporting a hard-coded lesson order. */
export function bankTeachingOrder(hearings, call) {
  const rock = hearings.find((h) => h.concept === 'ROCK') ?? null
  const river = hearings.find((h) => h.concept === 'RIVER') ?? null
  return { rock, river, callShownAt: call.shownAt,
    rockBeforeRiver: !!rock && !!river && river.heardBefore.includes(rock.atom),
    rockBeforeCall: !!rock && rock.pageMs <= call.shownAt * 1000 }
}
