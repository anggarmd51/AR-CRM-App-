import type { Activity, Lead, LeadScore, WonDealArchiveRecord } from '../types/crm.ts';
import { calculatePipelineMetrics, toDateStringOnly } from './crmCalculations.ts';

export interface LocalCrmExportCoverage {
  leads_from_cache: boolean;
  activities_from_cache: boolean;
  archives_from_cache: boolean;
  pending_mutations: number;
  failed_mutations: number;
}

export interface LocalCrmExportInput {
  workspaceId: string;
  ownerId: string;
  leads: Lead[];
  activities: Activity[];
  wonDealArchives: WonDealArchiveRecord[];
  coverage: LocalCrmExportCoverage;
  exportedAt?: string;
}

export interface LocalCrmExportBundle {
  schema_version: 1;
  exported_at: string;
  scope: {
    workspace_id: string;
    owner_id: string;
    source: 'firebase-client-snapshot';
  };
  coverage: LocalCrmExportCoverage & {
    current_server_snapshot: boolean;
    limitation: string;
  };
  summary: {
    lead_count: number;
    activity_count: number;
    won_deal_archive_count: number;
    pipeline: ReturnType<typeof calculatePipelineMetrics>;
    lead_score_counts: Record<LeadScore, number>;
    activity_type_counts: Record<string, number>;
    activities_by_lead: Record<string, number>;
    integrity: {
      won_leads_without_archive: number;
      archives_without_lead: number;
      activities_without_lead: number;
    };
  };
  records: {
    leads: Lead[];
    activities: Activity[];
    won_deal_archives: WonDealArchiveRecord[];
  };
  restore_notice: string;
}

const EXPORT_LIMITATION = 'Ekspor ini hanya snapshot yang tersedia pada klien saat ini; ini bukan backup/restore Cloud Firestore dan tidak menjamin data yang belum tersinkron ikut tercakup.';

export function buildLocalCrmExport(input: LocalCrmExportInput): LocalCrmExportBundle {
  if (!input.workspaceId.trim() || !input.ownerId.trim()) {
    throw new Error('Workspace dan owner harus tersedia sebelum ekspor CRM dibuat.');
  }

  const leadIds = new Set(input.leads.map((lead) => lead.id));
  const archiveLeadIds = new Set(input.wonDealArchives.map((archive) => archive.lead_id));
  const scoreCounts: Record<LeadScore, number> = { Hot: 0, Warm: 0, Cold: 0, Unrated: 0 };
  const activityTypeCounts: Record<string, number> = {};
  const activitiesByLead: Record<string, number> = {};

  for (const lead of input.leads) scoreCounts[lead.lead_score] = (scoreCounts[lead.lead_score] ?? 0) + 1;
  for (const activity of input.activities) {
    activityTypeCounts[activity.activity_type] = (activityTypeCounts[activity.activity_type] ?? 0) + 1;
    activitiesByLead[activity.lead_id] = (activitiesByLead[activity.lead_id] ?? 0) + 1;
  }

  const currentServerSnapshot = !input.coverage.leads_from_cache
    && !input.coverage.activities_from_cache
    && !input.coverage.archives_from_cache
    && input.coverage.pending_mutations === 0
    && input.coverage.failed_mutations === 0;

  return {
    schema_version: 1,
    exported_at: input.exportedAt ?? new Date().toISOString(),
    scope: {
      workspace_id: input.workspaceId,
      owner_id: input.ownerId,
      source: 'firebase-client-snapshot',
    },
    coverage: {
      ...input.coverage,
      current_server_snapshot: currentServerSnapshot,
      limitation: EXPORT_LIMITATION,
    },
    summary: {
      lead_count: input.leads.length,
      activity_count: input.activities.length,
      won_deal_archive_count: input.wonDealArchives.length,
      pipeline: calculatePipelineMetrics(input.leads),
      lead_score_counts: scoreCounts,
      activity_type_counts: activityTypeCounts,
      activities_by_lead: activitiesByLead,
      integrity: {
        won_leads_without_archive: input.leads.filter((lead) => lead.pipeline_stage === 'Closing Won' && !archiveLeadIds.has(lead.id)).length,
        archives_without_lead: input.wonDealArchives.filter((archive) => !leadIds.has(archive.lead_id)).length,
        activities_without_lead: input.activities.filter((activity) => !leadIds.has(activity.lead_id)).length,
      },
    },
    records: {
      leads: input.leads,
      activities: input.activities,
      won_deal_archives: input.wonDealArchives,
    },
    restore_notice: 'File ini dimaksudkan sebagai ekspor baca-lokal untuk mitigasi awal. Tidak tersedia pemulihan otomatis dari file ini.',
  };
}

export function downloadLocalCrmExport(input: LocalCrmExportInput, customFilename?: string): string {
  const bundle = buildLocalCrmExport(input);
  const date = toDateStringOnly(new Date()) ?? '';
  const filename = customFilename ?? `AR_CRM_Ekspor_Lokal_${date}.json`;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });

  if (typeof window !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return filename;
}
