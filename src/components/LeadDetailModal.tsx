import React, { useEffect, useReducer } from 'react';
import {
  X,
  Phone,
  MapPin,
  Calendar,
  MessageCircle,
  Clock,
} from 'lucide-react';
import { Lead, Activity, PipelineStage, PIPELINE_STAGES, STAGE_CONFIG } from '../types/crm.ts';
import { formatCurrency, formatDateDisplay, formatNumber } from '../utils/crmCalculations.ts';
import {
  createLeadProfileEditorState,
  leadProfileEditorReducer,
  leadProfileFrom,
  normalizeLeadProfileEdit,
  submitLeadProfileEdit,
  LEAD_PROFILE_SCORES,
  type LeadProfileEdit,
} from '../utils/leadProfileEdit.ts';

interface LeadDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  activities: Activity[];
  onUpdateStage: (leadId: string, stage: PipelineStage, nextFollowupDate?: string) => void;
  onSaveProfile: (leadId: string, profile: LeadProfileEdit) => Promise<void>;
  onOpenActivityLogger: (lead: Lead) => void;
  onOpenWhatsApp: (lead: Lead) => void;
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
  isOpen,
  onClose,
  lead,
  activities,
  onUpdateStage,
  onSaveProfile,
  onOpenActivityLogger,
  onOpenWhatsApp,
}) => {
  const [editor, dispatchEditor] = useReducer(
    leadProfileEditorReducer,
    lead,
    (initialLead) => createLeadProfileEditorState(initialLead
      ? leadProfileFrom(initialLead)
      : { contact_person: '', phone: '', deal_value: 0, lead_score: 'Unrated' }),
  );

  useEffect(() => {
    if (isOpen && lead) dispatchEditor({ type: 'reset', profile: leadProfileFrom(lead) });
  }, [isOpen, lead?.id]);

  if (!isOpen || !lead) return null;

  const leadActivities = activities.filter((a) => a.lead_id === lead.id);
  const stageCfg = STAGE_CONFIG[lead.pipeline_stage];
  const isWon = lead.pipeline_stage === 'Closing Won';

  const saveProfile = async () => {
    let profile: LeadProfileEdit;
    try {
      profile = normalizeLeadProfileEdit(editor.draft);
    } catch (error) {
      dispatchEditor({ type: 'save-error', message: error instanceof Error ? error.message : 'Data profil tidak valid.' });
      return;
    }
    dispatchEditor({ type: 'save-start' });
    try {
      await submitLeadProfileEdit(lead.id, profile, onSaveProfile);
      dispatchEditor({ type: 'save-success', profile });
    } catch (error) {
      dispatchEditor({ type: 'save-error', message: error instanceof Error ? error.message : 'Perubahan profil gagal disimpan.' });
    }
  };

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

          <section aria-label="Sales profile" className="space-y-3 bg-[#f8f5ee] p-3.5 rounded-[16px] border border-[#1f1f1f]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#1f1f1f] font-bold">Sales Profile</span>
              {!editor.editing ? (
                <button
                  type="button"
                  onClick={() => dispatchEditor({ type: 'begin', profile: leadProfileFrom(lead) })}
                  className="py-1.5 px-3 rounded-[8px] bg-[#fcfcfa] border border-[#1f1f1f] text-[#1f1f1f] font-bold hover:bg-[#eae4d5]"
                >
                  Edit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    form="lead-profile-edit-form"
                    disabled={editor.saving}
                    className="py-1.5 px-3 rounded-[8px] bg-[#ff4800] border border-[#1f1f1f] text-white font-bold disabled:opacity-50"
                  >
                    {editor.saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    disabled={editor.saving}
                    onClick={() => dispatchEditor({ type: 'cancel', profile: leadProfileFrom(lead) })}
                    className="py-1.5 px-3 rounded-[8px] bg-[#fcfcfa] border border-[#1f1f1f] text-[#1f1f1f] font-bold disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {isWon && (
              <p className="rounded-[8px] border border-[#155e3c]/40 bg-[#edf7f1] p-2 text-[11px] text-[#155e3c]" role="note">
                Won archives are immutable. Contact, phone, and deal value stay locked to the archive; lead score may still be updated.
              </p>
            )}

            {editor.editing ? (
              <form
                id="lead-profile-edit-form"
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}
              >
                <label className="space-y-1 font-medium text-[#6b665c]">
                  <span>Contact Person</span>
                  <input
                    aria-label="Contact Person"
                    required
                    maxLength={200}
                    readOnly={isWon}
                    disabled={editor.saving}
                    value={editor.draft.contact_person}
                    onChange={(event) => dispatchEditor({ type: 'change', field: 'contact_person', value: event.target.value })}
                    className="w-full rounded-[8px] border border-[#1f1f1f] bg-[#fcfcfa] px-3 py-2 text-[#1f1f1f] read-only:bg-[#eae4d5]"
                  />
                </label>
                <label className="space-y-1 font-medium text-[#6b665c]">
                  <span>Phone</span>
                  <input
                    aria-label="Phone"
                    type="tel"
                    maxLength={200}
                    readOnly={isWon}
                    disabled={editor.saving}
                    value={editor.draft.phone}
                    onChange={(event) => dispatchEditor({ type: 'change', field: 'phone', value: event.target.value })}
                    className="w-full rounded-[8px] border border-[#1f1f1f] bg-[#fcfcfa] px-3 py-2 text-[#1f1f1f] read-only:bg-[#eae4d5]"
                  />
                </label>
                <label className="space-y-1 font-medium text-[#6b665c]">
                  <span>Deal Value</span>
                  <input
                    aria-label="Deal Value"
                    type="number"
                    required
                    min="0"
                    step="any"
                    readOnly={isWon}
                    disabled={editor.saving}
                    value={Number.isFinite(editor.draft.deal_value) ? String(editor.draft.deal_value) : ''}
                    onChange={(event) => dispatchEditor({ type: 'change', field: 'deal_value', value: event.target.value === '' ? Number.NaN : Number(event.target.value) })}
                    className="w-full rounded-[8px] border border-[#1f1f1f] bg-[#fcfcfa] px-3 py-2 text-[#1f1f1f] read-only:bg-[#eae4d5]"
                  />
                </label>
                <label className="space-y-1 font-medium text-[#6b665c]">
                  <span>Lead Score</span>
                  <select
                    aria-label="Lead Score"
                    required
                    disabled={editor.saving}
                    value={editor.draft.lead_score}
                    onChange={(event) => dispatchEditor({ type: 'change', field: 'lead_score', value: event.target.value as LeadProfileEdit['lead_score'] })}
                    className="w-full rounded-[8px] border border-[#1f1f1f] bg-[#fcfcfa] px-3 py-2 text-[#1f1f1f]"
                  >
                    {LEAD_PROFILE_SCORES.map((score) => <option key={score} value={score}>{score}</option>)}
                  </select>
                </label>
                {editor.error && <p className="sm:col-span-2 text-[#9b2c2c] font-semibold" role="alert">{editor.error}</p>}
              </form>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#6b665c]">
                <div><span>Contact Person:</span><div className="font-semibold text-[#1f1f1f]">{lead.contact_person}</div></div>
                <div><span>Phone:</span><div className="font-semibold text-[#1f1f1f]">{lead.phone || '—'}</div></div>
                <div><span>Deal Value:</span><div className="font-semibold text-[#1f1f1f]">{formatCurrency(lead.deal_value)}</div></div>
                <div><span>Lead Score:</span><div className="font-bold text-[#ff4800]">{lead.lead_score}</div></div>
              </div>
            )}
          </section>

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
                  disabled={isWon}
                  className={`py-1.5 px-2 rounded-[8px] border text-center font-bold text-[11px] transition-all ${isWon ? 'cursor-not-allowed opacity-60' : ''} ${
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
              <span>Industry:</span>
              <span className="text-[#1f1f1f] font-semibold">{lead.industry}</span>
            </div>
            <div className="flex items-center justify-between text-[#6b665c]">
              <span>City:</span>
              <span className="text-[#1f1f1f] font-semibold">{lead.city}</span>
            </div>
            <div className="flex items-center justify-between text-[#6b665c]">
              <span>Sync State:</span>
              <span className={`font-mono text-[10px] font-bold ${lead._syncStatus === 'error' ? 'text-[#9b2c2c]' : lead._syncStatus === 'synced' ? 'text-[#155e3c]' : 'text-[#a44a00]'}`}>
                {!lead._syncStatus || lead._syncStatus === 'synced'
                  ? 'Diakui Firestore'
                  : lead._syncStatus === 'error'
                    ? 'Gagal — periksa antrean'
                    : 'Menunggu pengakuan Firestore'}
              </span>
            </div>
          </div>

          {/* Activity History for This Lead */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#1f1f1f] text-xs flex items-center gap-1.5 font-serif-heading">
                <Clock className="w-4 h-4 text-[#ff4800]" />
                Activity Timeline ({formatNumber(leadActivities.length)})
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
                    </div>
                    <p className="text-[#1f1f1f]">{act.notes}</p>
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
