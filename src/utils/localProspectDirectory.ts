export const LOCAL_PROSPECT_DIRECTORY_STORAGE_KEY = 'ar-crm:lead-finder:local-directory:v1';

function getBrowserStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Reads the pre-existing browser value without seeding, normalizing, or writing anything. */
export function readExistingLocalProspectBackup(
  storage: Storage | null | undefined = getBrowserStorage(),
): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(LOCAL_PROSPECT_DIRECTORY_STORAGE_KEY);
  } catch {
    return null;
  }
}
