const WON_SNAPSHOT_FIELDS = [
  'company_name', 'contact_person', 'phone', 'industry', 'city', 'deal_value',
] as const;

/**
 * One immutable archive represents the first win for a lead. Re-entering Won
 * may reuse it only when the current snapshot still matches. A changed sales
 * opportunity needs a new lead; this helper never rewrites historical data.
 * Schema validation and authorization remain enforced by Firestore Rules.
 */
export function wonArchiveMatchesLeadSnapshot(
  archive: Record<string, unknown>,
  lead: Record<string, unknown>,
  leadId: string,
  ownerId: string,
): boolean {
  return archive.lead_id === leadId
    && archive.ownerId === ownerId
    && archive.role === 'owner'
    && WON_SNAPSHOT_FIELDS.every((field) => Object.is(archive[field], lead[field]));
}
