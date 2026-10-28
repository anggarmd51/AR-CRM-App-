import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

export const AI_DAILY_LIMIT = 5;

export async function reserveAiUsage(
  firestore: Firestore,
  ownerUid: string,
  requestedLimit = AI_DAILY_LIMIT,
  now = new Date(),
): Promise<boolean> {
  if (!ownerUid.trim() || !Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 20) {
    throw new Error('AI usage limit configuration is invalid.');
  }
  const dayKey = now.toISOString().slice(0, 10);
  const documentId = createHash('sha256').update(`${ownerUid}:${dayKey}`).digest('hex');
  // Keep the legacy document prefix so an existing day's shared quota is not reset during this rename.
  const ref = firestore.collection('accountPinApiUsage').doc(`lead-finder-${documentId}`);

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
