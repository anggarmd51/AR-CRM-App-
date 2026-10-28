export type PipelineStage = 'Prospect' | 'Meeting' | 'Negotiation' | 'Closing Won' | 'Closing Lost';

export type LeadScore = 'Hot' | 'Warm' | 'Cold' | 'Unrated';

export interface ActivityGpsLocation {
  latitude: number;
  longitude: number;
  accuracy_m: number;
}

export type ActivitySummarySource = 'gemini' | 'local';

export interface Lead {
  id: string;
  company_name: string;
  contact_person: string;
  phone: string;
  industry: string;
  city: string;
  pipeline_stage: PipelineStage;
  deal_value: number;
  next_followup_date: string;
  lead_score: LeadScore;
  created_at?: string;
  updated_at?: string;
  _syncStatus?: 'synced' | 'pending_insert' | 'pending_update' | 'error';
}

export interface Activity {
  id: string;
  lead_id: string;
  activity_type: string;
  notes: string;
  ai_summary?: string;
  ai_summary_source?: ActivitySummarySource;
  location_gps?: ActivityGpsLocation;
  created_at?: string;
  _syncStatus?: 'synced' | 'pending_insert' | 'pending_update' | 'error';
}

export interface GlobalLead {
  id?: string;
  company_name: string;
  contact_person: string;
  phone: string;
  industry: string;
  city: string;
  estimated_value?: number;
  tags?: string[];
  alreadyImported?: boolean;
  decision_maker_title?: string;
  email?: string;
  ai_match_score?: number;
  ai_source_urls?: string[];
  intent_level?: 'High Intent' | 'In-Market' | 'Strong Fit' | 'Surge Intent';
  company_initials?: string;
  is_ai_enriched?: boolean;
  insights?: string;
  employee_count?: string;
}

export interface WonDealArchiveRecord {
  id: string;
  lead_id: string;
  company_name: string;
  contact_person: string;
  phone: string;
  deal_value: number;
  industry: string;
  city: string;
  won_date: string;
  archived_at: string;
}

export interface SecuritySettings {
  isEnabled: boolean;
  pin: string | null;
  useBiometric: boolean;
  autoLockMinutes: number;
  lastUnlockTimestamp: number;
}

export interface QueuedMutation {
  id: string;
  action: 'addLead' | 'updateLeadStage' | 'addActivity' | 'importGlobalLead' | 'archiveClosingWon';
  payload: Record<string, any>;
  timestamp: number;
  retries: number;
  status: 'pending' | 'syncing' | 'failed';
  errorMessage?: string;
}

export interface PipelineMetrics {
  totalPipelineValue: number;
  wonValue: number;
  activeValue: number;
  weightedPipelineValue: number;
  stageCounts: Record<PipelineStage, number>;
  totalLeads: number;
  winRatePercentage: number;
}

export interface FollowUpCategory {
  overdue: Lead[];
  dueToday: Lead[];
  upcoming: Lead[];
  noDate: Lead[];
}

export const PIPELINE_STAGES: PipelineStage[] = [
  'Prospect',
  'Meeting',
  'Negotiation',
  'Closing Won',
  'Closing Lost',
];

export const STAGE_CONFIG: Record<
  PipelineStage,
  {
    label: string;
    color: string;
    badgeBg: string;
    border: string;
    probability: number;
    description: string;
  }
> = {
  Prospect: {
    label: 'Prospect',
    color: 'text-[#1f1f1f]',
    badgeBg: 'bg-[#f8f5ee] text-[#1f1f1f] border border-[#1f1f1f]',
    border: 'border-l-[#1f1f1f]',
    probability: 0.2,
    description: 'Initial qualification & discovery',
  },
  Meeting: {
    label: 'Meeting',
    color: 'text-[#ff4800]',
    badgeBg: 'bg-[#fff5f0] text-[#ff4800] border border-[#ff4800]/50',
    border: 'border-l-[#ff4800]',
    probability: 0.5,
    description: 'Presentation, demo or on-site check-in',
  },
  Negotiation: {
    label: 'Negotiation',
    color: 'text-[#1f1f1f]',
    badgeBg: 'bg-[#eae4d5] text-[#1f1f1f] border border-[#1f1f1f]',
    border: 'border-l-[#1f1f1f]',
    probability: 0.8,
    description: 'Commercial proposal & contract terms',
  },
  'Closing Won': {
    label: 'Won',
    color: 'text-[#155e3c]',
    badgeBg: 'bg-[#edf7f1] text-[#155e3c] border border-[#155e3c]/40',
    border: 'border-l-[#155e3c]',
    probability: 1.0,
    description: 'Deal closed and contracted successfully',
  },
  'Closing Lost': {
    label: 'Lost',
    color: 'text-[#6b665c]',
    badgeBg: 'bg-[#f0ebe0] text-[#6b665c] border border-[#6b665c]/40',
    border: 'border-l-[#6b665c]',
    probability: 0.0,
    description: 'Disqualified or chose competitor',
  },
};
