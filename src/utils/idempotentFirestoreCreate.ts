import {
  getDocFromServer,
  setDoc,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore';

/**
 * Retry a create at its stable document path. If the original response was lost
 * after commit, Rules may reject the repeated setDoc as an update; a server-only
 * read of the exact expected fields then reconciles that ambiguous outcome.
 */
export async function setDocWithServerReconciliation(
  reference: DocumentReference,
  writeData: DocumentData,
  expectedData: DocumentData,
): Promise<void> {
  try {
    await setDoc(reference, writeData);
  } catch (writeError) {
    try {
      const snapshot = await getDocFromServer(reference);
      if (snapshot.exists() && matchesExpectedFields(snapshot.data(), expectedData, writeData)) return;
    } catch {
      // If the read is offline/denied, preserve the original write failure for normal queue retry handling.
    }
    throw writeError;
  }
}

function matchesExpectedFields(actual: DocumentData, expected: DocumentData, writeData: DocumentData): boolean {
  const fields = Object.entries(expected);
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(writeData).sort();
  return fields.length > 0
    && actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index])
    && fields.every(([key, value]) => Object.is(actual[key], value));
}
