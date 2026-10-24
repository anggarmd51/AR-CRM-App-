import React from 'react';
import {
  X,
  Phone,
  MapPin,
  Calendar,
  Flame,
  MessageCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Lead, Activity, PipelineStage, PIPELINE_STAGES, STAGE_CONFIG } from '../types/crm.ts';
import { formatCurrency, formatDateDisplay } from '../utils/crmCalculations.ts';

interface LeadDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  activities: Activity[];
  onUpdateStage: (leadId: string, stage: PipelineStage, nextFollowupDate?: string) => void;
  onOpenActivityLogger: (lead: Lead) => void;
  onOpenWhatsApp: (lead: Lead) => void;
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
  isOpen,
  onClose,
  lead,
  activities,
  onUpdateStage,
  onOpenActivityLogger,
  onOpenWhatsApp,
}) => {
  if (!isOpen || !lead) return null;

  const leadActivities = activities.filter((a) => a.lead_id === lead.id);
  const stageCfg = STAGE_CONFIG[lead.pipeline_stage];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f1f1f]/50 backdrop-blur-xs overflow-y-auto">
      {/* 16px radius, cream canvas, 1px hairline border */}
      <div className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[16px] w-full max-w-lg overflow-hidden my-6">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1f1f1f] flex items-center justify-between bg-[#f8f5ee]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-[#1f1f1f] text-lg truncate font-serif-heading">{lead.company_name}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-[4px] font-semibold ${stageCfg.badgeBg}`}>
                {stageCfg.label}
              </span>
            </div>
            <p className="text-xs text-[#6b665c] font-medium truncate">{lead.contact_person}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[8px] hover:bg-[#eae4d5] text-[#1f1f1f] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {/* Quick Metrics Bar: 16px radius, warm parchment */}
          <div className="grid grid-cols-2 gap-2.5 bg-[#f8f5ee] p-3.5 rounded-[16px] border border-[#1f1f1f]">
            <div>
              <span className="text-[11px] text-[#6b665c] font-medium">Deal Value:</span>
              <div className="text-base font-extrabold text-[#1f1f1f] font-mono">
                {formatCurrency(lead.deal_value)}
              </div>
            </div>
            <div>
              <span className="text-[11px] text-[#6b665c] font-medium">Next Follow-up:</span>
              <div className="text-xs font-bold text-[#1f1f1f] flex items-center gap-1 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-[#ff4800]" />
                <span>{formatDateDisplay(lead.next_followup_date)}</span>
              </div>
            </div>
          </div>

          {/* Quick Contact & Action Buttons: 8px radius */}
          <div className="grid grid-cols-3 gap-2">
            {lead.phone ? (
              <a
                href={`tel:${lead.phone}`}
                className="py-2.5 px-3 rounded-[8px] bg-[#f8f5ee] hover:bg-[#eae4d5] text-[#1f1f1f] border border-[#1f1f1f] flex flex-col items-center justify-center gap-1 font-semibold transition-all"
              >
                <Phone className="w-4 h-4 text-[#ff4800]" />
                <span>Call</span>
              </a>
            ) : (
              <button
                disabled
                className="py-2.5 px-3 rounded-[8px] bg-[#f8f5ee] text-[#6b665c] border border-[#1f1f1f]/30 flex flex-col items-center justify-center gap-1"
              >
                <Phone className="w-4 h-4" />
                <span>No Phone</span>
              </button>
            )}

            {lead.phone ? (
              <button
                onClick={() => onOpenWhatsApp(lead)}
                className="py-2.5 px-3 rounded-[8px] bg-[#f8f5ee] hover:bg-[#eae4d5] text-[#1f1f1f] border border-[#1f1f1f] flex flex-col items-center justify-center gap-1 font-semibold transition-all"
              >
                <MessageCircle className="w-4 h-4 text-[#ff4800]" />
                <span>WhatsApp</span>
              </button>
            ) : (
              <button
                disabled
                className="py-2.5 px-3 rounded-[8px] bg-[#f8f5ee] text-[#6b665c] border border-[#1f1f1f]/30 flex flex-col items-center justify-center gap-1"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </button>
            )}

            <button
              onClick={() => onOpenActivityLogger(lead)}
              className="py-2.5 px-3 rounded-[8px] bg-[#ff4800] hover:bg-[#e03f00] text-white border border-[#1f1f1f] flex flex-col items-center justify-center gap-1 font-bold transition-all"
            >
              <MapPin className="w-4 h-4" />
              <span>Check-In</span>
            </button>
          </div>

          {/* Stage Progression Selector (8px radius) */}
          <div className="space-y-1.5 bg-[#f8f5ee] p-3.5 rounded-[16px] border border-[#1f1f1f]">
            <span className="text-[#1f1f1f] font-bold block">Update Pipeline Stage:</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {PIPELINE_STAGES.map((st) => (
                <button
                  key={st}
                  onClick={() => onUpdateStage(lead.id, st)}
                  className={`py-1.5 px-2 rounded-[8px] border text-center font-bold text-[11px] transition-all ${
                    lead.pipeline_stage === st
                      ? 'bg-[#1f1f1f] border-[#1f1f1f] text-white'
                      : 'bg-[#fcfcfa] border-[#1f1f1f] text-[#1f1f1f] hover:bg-[#eae4d5]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Details Overview */}
          <div className="space-y-2.5 bg-[#f8f5ee] p-3.5 rounded-[16px] border border-[#1f1f1f]">
            <div className="flex items-center justify-between text-[#6b665c]">
              <span>Contact Person:</span>
              <span className="text-[#1f1f1f] font-semibold">{lead.contact_person}</span>
            </div>
            <div className="flex items-center justify-between text-[#6b665c]">
              <span>Industry:</span>
              <span className="text-[#1f1f1f] font-semibold">{lead.industry}</span>
            </div>
            <div className="flex items-center justify-between text-[#6b665c]">
              <span>City:</span>
              <span className="text-[#1f1f1f] font-semibold">{lead.city}</span>
            </div>
            <div className="flex items-center justify-between text-[#6b665c]">
              <span>Lead Score:</span>
              <span className="text-[#ff4800] font-bold flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 fill-[#ff4800]" />
                {lead.lead_score}
              </span>
            </div>
            <div className="flex items-center justify-between text-[#6b665c]">
              <span>Sync State:</span>
              <span className="font-mono text-[10px] text-[#1f1f1f] font-bold">
                {lead._syncStatus === 'synced' ? 'Synced with Cloud Database' : 'Local Cache (Pending Sync)'}
              </span>
            </div>
          </div>

          {/* Activity History for This Lead */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#1f1f1f] text-xs flex items-center gap-1.5 font-serif-heading">
                <Clock className="w-4 h-4 text-[#ff4800]" />
                Activity Timeline ({leadActivities.length})
              </span>
              <button
                onClick={() => onOpenActivityLogger(lead)}
                className="text-[11px] text-[#ff4800] hover:underline font-bold"
              >
                + Add Check-In
              </button>
            </div>

            {leadActivities.length === 0 ? (
              <div className="bg-[#f8f5ee] p-4 rounded-[16px] border border-[#1f1f1f] text-center text-[#6b665c] text-xs italic">
                No check-in or meeting notes logged for this account yet.
              </div>
            ) : (
              <div className="space-y-2">
                {leadActivities.map((act) => (
                  <div
                    key={act.id}
                    className="bg-[#f8f5ee] p-3.5 rounded-[16px] border border-[#1f1f1f] space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#1f1f1f] text-xs">{act.activity_type}</span>
                      {act.location_gps && (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-[#1f1f1f] bg-[#fcfcfa] border border-[#1f1f1f] px-2 py-0.5 rounded-[4px]">
                          <MapPin className="w-3 h-3 text-[#ff4800]" />
                          {act.location_gps}
                        </span>
                      )}
                    </div>
                    <p className="text-[#1f1f1f]">{act.notes}</p>
                    {act.ai_summary && (
                      <div className="bg-[#fcfcfa] p-2.5 rounded-[8px] text-[#1f1f1f] text-[11px] whitespace-pre-line border border-[#1f1f1f]">
                        <span className="font-bold text-[#ff4800] flex items-center gap-1 mb-0.5">
                          <Sparkles className="w-3 h-3" />
                          AI Summary:
                        </span>
                        {act.ai_summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
