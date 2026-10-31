import React, { useEffect, useState } from 'react';
import {
  X,
  Pencil,
  Check,
  Phone,
  MapPin,
  Calendar,
  Flame,
  MessageCircle,
  Clock,
  Sparkles,
  Mail,
} from 'lucide-react';
import { Lead, Activity, LeadCorrection, LeadScore, PipelineStage, PIPELINE_STAGES, STAGE_CONFIG } from '../types/crm.ts';
import { formatCurrency, formatDateDisplay, formatNumber } from '../utils/crmCalculations.ts';
import { useModalAccessibility } from '../utils/useModalAccessibility.ts';
import { createEmailComposeHref, createTelHref, detectMobileEmailHandler } from '../utils/leadContact.ts';

interface LeadDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  startEditing?: boolean;
  activities: Activity[];
  onUpdateStage: (leadId: string, stage: PipelineStage, nextFollowupDate?: string) => void;
  onUpdateLeadDetails: (leadId: string, changes: LeadCorrection) => Promise<void>;
  onOpenActivityLogger: (lead: Lead) => void;
  onOpenWhatsApp: (lead: Lead) => void;
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
  isOpen,
  onClose,
  lead,
  startEditing = false,
  activities,
  onUpdateStage,
  onUpdateLeadDetails,
  onOpenActivityLogger,
  onOpenWhatsApp,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    company_name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    industry: '',
    city: '',
    deal_value: 0,
    next_followup_date: '',
    lead_score: 'Unrated' as LeadScore,
  });

  const close = () => { if (!isSaving) onClose(); };
  const { dialogRef } = useModalAccessibility({ isOpen: isOpen && Boolean(lead), onClose: close, titleId: 'lead-detail-modal-title' });

  useEffect(() => {
    setEditError(null);
    if (startEditing && lead) {
      setEditValues({
        company_name: lead.company_name,
        contact_person: lead.contact_person,
        email: lead.email ?? '',
        phone: lead.phone,
        address: lead.address ?? '',
        industry: lead.industry,
        city: lead.city,
        deal_value: lead.deal_value,
        next_followup_date: lead.next_followup_date,
        lead_score: lead.lead_score,
      });
      setIsEditing(true);
    } else {
      setIsEditing(false);
    }
  }, [lead?.id, startEditing]);

  if (!isOpen || !lead) return null;

  const beginEditing = () => {
    if (!lead) return;
    setEditValues({
      company_name: lead.company_name,
      contact_person: lead.contact_person,
      email: lead.email ?? '',
      phone: lead.phone,
      address: lead.address ?? '',
      industry: lead.industry,
      city: lead.city,
      deal_value: lead.deal_value,
      next_followup_date: lead.next_followup_date,
      lead_score: lead.lead_score,
    });
    setEditError(null);
    setIsEditing(true);
  };

  const saveLeadDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setEditError(null);
    try {
      await onUpdateLeadDetails(lead.id, {
        company_name: editValues.company_name.trim(),
        contact_person: editValues.contact_person.trim(),
        email: editValues.email.trim(),
        phone: editValues.phone.trim(),
        ...(editValues.address.trim() !== (lead.address ?? '') ? { address: editValues.address.trim() } : {}),
        industry: editValues.industry.trim(),
        city: editValues.city.trim(),
        deal_value: Number(editValues.deal_value),
        next_followup_date: editValues.next_followup_date,
        lead_score: editValues.lead_score,
      });
      setIsEditing(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Koreksi Lead gagal disimpan.');
    } finally {
      setIsSaving(false);
    }
  };

  const leadActivities = activities.filter((a) => a.lead_id === lead.id);
  const stageCfg = STAGE_CONFIG[lead.pipeline_stage];
  const isWonArchiveLocked = lead.pipeline_stage === 'Closing Won';
  const mobileEmail = typeof navigator !== 'undefined' && detectMobileEmailHandler(navigator.userAgent);
  const callHref = createTelHref(lead.phone);
  const emailHref = createEmailComposeHref(lead.email, mobileEmail);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f1f1f]/50 backdrop-blur-xs overflow-y-auto" role="presentation">
      {/* 16px radius, cream canvas, 1px hairline border */}
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="lead-detail-modal-title" tabIndex={-1} className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[16px] w-full max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden my-2">
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-[#1f1f1f] flex items-center justify-between gap-2 bg-[#f8f5ee]">
          <div className="min-w-0 flex-1">
            <h3 id="lead-detail-modal-title" title={lead.company_name} className="font-bold text-[#1f1f1f] text-lg truncate font-serif-heading">{lead.company_name}</h3>
            <div className="flex min-w-0 items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-[4px] font-semibold ${stageCfg.badgeBg}`}>
                {stageCfg.label}
              </span>
              <p className="min-w-0 text-xs text-[#6b665c] font-medium truncate">{lead.contact_person}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!isEditing && (
              <button
                onClick={beginEditing}
                aria-label="Edit Lead"
                title="Edit data Lead"
                className="min-h-11 min-w-11 flex items-center justify-center gap-1 rounded-[8px] border border-[#1f1f1f] px-2 py-1.5 text-[11px] font-semibold hover:bg-[#eae4d5]"
              >
                <Pencil className="h-3.5 w-3.5 text-[#ff4800]" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}
            <button
              onClick={close}
              aria-label="Tutup detail Lead"
              className="min-h-11 min-w-11 flex items-center justify-center rounded-[8px] hover:bg-[#eae4d5] text-[#1f1f1f] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto">
          {/* Quick Metrics Bar: 16px radius, warm parchment */}
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2.5 bg-[#f8f5ee] p-3.5 rounded-[16px] border border-[#1f1f1f]">
            <div>
              <span className="text-[11px] text-[#6b665c] font-medium">Deal Value:</span>
              <div className="break-words text-base font-extrabold text-[#1f1f1f] font-mono">
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

          {isEditing && (
            <form onSubmit={saveLeadDetails} className="space-y-3 rounded-[16px] border border-[#1f1f1f] bg-[#fff8f3] p-3.5">
              <div>
                <h4 className="font-bold text-sm text-[#1f1f1f]">Edit data Lead</h4>
                <p className="mt-0.5 text-[11px] leading-4 text-[#6b665c]">Perubahan disimpan ke Firestore; histori aktivitas tetap dipertahankan.{isWonArchiveLocked ? ' Field identitas/nilai terkunci untuk menjaga arsip Won.' : ''}</p>
              </div>
              {editError && <p role="alert" className="rounded-[8px] border border-[#9b2c2c]/30 bg-white p-2 text-[11px] text-[#9b2c2c]">{editError}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="space-y-1 font-semibold text-[#1f1f1f]">
                  <span>Nama perusahaan *</span>
                  <input required maxLength={200} disabled={isWonArchiveLocked} value={editValues.company_name} onChange={(event) => setEditValues((current) => ({ ...current, company_name: event.target.value }))} className="w-full rounded-[8px] border border-[#1f1f1f] bg-white px-3 py-2 font-normal disabled:bg-[#eae4d5]" />
                </label>
                <label className="space-y-1 font-semibold text-[#1f1f1f]">
                  <span>PIC / Contact Person *</span>
                  <input
                    required
                    maxLength={200}
                    disabled={isWonArchiveLocked}
                    value={editValues.contact_person}
                    onChange={(event) => setEditValues((current) => ({ ...current, contact_person: event.target.value }))}
                    className="w-full rounded-[8px] border border-[#1f1f1f] bg-white px-3 py-2 font-normal"
                  />
                </label>
                <label className="space-y-1 font-semibold text-[#1f1f1f]">
                  <span>Email</span>
                  <input type="email" maxLength={320} value={editValues.email} onChange={(event) => setEditValues((current) => ({ ...current, email: event.target.value }))} className="w-full rounded-[8px] border border-[#1f1f1f] bg-white px-3 py-2 font-normal" />
                </label>
                <label className="space-y-1 font-semibold text-[#1f1f1f]">
                  <span>Telepon / WhatsApp</span>
                  <input
                    type="tel"
                    maxLength={200}
                    disabled={isWonArchiveLocked}
                    value={editValues.phone}
                    onChange={(event) => setEditValues((current) => ({ ...current, phone: event.target.value }))}
                    className="w-full rounded-[8px] border border-[#1f1f1f] bg-white px-3 py-2 font-mono font-normal"
                  />
                </label>
                <label className="space-y-1 font-semibold text-[#1f1f1f]">
                  <span>Industri</span>
                  <input maxLength={120} disabled={isWonArchiveLocked} value={editValues.industry} onChange={(event) => setEditValues((current) => ({ ...current, industry: event.target.value }))} className="w-full rounded-[8px] border border-[#1f1f1f] bg-white px-3 py-2 font-normal disabled:bg-[#eae4d5]" />
                </label>
                <label className="space-y-1 font-semibold text-[#1f1f1f]">
                  <span>Kota</span>
                  <input maxLength={120} disabled={isWonArchiveLocked} value={editValues.city} onChange={(event) => setEditValues((current) => ({ ...current, city: event.target.value }))} className="w-full rounded-[8px] border border-[#1f1f1f] bg-white px-3 py-2 font-normal disabled:bg-[#eae4d5]" />
                </label>
                <label className="space-y-1 font-semibold text-[#1f1f1f] sm:col-span-2">
                  <span>Alamat</span>
                  <textarea maxLength={500} rows={2} disabled={isWonArchiveLocked} value={editValues.address} onChange={(event) => setEditValues((current) => ({ ...current, address: event.target.value }))} className="w-full resize-y rounded-[8px] border border-[#1f1f1f] bg-white px-3 py-2 font-normal disabled:bg-[#eae4d5]" />
                </label>
                <label className="space-y-1 font-semibold text-[#1f1f1f]">
                  <span>Nilai deal (IDR) *</span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="any"
                    disabled={isWonArchiveLocked}
                    value={editValues.deal_value}
                    onChange={(event) => setEditValues((current) => ({ ...current, deal_value: Number(event.target.value) }))}
                    className="w-full rounded-[8px] border border-[#1f1f1f] bg-white px-3 py-2 font-mono font-normal"
                  />
                </label>
                <label className="space-y-1 font-semibold text-[#1f1f1f]">
                  <span>Jadwal tindak lanjut</span>
                  <input type="date" value={editValues.next_followup_date} onChange={(event) => setEditValues((current) => ({ ...current, next_followup_date: event.target.value }))} className="w-full rounded-[8px] border border-[#1f1f1f] bg-white px-3 py-2 font-normal" />
                </label>
                <label className="space-y-1 font-semibold text-[#1f1f1f]">
                  <span>Lead Score</span>
                  <select
                    value={editValues.lead_score}
                    onChange={(event) => setEditValues((current) => ({ ...current, lead_score: event.target.value as LeadScore }))}
                    className="w-full rounded-[8px] border border-[#1f1f1f] bg-white px-3 py-2 font-normal"
                  >
                    {(['Hot', 'Warm', 'Cold', 'Unrated'] as LeadScore[]).map((score) => <option key={score} value={score}>{score}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex justify-end gap-2 border-t border-[#1f1f1f]/10 pt-2">
                <button type="button" disabled={isSaving} onClick={() => { setIsEditing(false); setEditError(null); }} className="rounded-[8px] px-3 py-2 font-semibold text-[#6b665c] disabled:opacity-50">Batal</button>
                <button type="submit" disabled={isSaving} className="flex items-center gap-1.5 rounded-[8px] border border-[#1f1f1f] bg-[#ff4800] px-3 py-2 font-bold text-white disabled:opacity-50">
                  <Check className="h-4 w-4" />{isSaving ? 'Menyimpan…' : 'Simpan perubahan'}
                </button>
              </div>
            </form>
          )}

          {/* Quick Contact & Action Buttons: 8px radius */}
          <div className="grid grid-cols-2 min-[380px]:grid-cols-4 gap-2">
            {callHref ? (
              <a
                href={callHref}
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

            {emailHref && (
              <a href={emailHref} className="py-2.5 px-3 rounded-[8px] bg-[#f8f5ee] hover:bg-[#eae4d5] text-[#1f1f1f] border border-[#1f1f1f] flex flex-col items-center justify-center gap-1 font-semibold transition-all">
                <Mail className="w-4 h-4 text-[#ff4800]" />
                <span>Email</span>
              </a>
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
            {lead.address && <div className="flex items-start justify-between gap-3 text-[#6b665c]">
              <span className="shrink-0">Alamat:</span>
              <span className="text-right font-semibold text-[#1f1f1f] break-words">{lead.address}</span>
            </div>}
            <div className="flex items-center justify-between text-[#6b665c]">
              <span>Lead Score:</span>
              <span className="text-[#ff4800] font-bold flex items-center gap-1">
                {lead.lead_score === 'Hot' && <Flame className="w-3.5 h-3.5 fill-[#ff4800]" />}
                {lead.lead_score}
              </span>
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
