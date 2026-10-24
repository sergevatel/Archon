/**
 * List what the revisit reads: the blocked items due for the revisit agent, on a run
 * that names no item, and the waiting items whose blockers have all closed or merged,
 * on every run. A blocker's state is a fact the forge reports, so a woken item goes to
 * re-triage without an agent, and a run that builds a named item checks waits too. A
 * blocker that cannot be read leaves its item waiting, noted, for the next run.
 *
 * Bound inputs: the workflow inputs INPUTS_NUMBER, INPUTS_RETRIAGE_AS, INPUTS_REPO_HOST
 * and INPUTS_REPO_PATH.
 */

import { revisitDue, type WaitingItem } from '../../.shared/build.ts';
import { forgeSource, type QualifiedPr } from '../../.shared/forge.ts';
import { emit, note, refuse, trimmed } from '../../.shared/io.ts';
import { NotAnIssueError, viewIssue } from '../../.shared/issue.ts';
import { viewPr } from '../../.shared/pr.ts';

/** `open`, or how the issue or pull request was settled. */
function blockerState(ref: QualifiedPr): 'open' | 'closed' | 'merged' {
  try {
    return viewIssue(ref).state;
  } catch (error) {
    if (!(error instanceof NotAnIssueError)) throw error;
    return viewPr(ref, forgeSource()).pr.state;
  }
}

/** The item's wake reason once every blocker closed or merged; null while any is open. */
function woken(item: WaitingItem, repo: QualifiedPr['repo']): { number: number; reason: string } | null {
  const settled: string[] = [];
  for (const number of item.blockers) {
    const state = blockerState({ repo, number });
    if (state === 'open') return null;
    settled.push(`#${String(number)} ${state}`);
  }
  return { number: item.number, reason: `its blockers settled: ${settled.join(', ')}` };
}

function main(): void {
  const repo = { host: trimmed(process.env.INPUTS_REPO_HOST), path: trimmed(process.env.INPUTS_REPO_PATH) };
  // Both need a login to request the re-triage as.
  const due = trimmed(process.env.INPUTS_RETRIAGE_AS) === '' ? { blocked: [], waiting: [] } : revisitDue(new Date().toISOString());
  const blocked = trimmed(process.env.INPUTS_NUMBER) === '' ? due.blocked : [];
  const { waiting } = due;
  const wake = waiting.flatMap(item => {
    try {
      return woken(item, repo) ?? [];
    } catch (error) {
      note(`issue ${String(item.number)} keeps waiting: a blocker could not be read: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  });
  emit({ blocked, blocked_count: blocked.length, woken: wake });
}

try {
  main();
} catch (error) {
  refuse(`build-queue blocked: ${error instanceof Error ? error.message : String(error)}`);
}
