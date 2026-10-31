const IMPORT_ID_PREFIX = 'lead-import-';

export function normalizeImportedCompanyName(companyName: string): string {
  return companyName.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
}

/** Stable document identity makes repeated Finder imports idempotent across retries and devices. */
export async function createImportedLeadDocumentId(
  ownerUid: string,
  workspaceId: string,
  companyName: string,
): Promise<string> {
  const normalizedName = normalizeImportedCompanyName(companyName);
  if (!ownerUid.trim() || !workspaceId.trim() || !normalizedName || normalizedName.length > 200) {
    throw new Error('Identitas impor prospek tidak valid.');
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error('Browser ini tidak menyediakan Web Crypto untuk impor prospek yang aman.');
  }

  const payload = `${workspaceId.trim()}\u0000${ownerUid.trim()}\u0000${normalizedName}`;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${IMPORT_ID_PREFIX}${hex}`;
}
