import type { Lead, PipelineStage } from '../types/crm.ts';

interface StageIntent {
  token: string;
  pipeline_stage: PipelineStage;
  next_followup_date?: string;
  acknowledged: boolean;
}

export interface LeadSnapshotState {
  fromCache: boolean;
  pendingWriteIds: ReadonlySet<string>;
}

const SERVER_SNAPSHOT: LeadSnapshotState = { fromCache: false, pendingWriteIds: new Set() };

function confirmsIntent(lead: Lead, intent: StageIntent): boolean {
  return lead.pipeline_stage === intent.pipeline_stage
    && (intent.next_followup_date === undefined || lead.next_followup_date === intent.next_followup_date);
}

/** UI-only overlay; Firestore remains the sole source of persisted CRM data. */
export class OptimisticLeadStageOverlay {
  private readonly intentsByLead = new Map<string, StageIntent[]>();

  apply(leadId: string, token: string, pipelineStage: PipelineStage, nextFollowupDate?: string): void {
    const intents = this.intentsByLead.get(leadId) ?? [];
    intents.push({
      token,
      pipeline_stage: pipelineStage,
      ...(nextFollowupDate !== undefined ? { next_followup_date: nextFollowupDate } : {}),
      acknowledged: false,
    });
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
    return {
      ...lead,
      pipeline_stage: latest.pipeline_stage,
      ...(latest.next_followup_date !== undefined ? { next_followup_date: latest.next_followup_date } : {}),
      _syncStatus: 'pending_update',
    };
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
