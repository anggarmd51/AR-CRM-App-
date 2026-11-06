import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, Calendar, Flame, Check } from 'lucide-react';
import { Lead, PipelineStage, LeadScore, PIPELINE_STAGES } from '../types/crm.ts';
import { getFirebaseAuth, workspaceId } from '../firebase.ts';
import { useModalAccessibility } from '../utils/useModalAccessibility.ts';
import {
  createScopedFormDraftWriter,
  EMPTY_QUICK_LEAD_FORM_DRAFT,
  restoreQuickLeadFormDraft,
  saveWithDraftCleanup,
  type QuickLeadFormDraft,
} from '../utils/formDrafts.ts';

interface QuickLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCompanyName?: string;
  onAddLead: (leadData: Omit<Lead, 'id' | '_syncStatus' | 'created_at' | 'updated_at'>) => Promise<void>;
}

export const QuickLeadModal: React.FC<QuickLeadModalProps> = ({
  isOpen,
  onClose,
  initialCompanyName = '',
  onAddLead,
}) => {
  const ownerUid = getFirebaseAuth().currentUser?.uid ?? '';
  const draftWriter = useMemo(
    () => createScopedFormDraftWriter<QuickLeadFormDraft>('quick_lead', workspaceId, ownerUid),
    [ownerUid],
  );
  const initialCompanyNameRef = useRef(initialCompanyName);
  initialCompanyNameRef.current = initialCompanyName;
  const [formDraft, setFormDraft] = useState<QuickLeadFormDraft>(EMPTY_QUICK_LEAD_FORM_DRAFT);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const close = () => { if (!isSubmitting) onClose(); };
  const { dialogRef } = useModalAccessibility({ isOpen, onClose: close, titleId: 'quick-lead-modal-title' });

  useEffect(() => {
    if (!isOpen) {
      draftWriter.flush();
      setDraftHydrated(false);
      setFormDraft(EMPTY_QUICK_LEAD_FORM_DRAFT);
      setSubmitError(null);
      return;
    }
    draftWriter.resume();
    setFormDraft(restoreQuickLeadFormDraft(draftWriter.read(), initialCompanyNameRef.current));
    setSubmitError(null);
    setDraftHydrated(true);
  }, [draftWriter, isOpen]);

  useEffect(() => () => draftWriter.dispose(), [draftWriter]);

  useEffect(() => {
    if (!isOpen || !draftHydrated) return;
    draftWriter.schedule(formDraft);
  }, [draftHydrated, draftWriter, formDraft, isOpen]);

  useEffect(() => {
    if (!isOpen || !draftHydrated) return;
    const flushOnBackground = () => {
      if (document.visibilityState === 'hidden') draftWriter.flush();
    };
    document.addEventListener('visibilitychange', flushOnBackground);
    window.addEventListener('pagehide', flushOnBackground);
    return () => {
      document.removeEventListener('visibilitychange', flushOnBackground);
      window.removeEventListener('pagehide', flushOnBackground);
    };
  }, [draftHydrated, draftWriter, isOpen]);

  const updateDraftField = <Field extends keyof QuickLeadFormDraft>(field: Field, value: QuickLeadFormDraft[Field]) => {
    setFormDraft((current) => ({ ...current, [field]: value }));
  };

  const discardDraft = () => {
    if (isSubmitting) return;
    draftWriter.clear();
    onClose();
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDraft.companyName.trim() || !formDraft.contactPerson.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await saveWithDraftCleanup(draftWriter, () => onAddLead({
        company_name: formDraft.companyName.trim(),
        contact_person: formDraft.contactPerson.trim(),
        email: formDraft.email.trim(),
        phone: formDraft.phone.trim(),
        ...(formDraft.address.trim() ? { address: formDraft.address.trim() } : {}),
        industry: formDraft.industry,
        city: formDraft.city,
        pipeline_stage: formDraft.pipelineStage,
        deal_value: Number(formDraft.dealValue) || 0,
        next_followup_date: formDraft.nextFollowupDate,
        lead_score: formDraft.leadScore,
        isVerified: formDraft.isVerified,
      }));
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error
        ? error.message
        : 'Lead gagal disimpan. Periksa koneksi lalu coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const industriesList = [
    'Logistics & Transport',
    'Manufacturing',
    'Fintech & Banking',
    'Healthcare & Pharma',
    'Information Technology',
    'Retail & E-commerce',
    'Construction & Real Estate',
  ];

  return (
    <div className="modal-safe-area fixed inset-0 z-50 flex items-center justify-center bg-[#1f1f1f]/50 backdrop-blur-xs overflow-y-auto" role="presentation">
      {/* 16px radius, cream canvas, 1px hairline border */}
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-lead-modal-title" tabIndex={-1} className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[16px] w-full max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden my-2">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1f1f1f] flex items-center justify-between bg-[#f8f5ee]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[8px] bg-[#1f1f1f] text-[#ff4800]">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 id="quick-lead-modal-title" className="font-bold text-[#1f1f1f] text-base font-serif-heading">Quick Lead Input</h3>
              <p className="text-xs text-[#6b665c]">Lead akan disimpan langsung ke Firestore workspace.</p>
            </div>
          </div>
          <button
            onClick={close}
            disabled={isSubmitting}
            aria-label="Tutup Quick Lead Input" className="min-h-11 min-w-11 flex items-center justify-center rounded-[8px] hover:bg-[#eae4d5] text-[#1f1f1f] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
          {submitError && <p role="alert" className="rounded-[8px] border border-[#9b2c2c]/30 bg-[#fff5f5] p-3 text-[#9b2c2c]">{submitError}</p>}
          {/* Company & Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="quick-lead-company" className="text-[#1f1f1f] font-semibold">Company / Account Name *</label>
              <input id="quick-lead-company"
                type="text"
                required
                placeholder="e.g. PT Artha Sentosa"
                value={formDraft.companyName}
                onChange={(e) => updateDraftField('companyName', e.target.value)}
                className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa]"
              />
              {initialCompanyName && <p className="text-[10px] leading-4 text-[#6b665c]">Terisi dari kata pencarian; periksa dan ubah jika bukan nama perusahaan.</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="quick-lead-contact" className="text-[#1f1f1f] font-semibold">Contact Person *</label>
              <input id="quick-lead-contact"
                type="text"
                required
                placeholder="e.g. Maya Indah (VP Sales)"
                value={formDraft.contactPerson}
                onChange={(e) => updateDraftField('contactPerson', e.target.value)}
                className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa]"
              />
            </div>
          </div>

          {/* Phone & City */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="quick-lead-phone" className="text-[#1f1f1f] font-semibold">Phone / WhatsApp</label>
              <input id="quick-lead-phone"
                type="text"
                placeholder="e.g. +628123456789"
                value={formDraft.phone}
                onChange={(e) => updateDraftField('phone', e.target.value)}
                className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa] font-mono"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="quick-lead-city" className="text-[#1f1f1f] font-semibold">City</label>
              <input id="quick-lead-city"
                type="text"
                placeholder="e.g. Jakarta, Surabaya"
                value={formDraft.city}
                onChange={(e) => updateDraftField('city', e.target.value)}
                className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="quick-lead-email" className="text-[#1f1f1f] font-semibold">Email</label>
            <input id="quick-lead-email" type="email" maxLength={320} placeholder="contoh: sales@perusahaan.id" value={formDraft.email} onChange={(event) => updateDraftField('email', event.target.value)} className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa]" />
          </div>

          <div className="space-y-1">
            <label htmlFor="quick-lead-address" className="text-[#1f1f1f] font-semibold">Alamat</label>
            <textarea id="quick-lead-address" maxLength={500} rows={2} placeholder="Alamat usaha atau kantor" value={formDraft.address} onChange={(event) => updateDraftField('address', event.target.value)} className="w-full resize-y bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa]" />
          </div>

          <div className="rounded-[8px] border border-[#1f1f1f]/20 bg-white px-3 py-2.5">
            <label htmlFor="quick-lead-is-verified" className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-[#1f1f1f]">
              <input id="quick-lead-is-verified" type="checkbox" checked={formDraft.isVerified} onChange={(event) => updateDraftField('isVerified', event.target.checked)} className="h-4 w-4 accent-[#155e3c]" />
              <span>Kontak Terverifikasi</span>
            </label>
            <p className="pl-6 text-[10px] leading-4 text-[#6b665c]">Centang hanya setelah kontak dikonfirmasi secara manual.</p>
          </div>

          {/* Industry */}
          <div className="space-y-1">
            <label htmlFor="quick-lead-industry" className="text-[#1f1f1f] font-semibold">Industry</label>
            <select id="quick-lead-industry"
              value={formDraft.industry}
              onChange={(e) => updateDraftField('industry', e.target.value)}
              className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] font-medium focus:outline-none"
            >
              <option value="">Pilih industri (opsional)</option>
              {industriesList.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          </div>

          {/* Pipeline Stage & Deal Value */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="quick-lead-stage" className="text-[#1f1f1f] font-semibold">Initial Stage</label>
              <select id="quick-lead-stage"
                value={formDraft.pipelineStage}
                onChange={(e) => updateDraftField('pipelineStage', e.target.value as PipelineStage)}
                className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] font-medium focus:outline-none"
              >
                {PIPELINE_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="quick-lead-deal-value" className="text-[#1f1f1f] font-semibold">Deal Value (IDR)</label>
              <input id="quick-lead-deal-value"
                type="number"
                step="1000000"
                value={formDraft.dealValue}
                onChange={(e) => updateDraftField('dealValue', Number(e.target.value))}
                className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] font-bold font-mono focus:outline-none focus:bg-[#fcfcfa]"
              />
            </div>
          </div>

          {/* Next Followup Date & Lead Score */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="quick-lead-followup" className="text-[#1f1f1f] font-semibold flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#ff4800]" />
                <span>Next Follow-up Date</span>
              </label>
              <input id="quick-lead-followup"
                type="date"
                value={formDraft.nextFollowupDate}
                onChange={(e) => updateDraftField('nextFollowupDate', e.target.value)}
                className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] font-medium focus:outline-none focus:bg-[#fcfcfa]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[#1f1f1f] font-semibold flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-[#ff4800]" />
                <span>Lead Score Tag</span>
              </label>
              <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                {(['Hot', 'Warm', 'Cold', 'Unrated'] as LeadScore[]).map((score) => (
                  <button
                    key={score}
                    type="button"
                    onClick={() => updateDraftField('leadScore', score)}
                    aria-label={`Lead score ${score}`}
                    className={`py-1.5 rounded-[8px] border text-center font-bold transition-all ${
                      formDraft.leadScore === score
                        ? score === 'Hot'
                          ? 'bg-[#1f1f1f] border-[#1f1f1f] text-[#ff4800]'
                          : 'bg-[#1f1f1f] border-[#1f1f1f] text-white'
                        : 'bg-[#f8f5ee] border-[#1f1f1f] text-[#1f1f1f] hover:bg-[#eae4d5]'
                    }`}
                  >
                    {score}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Buttons: 8px radius */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1f1f1f]/10">
            <button
              type="button"
              onClick={discardDraft}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-[8px] text-[#6b665c] hover:text-[#1f1f1f] font-semibold transition-colors"
            >
              Batal / Buang Draft
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#ff4800] hover:bg-[#e03f00] text-white font-bold px-5 py-2.5 rounded-[8px] border border-[#1f1f1f] flex items-center gap-1.5 transition-all"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{isSubmitting ? 'Saving…' : 'Create Lead'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
