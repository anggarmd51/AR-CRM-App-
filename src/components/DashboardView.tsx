import React from 'react';
import {
  DollarSign,
  TrendingUp,
  Clock,
  CalendarClock,
  Phone,
  MessageCircle,
  MapPin,
  CheckCircle2,
  ChevronRight,
  Flame,
  Plus,
  Briefcase,
  AlertCircle,
  Building2,
  Sparkles,
  FileSpreadsheet,
} from 'lucide-react';
import { Lead, Activity, STAGE_CONFIG, PipelineStage } from '../types/crm.ts';
import {
  calculatePipelineMetrics,
  filterFollowUps,
  formatCurrency,
  formatDateDisplay,
} from '../utils/crmCalculations.ts';

interface DashboardViewProps {
  leads: Lead[];
  activities: Activity[];
  onOpenQuickLead: () => void;
  onOpenActivityLogger: (lead?: Lead) => void;
  onSelectLead: (lead: Lead) => void;
  onOpenWhatsApp: (lead: Lead) => void;
  onNavigateToPipeline: () => void;
  onNavigateToFinder: () => void;
  onExportCsv?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  leads,
  activities,
  onOpenQuickLead,
  onOpenActivityLogger,
  onSelectLead,
  onOpenWhatsApp,
  onNavigateToPipeline,
  onNavigateToFinder,
  onExportCsv,
}) => {
  const metrics = calculatePipelineMetrics(leads);
  const followUps = filterFollowUps(leads);

  return (
    <div className="space-y-6 pb-24">
      {/* 1. FINANCIAL METRICS HERO */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#1f1f1f] tracking-tight flex items-center gap-2 font-serif-heading">
              <TrendingUp className="w-5 h-5 text-[#ff4800]" />
              Financial & Pipeline Forecast
            </h2>
            <p className="text-xs text-[#6b665c] font-medium">
              Real-time revenue forecast and pipeline health across active deals
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onExportCsv && (
              <button
                onClick={onExportCsv}
                title="Download CSV Rekapitulasi Leads"
                className="text-xs font-semibold text-[#1f1f1f] hover:text-[#ff4800] flex items-center gap-1.5 px-3 py-1.5 bg-[#f8f5ee] hover:bg-[#f2ede4] border border-[#1f1f1f] rounded-[8px] transition-all active:scale-95"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#ff4800]" />
                <span className="hidden sm:inline">Export CSV</span>
              </button>
            )}
            <button
              onClick={onNavigateToPipeline}
              className="text-xs font-semibold text-[#1f1f1f] hover:text-[#ff4800] flex items-center gap-1 group transition-colors px-3 py-1.5 bg-[#f8f5ee] hover:bg-[#f2ede4] border border-[#1f1f1f] rounded-[8px]"
            >
              <span>Kanban Board</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#ff4800] group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Metric Cards Grid: Warm Parchment Surfaces with 1px Hairline Ink Borders & 16px Radius */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Total Pipeline */}
          <div className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-4">
            <div className="flex items-center justify-between text-[#6b665c] mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Total Pipeline</span>
              <DollarSign className="w-4 h-4 text-[#ff4800]" />
            </div>
            <div className="text-lg md:text-xl font-extrabold text-[#1f1f1f]">
              {formatCurrency(metrics.totalPipelineValue)}
            </div>
            <div className="text-[11px] text-[#6b665c] mt-0.5">
              {metrics.totalLeads} accounts registered
            </div>
          </div>

          {/* Won Revenue */}
          <div className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-4">
            <div className="flex items-center justify-between text-[#1f1f1f] mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Closed Won</span>
              <CheckCircle2 className="w-4 h-4 text-[#ff4800]" />
            </div>
            <div className="text-lg md:text-xl font-extrabold text-[#1f1f1f]">
              {formatCurrency(metrics.wonValue)}
            </div>
            <div className="text-[11px] text-[#6b665c] mt-0.5 font-medium">
              Win Rate: {metrics.winRatePercentage}%
            </div>
          </div>

          {/* Active Deals */}
          <div className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-4">
            <div className="flex items-center justify-between text-[#6b665c] mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Active Deals</span>
              <Briefcase className="w-4 h-4 text-[#1f1f1f]" />
            </div>
            <div className="text-lg md:text-xl font-extrabold text-[#1f1f1f]">
              {formatCurrency(metrics.activeValue)}
            </div>
            <div className="text-[11px] text-[#6b665c] mt-0.5">
              In Prospect / Negot.
            </div>
          </div>

          {/* Weighted Pipeline */}
          <div className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-4">
            <div className="flex items-center justify-between text-[#6b665c] mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Weighted Prob.</span>
              <Sparkles className="w-4 h-4 text-[#ff4800]" />
            </div>
            <div className="text-lg md:text-xl font-extrabold text-[#1f1f1f]">
              {formatCurrency(metrics.weightedPipelineValue)}
            </div>
            <div className="text-[11px] text-[#6b665c] mt-0.5 font-medium">
              Probability adjusted
            </div>
          </div>
        </div>
      </section>

      {/* 2. TODAY'S FOLLOW-UP REMINDERS & ALERTS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-[#ff4800]" />
            <h2 className="text-lg font-bold text-[#1f1f1f] tracking-tight font-serif-heading">
              Action Required: Follow-up Reminders
            </h2>
          </div>
          <span className="px-2.5 py-0.5 rounded-[4px] text-xs font-bold bg-[#f8f5ee] text-[#1f1f1f] border border-[#1f1f1f]">
            {followUps.dueToday.length + followUps.overdue.length} Items Due
          </span>
        </div>

        {/* Overdue alert banner if any */}
        {followUps.overdue.length > 0 && (
          <div className="bg-[#f8f5ee] border border-[#1f1f1f] border-l-4 border-l-[#ff4800] rounded-[16px] p-3.5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#ff4800] shrink-0 mt-0.5" />
            <div className="text-xs text-[#1f1f1f]">
              <span className="font-bold">{followUps.overdue.length} overdue follow-up(s)</span> requiring immediate outreach. Contact these prospects to keep negotiations active.
            </div>
          </div>
        )}

        {/* Due Today & Overdue List */}
        {followUps.dueToday.length === 0 && followUps.overdue.length === 0 ? (
          <div className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-6 text-center">
            <CheckCircle2 className="w-8 h-8 text-[#ff4800] mx-auto mb-2" />
            <h4 className="text-sm font-bold text-[#1f1f1f] font-serif-heading">All caught up for today</h4>
            <p className="text-xs text-[#6b665c] mt-1 max-w-sm mx-auto">
              No follow-ups due right now. Next scheduled client touchpoints will trigger automated reminders here.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {[...followUps.overdue, ...followUps.dueToday].map((lead) => {
              const isLeadOverdue = followUps.overdue.some((l) => l.id === lead.id);
              const stageConfig = STAGE_CONFIG[lead.pipeline_stage];

              return (
                <div
                  key={lead.id}
                  className={`bg-[#f8f5ee] hover:bg-[#f2ede4] border border-[#1f1f1f] transition-all rounded-[16px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isLeadOverdue ? 'border-l-4 border-l-[#ff4800]' : 'border-l-4 border-l-[#1f1f1f]'
                  }`}
                >
                  {/* Lead Info */}
                  <div
                    onClick={() => onSelectLead(lead)}
                    className="cursor-pointer min-w-0 space-y-1"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#1f1f1f] text-sm hover:underline transition-colors truncate">
                        {lead.company_name}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-[4px] font-semibold ${stageConfig.badgeBg}`}>
                        {stageConfig.label}
                      </span>
                      {lead.lead_score === 'Hot' && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-[#ff4800] bg-[#fff5f0] border border-[#ff4800]/40 px-1.5 py-0.5 rounded-[4px]">
                          <Flame className="w-3 h-3 fill-[#ff4800]" />
                          Hot
                        </span>
                      )}
                      {lead._syncStatus && lead._syncStatus !== 'synced' && (
                        <span className="text-[10px] bg-[#1f1f1f] text-[#fcfcfa] px-1.5 py-0.5 rounded-[4px] font-mono">
                          Offline Sync Pending
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 text-xs text-[#6b665c]">
                      <span className="text-[#1f1f1f] font-semibold">{lead.contact_person}</span>
                      <span>•</span>
                      <span>{lead.city}</span>
                      <span>•</span>
                      <span className="text-[#1f1f1f] font-bold">{formatCurrency(lead.deal_value)}</span>
                    </div>

                    <div className="text-[11px] font-medium flex items-center gap-1.5">
                      <Clock className={`w-3.5 h-3.5 ${isLeadOverdue ? 'text-[#ff4800]' : 'text-[#1f1f1f]'}`} />
                      <span className={isLeadOverdue ? 'text-[#ff4800] font-bold' : 'text-[#1f1f1f] font-semibold'}>
                        {isLeadOverdue ? 'Overdue: ' : 'Due Today: '}
                        {formatDateDisplay(lead.next_followup_date)}
                      </span>
                    </div>
                  </div>

                  {/* Quick Action Buttons: 8px border radius, crisp 1px borders */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    {/* Click-to-Call */}
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone}`}
                        title={`Call ${lead.contact_person}`}
                        className="p-2 rounded-[8px] bg-[#fcfcfa] hover:bg-[#eae4d5] text-[#1f1f1f] border border-[#1f1f1f] transition-all flex items-center justify-center"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    )}

                    {/* Click-to-WhatsApp */}
                    {lead.phone && (
                      <button
                        onClick={() => onOpenWhatsApp(lead)}
                        title={`WhatsApp message templates for ${lead.contact_person}`}
                        className="p-2 rounded-[8px] bg-[#fcfcfa] hover:bg-[#eae4d5] text-[#1f1f1f] border border-[#1f1f1f] transition-all flex items-center justify-center"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}

                    {/* Quick GPS Check-In / Log Activity (Sprout Orange CTA) */}
                    <button
                      onClick={() => onOpenActivityLogger(lead)}
                      title="Log Meeting Check-In with GPS"
                      className="px-3 py-1.5 rounded-[8px] bg-[#ff4800] hover:bg-[#e03f00] text-white text-xs font-bold flex items-center gap-1.5 transition-all border border-[#1f1f1f]"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Check-In</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. PIPELINE STAGE DISTRIBUTION */}
      <section className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#1f1f1f] tracking-tight font-serif-heading">
            Pipeline Stage Distribution
          </h3>
          <span className="text-xs text-[#6b665c] font-medium">{metrics.totalLeads} total accounts</span>
        </div>

        <div className="space-y-3">
          {(['Prospect', 'Meeting', 'Negotiation', 'Closing Won', 'Closing Lost'] as PipelineStage[]).map((stage) => {
            const count = metrics.stageCounts[stage] || 0;
            const pct = metrics.totalLeads > 0 ? (count / metrics.totalLeads) * 100 : 0;

            return (
              <div key={stage} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-semibold text-[#1f1f1f]">
                    <span>{stage}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#6b665c]">
                    <span className="font-bold text-[#1f1f1f]">{count}</span>
                    <span className="text-[11px]">({pct.toFixed(0)}%)</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-[#eae4d5] border border-[#1f1f1f]/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      stage === 'Meeting' ? 'bg-[#ff4800]' : 'bg-[#1f1f1f]'
                    }`}
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. RECENT ACTIVITIES FEED */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#ff4800]" />
            <h3 className="text-lg font-bold text-[#1f1f1f] tracking-tight font-serif-heading">
              Recent Field Activities & Check-Ins
            </h3>
          </div>
          <button
            onClick={() => onOpenActivityLogger()}
            className="text-xs font-semibold text-[#1f1f1f] hover:text-[#ff4800] flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-[#ff4800]" />
            <span>New Log</span>
          </button>
        </div>

        {activities.length === 0 ? (
          <div className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-5 text-center text-xs text-[#6b665c]">
            No field activities logged yet. Tap "New Log" or "Check-In" on any lead to record GPS coordinates and AI notes.
          </div>
        ) : (
          <div className="space-y-2.5">
            {activities.slice(0, 4).map((act) => {
              const matchedLead = leads.find((l) => l.id === act.lead_id);
              return (
                <div
                  key={act.id}
                  className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-4 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#1f1f1f] text-sm">{act.activity_type}</span>
                      {matchedLead && (
                        <span className="text-[#6b665c] font-medium">• {matchedLead.company_name}</span>
                      )}
                    </div>
                    {act.location_gps && (
                      <span className="flex items-center gap-1 font-mono text-[10px] text-[#1f1f1f] bg-[#fcfcfa] border border-[#1f1f1f] px-2.5 py-0.5 rounded-[4px]">
                        <MapPin className="w-3 h-3 text-[#ff4800]" />
                        {act.location_gps}
                      </span>
                    )}
                  </div>
                  <p className="text-[#1f1f1f] leading-relaxed">{act.notes}</p>
                  {act.ai_summary && (
                    <div className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[8px] p-3 text-[#1f1f1f] text-[11px] whitespace-pre-line">
                      <span className="font-bold text-[#ff4800] flex items-center gap-1 mb-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        AI Action Items:
                      </span>
                      {act.ai_summary}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* PRIMARY FLOATING ACTION BUTTON: Sprout Orange with 8px radius and hairline border */}
      <div className="fixed bottom-20 right-4 z-20 flex flex-col items-end gap-2">
        <button
          onClick={onOpenQuickLead}
          className="bg-[#ff4800] hover:bg-[#e03f00] text-white font-bold py-3 px-5 rounded-[8px] border border-[#1f1f1f] flex items-center gap-2 transition-all active:scale-95 shadow-none"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span className="text-sm font-semibold">Quick Lead</span>
        </button>
      </div>
    </div>
  );
};
