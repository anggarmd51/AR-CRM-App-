import React, { useState } from 'react';
import {
  Search,
  Plus,
  Phone,
  MessageCircle,
  Clock,
  Flame,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  Building2,
  MapPin,
  Check,
  FileSpreadsheet,
} from 'lucide-react';
import { Lead, PipelineStage, PIPELINE_STAGES, STAGE_CONFIG } from '../types/crm.ts';
import { formatCurrency, formatDateDisplay, formatNumber } from '../utils/crmCalculations.ts';
import { canTransitionFromAuthoritativeStage } from '../utils/salesSafety.ts';

interface PipelineKanbanViewProps {
  leads: Lead[];
  onUpdateLeadStage: (leadId: string, newStage: PipelineStage, nextFollowupDate?: string) => void;
  onSelectLead: (lead: Lead) => void;
  onOpenQuickLead: () => void;
  onOpenWhatsApp: (lead: Lead) => void;
  onExportCsv?: () => void;
}

export const PipelineKanbanView: React.FC<PipelineKanbanViewProps> = ({
  leads,
  onUpdateLeadStage,
  onSelectLead,
  onOpenQuickLead,
  onOpenWhatsApp,
  onExportCsv,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScore, setSelectedScore] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  // Filter leads
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.contact_person.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.industry.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesScore = selectedScore === 'all' || lead.lead_score === selectedScore;

    return matchesSearch && matchesScore;
  });

  return (
    <div className="space-y-4 pb-24">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#1f1f1f] tracking-tight font-serif-heading">
            Pipeline Stages & Deals
          </h2>
          <p className="text-xs text-[#6b665c]">
            Progress accounts from qualification through contract closing
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle: 8px border radius */}
          <div className="bg-[#f8f5ee] p-1 rounded-[8px] border border-[#1f1f1f] flex">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-[#1f1f1f] text-white'
                  : 'text-[#6b665c] hover:text-[#1f1f1f]'
              }`}
            >
              Kanban
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-colors ${
                viewMode === 'list'
                  ? 'bg-[#1f1f1f] text-white'
                  : 'text-[#6b665c] hover:text-[#1f1f1f]'
              }`}
            >
              List View
            </button>
          </div>

          {onExportCsv && (
            <button
              onClick={onExportCsv}
              title="Download Rekapitulasi CSV"
              className="bg-[#f8f5ee] hover:bg-[#f2ede4] text-[#1f1f1f] text-xs font-semibold px-3 py-2 rounded-[8px] border border-[#1f1f1f] flex items-center gap-1.5 transition-all active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#ff4800]" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          )}

          <button
            onClick={onOpenQuickLead}
            className="bg-[#ff4800] hover:bg-[#e03f00] text-white text-xs font-bold px-3.5 py-2 rounded-[8px] border border-[#1f1f1f] flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Add Lead</span>
          </button>
        </div>
      </div>

      {/* Search & Score Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#6b665c]" />
          <input
            type="text"
            placeholder="Search company, contact, city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] pl-9 pr-3 py-2 text-xs text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa]"
          />
        </div>

        {/* Lead Score Filter Pills (8px radius) */}
        <div className="flex items-center gap-1 bg-[#f8f5ee] p-1 rounded-[8px] border border-[#1f1f1f]">
          {['all', 'Hot', 'Warm', 'Cold', 'Unrated'].map((score) => (
            <button
              key={score}
              onClick={() => setSelectedScore(score)}
              className={`px-3 py-1 rounded-[6px] text-xs font-medium transition-all ${
                selectedScore === score
                  ? 'bg-[#1f1f1f] text-white font-semibold'
                  : 'text-[#6b665c] hover:text-[#1f1f1f]'
              }`}
            >
              {score === 'all' ? 'All' : score}
            </button>
          ))}
        </div>
      </div>

      {/* KANBAN BOARD VIEW */}
      {viewMode === 'kanban' ? (
        <div className="flex gap-3.5 overflow-x-auto pb-4 snap-x">
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = filteredLeads.filter((l) => l.pipeline_stage === stage);
            const totalStageValue = stageLeads.reduce((acc, l) => acc + (Number(l.deal_value) || 0), 0);
            const cfg = STAGE_CONFIG[stage];

            return (
              <div
                key={stage}
                className="w-[290px] sm:w-[310px] shrink-0 bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] flex flex-col max-h-[75vh] snap-center overflow-hidden"
              >
                {/* Stage Header */}
                <div className={`p-3.5 border-b border-[#1f1f1f] bg-[#fcfcfa] ${cfg.border.replace('border-l-', 'border-t-4 border-t-')}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#1f1f1f] font-serif-heading">{stage}</span>
                      <span className="bg-[#f8f5ee] text-[#1f1f1f] text-[10px] font-bold px-2 py-0.5 rounded-[4px] border border-[#1f1f1f]">
                        {formatNumber(stageLeads.length)}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-[#6b665c] mt-1 font-semibold font-mono">
                    {formatCurrency(totalStageValue)}
                  </div>
                </div>

                {/* Stage Cards Scroll Area */}
                <div className="p-2.5 space-y-2.5 overflow-y-auto flex-1 min-h-[140px]">
                  {stageLeads.length === 0 ? (
                    <div className="py-10 text-center text-xs text-[#6b665c] italic">
                      No leads in this stage
                    </div>
                  ) : (
                    stageLeads.map((lead) => (
                      <LeadKanbanCard
                        key={lead.id}
                        lead={lead}
                        onSelect={() => onSelectLead(lead)}
                        onStageChange={(newStage) => onUpdateLeadStage(lead.id, newStage)}
                        onOpenWhatsApp={() => onOpenWhatsApp(lead)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="space-y-2.5">
          {filteredLeads.map((lead) => (
            <div
              key={lead.id}
              onClick={() => onSelectLead(lead)}
              className="bg-[#f8f5ee] hover:bg-[#f2ede4] border border-[#1f1f1f] p-4 rounded-[16px] flex items-center justify-between gap-3 cursor-pointer transition-all"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[#1f1f1f] text-sm truncate font-serif-heading">{lead.company_name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-[4px] font-semibold ${STAGE_CONFIG[lead.pipeline_stage].badgeBg}`}>
                    {lead.pipeline_stage}
                  </span>
                  {lead.lead_score === 'Hot' && (
                    <span className="flex items-center gap-0.5 text-[10px] text-[#ff4800] bg-[#fff5f0] border border-[#ff4800]/40 px-1.5 py-0.5 rounded-[4px] font-bold">
                      <Flame className="w-3 h-3 fill-[#ff4800]" />
                      Hot
                    </span>
                  )}
                </div>
                <div className="text-xs text-[#6b665c] flex items-center gap-2 truncate">
                  <span className="font-medium text-[#1f1f1f]">{lead.contact_person}</span>
                  <span>•</span>
                  <span>{lead.city}</span>
                  <span>•</span>
                  <span>{lead.industry}</span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-[#1f1f1f] font-mono">
                  {formatCurrency(lead.deal_value)}
                </div>
                <div className="text-[11px] text-[#6b665c]">
                  {formatDateDisplay(lead.next_followup_date)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface LeadKanbanCardProps {
  lead: Lead;
  onSelect: () => void;
  onStageChange: (newStage: PipelineStage) => void;
  onOpenWhatsApp: () => void;
}

const LeadKanbanCard: React.FC<LeadKanbanCardProps> = ({
  lead,
  onSelect,
  onStageChange,
  onOpenWhatsApp,
}) => {
  const [showStageSelector, setShowStageSelector] = useState(false);

  const currentIndex = PIPELINE_STAGES.indexOf(lead.pipeline_stage);
  const canMoveBack = currentIndex > 0 && canTransitionFromAuthoritativeStage(lead.pipeline_stage, PIPELINE_STAGES[currentIndex - 1]);
  const canMoveForward = currentIndex < PIPELINE_STAGES.length - 1;

  return (
    <div className="bg-[#fcfcfa] hover:bg-white border border-[#1f1f1f] rounded-[12px] p-3 transition-all">
      {/* Top row: Company & Score */}
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <h4
          onClick={onSelect}
          className="font-bold text-[#1f1f1f] text-xs hover:text-[#ff4800] cursor-pointer transition-colors leading-snug truncate font-serif-heading"
        >
          {lead.company_name}
        </h4>

        {lead.lead_score === 'Hot' && (
          <span className="flex items-center gap-0.5 text-[9px] font-bold text-[#ff4800] bg-[#fff5f0] border border-[#ff4800]/40 px-1 py-0.2 rounded-[4px] shrink-0">
            <Flame className="w-2.5 h-2.5 fill-[#ff4800]" />
            Hot
          </span>
        )}
      </div>

      {/* Details */}
      <div
        onClick={onSelect}
        className="cursor-pointer space-y-1 text-[#6b665c] text-xs mb-2.5"
      >
        <div className="text-[#1f1f1f] font-semibold text-[11px] truncate">{lead.contact_person}</div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <Building2 className="w-3 h-3 text-[#1f1f1f]/50 shrink-0" />
          <span className="truncate">{lead.industry}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <MapPin className="w-3 h-3 text-[#1f1f1f]/50 shrink-0" />
          <span className="truncate">{lead.city}</span>
        </div>
      </div>

      {/* Value & Follow-up */}
      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-[#1f1f1f]/10 mb-2">
        <span className="font-bold text-[#1f1f1f] font-mono text-[11px]">
          {formatCurrency(lead.deal_value)}
        </span>
        {lead.next_followup_date && (
          <span className="text-[10px] text-[#ff4800] font-semibold flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDateDisplay(lead.next_followup_date)}
          </span>
        )}
      </div>

      {/* Actions & Stage Mover: Mobile Ergonomic Touch Targets (min 36x36px) */}
      <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-[#1f1f1f]/10">
        {/* Quick Phone & WhatsApp */}
        <div className="flex items-center gap-1.5">
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              title={`Call ${lead.contact_person}`}
              onClick={(e) => e.stopPropagation()}
              className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-[8px] bg-[#f8f5ee] hover:bg-[#eae4d5] text-[#1f1f1f] border border-[#1f1f1f] transition-all active:scale-95"
            >
              <Phone className="w-3.5 h-3.5" />
            </a>
          )}
          {lead.phone && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenWhatsApp();
              }}
              title={`WhatsApp message to ${lead.contact_person}`}
              className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-[8px] bg-[#f8f5ee] hover:bg-[#eae4d5] text-[#155e3c] border border-[#1f1f1f] transition-all active:scale-95"
            >
              <MessageCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Stage Progressors */}
        <div className="flex items-center gap-1.5">
          {canMoveBack && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStageChange(PIPELINE_STAGES[currentIndex - 1]);
              }}
              title={`Move back to ${PIPELINE_STAGES[currentIndex - 1]}`}
              className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-[8px] bg-[#f8f5ee] hover:bg-[#eae4d5] text-[#1f1f1f] border border-[#1f1f1f] transition-all active:scale-95"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Direct Stage Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowStageSelector(!showStageSelector);
              }}
              className="min-h-[36px] px-2.5 py-1.5 rounded-[8px] bg-[#f8f5ee] hover:bg-[#eae4d5] text-[11px] font-bold text-[#1f1f1f] border border-[#1f1f1f] flex items-center gap-1 transition-all active:scale-95"
            >
              <span>Move</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showStageSelector && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 bottom-full mb-1 z-30 bg-[#fcfcfa] border border-[#1f1f1f] rounded-[8px] p-1 w-36 space-y-0.5 shadow-sm"
              >
                {PIPELINE_STAGES.filter((st) => canTransitionFromAuthoritativeStage(lead.pipeline_stage, st)).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      onStageChange(st);
                      setShowStageSelector(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-[6px] text-xs font-semibold flex items-center justify-between transition-colors ${
                      lead.pipeline_stage === st
                        ? 'bg-[#1f1f1f] text-white'
                        : 'text-[#1f1f1f] hover:bg-[#f8f5ee]'
                    }`}
                  >
                    <span>{st}</span>
                    {lead.pipeline_stage === st && <Check className="w-3 h-3 text-[#ff4800]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {canMoveForward && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStageChange(PIPELINE_STAGES[currentIndex + 1]);
              }}
              title={`Advance to ${PIPELINE_STAGES[currentIndex + 1]}`}
              className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center rounded-[8px] bg-[#ff4800] hover:bg-[#e03f00] text-white border border-[#1f1f1f] transition-all active:scale-95"
            >
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
