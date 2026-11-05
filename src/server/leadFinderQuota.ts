import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

export const MEETING_SUMMARY_DAILY_LIMIT = 5;
export const LEAD_FINDER_DAILY_LIMIT = 30;
export type AiUsageScope = 'lead-finder' | 'meeting-summary';

const USAGE_DOCUMENT_PREFIX: Record<AiUsageScope, string> = {
  // Preserve the existing Lead Finder document IDs so current-day counters survive this release.
  'lead-finder': 'lead-finder-',
  'meeting-summary': 'meeting-summary-',
};

export async function reserveAiUsage(
  firestore: Firestore,
  ownerUid: string,
  requestedLimit = MEETING_SUMMARY_DAILY_LIMIT,
  now = new Date(),
  scope: AiUsageScope = 'lead-finder',
): Promise<boolean> {
  if (!ownerUid.trim()
    || !Number.isInteger(requestedLimit)
    || requestedLimit < 1
    || requestedLimit > LEAD_FINDER_DAILY_LIMIT
    || !Object.hasOwn(USAGE_DOCUMENT_PREFIX, scope)) {
    throw new Error('AI usage limit configuration is invalid.');
  }
  const dayKey = now.toISOString().slice(0, 10);
  const documentId = createHash('sha256').update(`${ownerUid}:${dayKey}`).digest('hex');
  const ref = firestore.collection('accountPinApiUsage').doc(`${USAGE_DOCUMENT_PREFIX[scope]}${documentId}`);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : undefined;
    const used = data?.dayKey === dayKey && Number.isInteger(data.count) && data.count >= 0
      ? data.count as number
      : 0;
    if (used >= requestedLimit) return false;
    transaction.set(ref, {
      dayKey,
      count: used + 1,
      updatedAt: now,
    });
    return true;
  });
}
