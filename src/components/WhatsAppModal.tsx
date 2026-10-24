import React, { useState } from 'react';
import { X, MessageCircle, Send, Copy, Check } from 'lucide-react';
import { Lead } from '../types/crm.ts';
import { WHATSAPP_TEMPLATES, cleanPhoneNumber } from '../utils/crmCalculations.ts';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  isOpen,
  onClose,
  lead,
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState('intro');
  const [customMessage, setCustomMessage] = useState('');
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    if (lead) {
      const template = WHATSAPP_TEMPLATES.find((t) => t.id === selectedTemplateId) || WHATSAPP_TEMPLATES[0];
      setCustomMessage(template.message(lead));
    }
  }, [lead, selectedTemplateId]);

  if (!isOpen || !lead) return null;

  const cleanedPhone = cleanPhoneNumber(lead.phone);
  const waUrl = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(customMessage)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(customMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = () => {
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f1f1f]/50 backdrop-blur-xs overflow-y-auto">
      {/* 16px radius, cream canvas, 1px hairline border */}
      <div className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[16px] w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1f1f1f] flex items-center justify-between bg-[#f8f5ee]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[8px] bg-[#1f1f1f] text-[#ff4800]">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-[#1f1f1f] text-base font-serif-heading">WhatsApp Quick Reach</h3>
              <p className="text-xs text-[#6b665c]">
                To: {lead.contact_person} ({lead.company_name})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[8px] hover:bg-[#eae4d5] text-[#1f1f1f] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* Recipient International Phone Verification Card: 8px radius, AR CRM styled */}
          <div className="bg-[#f8f5ee] p-3.5 rounded-[12px] border border-[#1f1f1f] space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-[#1f1f1f] font-bold flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4 text-[#ff4800]" />
                Recipient Phone Verification
              </span>
              {cleanedPhone ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#155e3c] bg-[#edf7f1] border border-[#155e3c]/40 px-2 py-0.5 rounded-[4px]">
                  <Check className="w-3 h-3 stroke-[3]" />
                  Verified WhatsApp Format (628...)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ff4800] bg-[#fff5f0] border border-[#ff4800]/40 px-2 py-0.5 rounded-[4px]">
                  Invalid / Missing Phone
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-[#1f1f1f]/10">
              <div className="space-y-0.5">
                <span className="text-[10px] text-[#6b665c] font-medium block">
                  Original Input: <span className="font-mono text-[#1f1f1f]">{lead.phone || 'None'}</span>
                </span>
                <span className="text-[10px] text-[#6b665c] font-medium block">
                  API Target URL:{' '}
                  <span className="font-mono text-[#ff4800] font-semibold">
                    {cleanedPhone ? `wa.me/${cleanedPhone}` : 'N/A'}
                  </span>
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[#6b665c] font-semibold block uppercase tracking-wider">
                  International No.
                </span>
                <span className="font-mono text-base font-bold text-[#1f1f1f]">
                  {cleanedPhone ? `+${cleanedPhone}` : 'No phone specified'}
                </span>
              </div>
            </div>
          </div>

          {/* Template Selector Pills (8px radius) */}
          <div className="space-y-1.5">
            <label className="text-[#1f1f1f] font-semibold block">Select Message Template</label>
            <div className="grid grid-cols-2 gap-2">
              {WHATSAPP_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => setSelectedTemplateId(tmpl.id)}
                  className={`py-2 px-3 rounded-[8px] border text-left font-medium transition-all active:scale-98 ${
                    selectedTemplateId === tmpl.id
                      ? 'bg-[#1f1f1f] border-[#1f1f1f] text-white font-bold'
                      : 'bg-[#f8f5ee] border-[#1f1f1f] text-[#1f1f1f] hover:bg-[#eae4d5]'
                  }`}
                >
                  {tmpl.title}
                </button>
              ))}
            </div>
          </div>

          {/* Editable Message Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[#1f1f1f] font-semibold">Message Preview</label>
              <button
                onClick={handleCopy}
                className="text-[11px] text-[#1f1f1f] hover:text-[#ff4800] font-semibold flex items-center gap-1 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-[#ff4800]" />
                    <span className="text-[#ff4800]">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>
            </div>
            <textarea
              rows={4}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] p-3 text-xs text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa] resize-none font-sans leading-relaxed"
            />
          </div>

          {/* Pre-launch verification note before trigger */}
          <div className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[8px] p-2.5 flex items-center justify-between">
            <span className="text-[11px] text-[#6b665c]">
              Target: <strong className="text-[#1f1f1f] font-mono">+{cleanedPhone}</strong> ({lead.contact_person})
            </span>
            <span className="text-[10px] text-[#155e3c] font-semibold bg-[#edf7f1] px-1.5 py-0.5 rounded-[4px] border border-[#155e3c]/30">
              Ready
            </span>
          </div>

          {/* Actions: 8px radius */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1f1f1f]/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[8px] text-[#6b665c] hover:text-[#1f1f1f] font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!cleanedPhone}
              className="bg-[#ff4800] hover:bg-[#e03f00] text-white font-bold px-5 py-2.5 rounded-[8px] border border-[#1f1f1f] flex items-center gap-1.5 transition-all disabled:opacity-50 active:scale-95"
            >
              <Send className="w-4 h-4 stroke-[2.5]" />
              <span>Open in WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
