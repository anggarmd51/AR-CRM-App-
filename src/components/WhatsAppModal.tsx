import React, { useEffect, useRef, useState } from 'react';
import { X, MessageCircle, Send, Copy, Check } from 'lucide-react';
import { Lead } from '../types/crm.ts';
import { WHATSAPP_TEMPLATES } from '../utils/crmCalculations.ts';
import { copyTextToClipboard, normalizeWhatsAppPhone } from '../utils/whatsapp.ts';
import { useModalAccessibility } from '../utils/useModalAccessibility.ts';
interface WhatsAppModalProps { isOpen: boolean; onClose: () => void; lead: Lead | null; }
export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({ isOpen, onClose, lead }) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState('intro');
  const [customMessage, setCustomMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const draftLeadIdRef = useRef<string | null>(null);
  const copyVersionRef = useRef(0);
  const copyTimerRef = useRef<number | null>(null);
  const titleId = 'whatsapp-modal-title';
  const { dialogRef } = useModalAccessibility({ isOpen: isOpen && Boolean(lead), onClose, titleId });
  const clearCopy = () => {
    copyVersionRef.current += 1;
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    setCopied(false); setCopyError('');
  };
  useEffect(() => {
    if (!lead || draftLeadIdRef.current === lead.id) return;
    draftLeadIdRef.current = lead.id;
    const template = WHATSAPP_TEMPLATES[0];
    setSelectedTemplateId(template.id); setCustomMessage(template.message(lead)); clearCopy();
  }, [lead?.id]);
  useEffect(() => () => { if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current); }, []);
  if (!isOpen || !lead) return null;
  const phone = normalizeWhatsAppPhone(lead.phone);
  const selectTemplate = (id: string) => {
    const template = WHATSAPP_TEMPLATES.find((item) => item.id === id) ?? WHATSAPP_TEMPLATES[0];
    setSelectedTemplateId(template.id); setCustomMessage(template.message(lead)); clearCopy();
  };
  const handleCopy = async () => {
    const version = ++copyVersionRef.current;
    const result = await copyTextToClipboard(customMessage);
    if (version !== copyVersionRef.current) return;
    setCopied(result.ok); setCopyError(result.ok ? '' : result.error);
    if (result.ok) copyTimerRef.current = window.setTimeout(() => { if (version === copyVersionRef.current) setCopied(false); }, 2000);
  };
  const handleSend = () => {
    if (!phone) return;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(customMessage)}`, '_blank', 'noopener,noreferrer');
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f1f1f]/50 backdrop-blur-xs overflow-y-auto" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[16px] w-full max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        <div className="shrink-0 px-5 py-4 border-b border-[#1f1f1f] flex items-start gap-3 bg-[#f8f5ee]">
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="font-bold text-[#1f1f1f] text-base font-serif-heading">WhatsApp Quick Reach</h3>
            <p className="mt-1 text-xs text-[#6b665c] break-words">To: {lead.contact_person} ({lead.company_name})</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup WhatsApp Quick Reach" className="shrink-0 min-h-11 min-w-11 flex items-center justify-center rounded-[8px] hover:bg-[#eae4d5]"><X className="w-5 h-5" /></button>
        </div>
        <div className="min-h-0 p-5 space-y-4 text-xs overflow-y-auto">
          <section className="bg-[#f8f5ee] p-3.5 rounded-[12px] border border-[#1f1f1f] space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-bold flex items-center gap-1.5"><MessageCircle className="w-4 h-4 shrink-0 text-[#ff4800]" />Recipient Phone Format</span>
              <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-[4px] ${phone ? 'text-[#155e3c] border-[#155e3c]/40' : 'text-[#9b2c2c] border-[#9b2c2c]/40'}`}>{phone ? 'Format valid (belum diverifikasi)' : 'Invalid / Missing Phone'}</span>
            </div>
            <div className="space-y-1 border-t border-[#1f1f1f]/10 pt-2 text-[10px] text-[#6b665c]">
              <p className="break-all">Original Input: <span className="font-mono text-[#1f1f1f]">{lead.phone || 'None'}</span></p>
              <p className="break-all">Target URL: <span className="font-mono text-[#ff4800]">{phone ? `wa.me/${phone}` : 'N/A'}</span></p>
              <p className="pt-1 font-semibold">Normalized number</p>
              <p className="font-mono text-sm font-bold text-[#1f1f1f] break-all">{phone ? `+${phone}` : 'No phone specified'}</p>
            </div>
          </section>
          <section className="space-y-1.5">
            <p className="font-semibold">Select Message Template</p>
            <div className="grid grid-cols-2 gap-2">{WHATSAPP_TEMPLATES.map((template) => (
              <button key={template.id} type="button" onClick={() => selectTemplate(template.id)} className={`min-h-11 p-2.5 rounded-[8px] border text-left break-words ${selectedTemplateId === template.id ? 'bg-[#1f1f1f] text-white font-bold' : 'bg-[#f8f5ee] text-[#1f1f1f]'}`}>{template.title}</button>
            ))}</div>
          </section>
          <section className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="whatsapp-message" className="font-semibold">Message Preview</label>
              <button type="button" onClick={() => void handleCopy()} className="min-h-11 px-2 font-semibold flex items-center gap-1">{copied ? <Check className="w-3 h-3 text-[#ff4800]" /> : <Copy className="w-3 h-3" />}{copied ? 'Copied' : 'Copy Text'}</button>
            </div>
            <textarea id="whatsapp-message" rows={4} value={customMessage} onChange={(event) => { setCustomMessage(event.target.value); clearCopy(); }} className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] p-3 resize-y leading-relaxed" />
            {copyError && <p role="alert" className="text-[11px] text-[#9b2c2c]">{copyError}</p>}
            <p className="text-[10px] text-[#6b665c]">Draf dipertahankan saat dialog Lead yang sama dibuka kembali.</p>
            <button type="button" onClick={() => selectTemplate(selectedTemplateId)} className="min-h-11 text-[11px] font-semibold text-[#ff4800] underline">Kembalikan template</button>
          </section>
          <p className="border border-[#1f1f1f] rounded-[8px] p-2.5 break-words">Target: <strong className="font-mono break-all">{phone ? `+${phone}` : '—'}</strong> ({lead.contact_person})</p>
          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-[#1f1f1f]/10">
            <button type="button" onClick={onClose} className="min-h-11 px-4 rounded-[8px] font-semibold text-[#6b665c]">Cancel</button>
            <button type="button" onClick={handleSend} disabled={!phone} className="min-h-11 w-full sm:w-auto bg-[#ff4800] text-white font-bold px-4 rounded-[8px] border border-[#1f1f1f] flex items-center justify-center gap-1.5 disabled:opacity-50"><Send className="w-4 h-4 shrink-0" />Open in WhatsApp</button>
          </div>
        </div>
      </div>
    </div>
  );
};
