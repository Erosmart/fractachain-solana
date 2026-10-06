/**
 * Pure offering-lifecycle rules shared between the settlement sweep and the
 * test runner — no RPC. Mirrors the old stellar/licitacion_state.ts helpers.
 */
import { OfferingStateName } from './offering_state';

const STATE_ORDER: OfferingStateName[] = [
  'Draft',
  'Minted',
  'Open',
  'Successful',
  'Failed',
  'Terminated',
];

/** Maps an Anchor enum (object or name) to its numeric variant. */
export function parseOfferingState(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return STATE_ORDER.indexOf(raw as OfferingStateName);
  if (raw && typeof raw === 'object') {
    const tag = (raw as { tag?: string }).tag;
    if (tag) return STATE_ORDER.indexOf(tag as OfferingStateName);
    for (const name of STATE_ORDER) {
      if (name.toLowerCase() in (raw as Record<string, unknown>)) {
        return STATE_ORDER.indexOf(name);
      }
    }
  }
  return -1;
}

export function canFinalizeFromSnapshot(snap: {
  state: number;
  raised: number;
  hardCap: number;
  deadlineMs: number | null;
  nowMs?: number;
}): { canFinalize: boolean; reason: 'hard_cap' | 'deadline' | 'waiting' | 'already_closed' } {
  if (snap.state !== 2 /* Open */) return { canFinalize: false, reason: 'already_closed' };
  if (snap.raised >= snap.hardCap) return { canFinalize: true, reason: 'hard_cap' };
  const now = snap.nowMs ?? Date.now();
  if (snap.deadlineMs != null && now >= snap.deadlineMs) {
    return { canFinalize: true, reason: 'deadline' };
  }
  return { canFinalize: false, reason: 'waiting' };
}
