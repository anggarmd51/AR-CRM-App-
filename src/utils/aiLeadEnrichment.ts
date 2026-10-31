import { GlobalLead } from '../types/crm.ts';

/**
 * External prospect discovery is intentionally unavailable until a real,
 * permissioned source with provenance is connected. Never synthesize contacts,
 * phone numbers, email addresses, intent, or deal values for CRM import.
 */
export const ENRICHED_PROSPECT_DATABASE: GlobalLead[] = [];

export function searchAndEnrichProspects(_rawQuery: string): GlobalLead[] {
  return [];
}
