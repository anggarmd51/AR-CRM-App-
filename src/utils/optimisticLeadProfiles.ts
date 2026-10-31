import type { Lead } from '../types/crm.ts';
import type { LeadProfileEdit } from './leadProfileEdit.ts';
import type { LeadSnapshotState } from './optimisticLeadStages.ts';

interface ProfileIntent {
  token: string;
  profile: LeadProfileEdit;
  acknowledged: boolean;
}

const SERVER_SNAPSHOT: LeadSnapshotState = { fromCache: false, pendingWriteIds: new Set() };

function confirmsIntent(lead: Lead, intent: ProfileIntent): boolean {
  return lead.contact_person === intent.profile.contact_person
    && lead.phone === intent.profile.phone
    && lead.deal_value === intent.profile.deal_value
    && lead.lead_score === intent.profile.lead_score;
}

/** UI-only overlay; Firestore remains the sole source of persisted CRM data. */
export class OptimisticLeadProfileOverlay {
  private readonly intentsByLead = new Map<string, ProfileIntent[]>();

  apply(leadId: string, token: string, profile: LeadProfileEdit): void {
    const intents = this.intentsByLead.get(leadId) ?? [];
    intents.push({ token, profile: { ...profile }, acknowledged: false });
    this.intentsByLead.set(leadId, intents);
  }

  acknowledge(leadId: string, token: string): void {
    const intent = this.intentsByLead.get(leadId)?.find((candidate) => candidate.token === token);
    if (intent) intent.acknowledged = true;
  }

  rollback(leadId: string, token: string): void {
    const intents = this.intentsByLead.get(leadId);
    if (!intents) return;
    const remaining = intents.filter((intent) => intent.token !== token);
    if (remaining.length) this.intentsByLead.set(leadId, remaining);
    else this.intentsByLead.delete(leadId);
  }

  overlayLead(lead: Lead): Lead {
    const latest = this.intentsByLead.get(lead.id)?.at(-1);
    if (!latest) return lead;
    return { ...lead, ...latest.profile, _syncStatus: 'pending_update' };
  }

  reconcile(snapshotLeads: Lead[], snapshotState: LeadSnapshotState = SERVER_SNAPSHOT): Lead[] {
    return snapshotLeads.map((snapshotLead) => {
      const intents = this.intentsByLead.get(snapshotLead.id);
      if (!intents?.length) return snapshotLead;

      const latest = intents[intents.length - 1]!;
      if (latest.acknowledged
        && !snapshotState.fromCache
        && !snapshotState.pendingWriteIds.has(snapshotLead.id)
        && confirmsIntent(snapshotLead, latest)) {
        this.intentsByLead.delete(snapshotLead.id);
        return snapshotLead;
      }

      while (intents.length > 1) {
        const first = intents[0]!;
        if (!first.acknowledged
          || snapshotState.fromCache
          || snapshotState.pendingWriteIds.has(snapshotLead.id)
          || !confirmsIntent(snapshotLead, first)) break;
        intents.shift();
      }
      if (!intents.length) {
        this.intentsByLead.delete(snapshotLead.id);
        return snapshotLead;
      }
      return this.overlayLead(snapshotLead);
    });
  }
}
