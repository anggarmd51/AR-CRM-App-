import type { Lead, LeadCorrection, PipelineStage } from '../types/crm.ts';
interface LeadPatch { pipeline_stage?: PipelineStage; next_followup_date?: string; details?: LeadCorrection; }
interface Intent { token: string; patch: LeadPatch; acknowledged: boolean; }
export interface LeadSnapshotState { fromCache: boolean; pendingWriteIds: ReadonlySet<string>; }
const SERVER_SNAPSHOT: LeadSnapshotState = { fromCache: false, pendingWriteIds: new Set() };
function fields(patch: LeadPatch): Partial<Lead> {
  return { ...(patch.pipeline_stage !== undefined ? { pipeline_stage: patch.pipeline_stage } : {}),
    ...(patch.next_followup_date !== undefined ? { next_followup_date: patch.next_followup_date } : {}), ...(patch.details ?? {}) };
}
function reflectedOrSuperseded(snapshot: Lead, intents: Intent[], index: number): boolean {
  const intent = intents[index]!;
  if (!intent.acknowledged) return false;
  return Object.entries(fields(intent.patch)).every(([key, value]) => {
    let expected: unknown = value;
    for (const later of intents.slice(index + 1)) {
      const laterFields = fields(later.patch);
      if (later.acknowledged && Object.prototype.hasOwnProperty.call(laterFields, key)) expected = laterFields[key as keyof Lead];
    }
    return Object.is(snapshot[key as keyof Lead], expected);
  });
}
/** UI-only, token-scoped patches; Firestore remains the persisted source of truth. */
export class OptimisticLeadStageOverlay {
  private readonly intentsByLead = new Map<string, Intent[]>();
  apply(leadId: string, token: string, pipelineStage: PipelineStage, nextFollowupDate?: string): void {
    this.addIntent(leadId, token, { pipeline_stage: pipelineStage, ...(nextFollowupDate !== undefined ? { next_followup_date: nextFollowupDate } : {}) });
  }
  applyDetails(leadId: string, token: string, correction: LeadCorrection): void {
    this.addIntent(leadId, token, { details: { ...correction } });
  }
  acknowledge(leadId: string, token: string): void {
    const intent = this.intentsByLead.get(leadId)?.find((candidate) => candidate.token === token);
    if (intent) intent.acknowledged = true;
  }
  rollback(leadId: string, token: string): void {
    const remaining = this.intentsByLead.get(leadId)?.filter((intent) => intent.token !== token);
    if (remaining?.length) this.intentsByLead.set(leadId, remaining); else this.intentsByLead.delete(leadId);
  }
  overlayLead(lead: Lead): Lead {
    const intents = this.intentsByLead.get(lead.id);
    if (!intents?.length) return lead;
    const rendered = intents.reduce((current, intent) => ({ ...current, ...fields(intent.patch) }), lead);
    const status = lead._syncStatus === 'error' ? 'error'
      : intents.every((intent) => intent.acknowledged) ? 'synced'
        : lead._syncStatus === 'pending_insert' ? 'pending_insert' : 'pending_update';
    return { ...rendered, _syncStatus: status };
  }
  reconcile(snapshotLeads: Lead[], snapshotState: LeadSnapshotState = SERVER_SNAPSHOT): Lead[] {
    return snapshotLeads.map((snapshot) => {
      const intents = this.intentsByLead.get(snapshot.id);
      if (!intents?.length) return snapshot;
      if (!snapshotState.fromCache && !snapshotState.pendingWriteIds.has(snapshot.id)) {
        // A newer acknowledged write may supersede an older value before a
        // listener delivers an intermediate snapshot. Retire both together.
        const remaining = intents.filter((_, index) => !reflectedOrSuperseded(snapshot, intents, index));
        if (remaining.length) this.intentsByLead.set(snapshot.id, remaining);
        else { this.intentsByLead.delete(snapshot.id); return snapshot; }
      }
      return this.overlayLead(snapshot);
    });
  }
  private addIntent(leadId: string, token: string, patch: LeadPatch): void {
    const intents = this.intentsByLead.get(leadId) ?? [];
    if (intents.some((intent) => intent.token === token)) return;
    intents.push({ token, patch, acknowledged: false });
    this.intentsByLead.set(leadId, intents);
  }
}
