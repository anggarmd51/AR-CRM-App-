import React, { useEffect, useState } from 'react';
import { Check, MapPin, X } from 'lucide-react';
import { Lead } from '../types/crm.ts';

interface ActivityLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  leads: Lead[];
  initialLead?: Lead | null;
  onSaveActivity: (activityData: {
    lead_id: string;
    activity_type: string;
    notes: string;
  }) => Promise<void>;
}

export const ActivityLoggerModal: React.FC<ActivityLoggerModalProps> = ({
  isOpen,
  onClose,
  leads,
  initialLead,
  onSaveActivity,
}) => {
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [activityType, setActivityType] = useState('Meeting Check-In');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialLead) setSelectedLeadId(initialLead.id);
    else if (leads.length > 0 && !selectedLeadId) setSelectedLeadId(leads[0].id);
  }, [initialLead, leads, selectedLeadId]);

  useEffect(() => {
    if (!isOpen) setNotes('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId || !notes.trim()) return;
    setIsSubmitting(true);
    try {
      await onSaveActivity({
        lead_id: selectedLeadId,
        activity_type: activityType,
        notes: notes.trim(),
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f1f1f]/50 backdrop-blur-xs overflow-y-auto">
      <div className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[16px] w-full max-w-lg overflow-hidden my-8">
        <div className="px-5 py-4 border-b border-[#1f1f1f] flex items-center justify-between bg-[#f8f5ee]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[8px] bg-[#1f1f1f] text-[#ff4800]"><MapPin className="w-5 h-5" /></div>
            <div>
              <h3 className="font-bold text-[#1f1f1f] text-base font-serif-heading">Activity Logger</h3>
              <p className="text-xs text-[#6b665c]">Log a field activity; GPS and AI processing are disabled.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[8px] hover:bg-[#eae4d5] text-[#1f1f1f] transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-[#1f1f1f] font-semibold block">Select Account / Lead</label>
            <select value={selectedLeadId} onChange={(e) => setSelectedLeadId(e.target.value)} required className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2.5 text-xs text-[#1f1f1f] font-medium focus:outline-none focus:bg-[#fcfcfa]">
              <option value="" disabled>-- Choose Lead --</option>
              {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.company_name} ({lead.contact_person} - {lead.city})</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[#1f1f1f] font-semibold block">Activity Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {['Meeting Check-In', 'Phone Call', 'WhatsApp Message', 'Proposal Sent', 'Site Visit'].map((type) => (
                <button key={type} type="button" onClick={() => setActivityType(type)} className={`py-2 px-2.5 rounded-[8px] border text-center transition-all ${activityType === type ? 'bg-[#1f1f1f] border-[#1f1f1f] text-white font-bold' : 'bg-[#f8f5ee] border-[#1f1f1f] text-[#1f1f1f] hover:bg-[#eae4d5]'}`}>{type}</button>
              ))}
            </div>
          </div>

          <div className="rounded-[12px] border border-[#1f1f1f] bg-[#f8f5ee] p-3 text-[11px] text-[#6b665c]">GPS capture and AI note summarization are disabled. Activity notes stay within the CRM and are never sent to an AI service.</div>

          <div className="space-y-1.5">
            <label className="text-[#1f1f1f] font-semibold block">Field Notes</label>
            <textarea rows={4} placeholder="Enter activity notes for your CRM record." value={notes} onChange={(e) => setNotes(e.target.value)} required className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] p-3 text-xs text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa] resize-none" />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1f1f1f]/10">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-[8px] text-[#6b665c] hover:text-[#1f1f1f] font-semibold transition-colors">Cancel</button>
            <button type="submit" disabled={isSubmitting || !selectedLeadId || !notes.trim()} className="bg-[#ff4800] hover:bg-[#e03f00] text-white font-bold px-5 py-2.5 rounded-[8px] border border-[#1f1f1f] flex items-center gap-1.5 transition-all disabled:opacity-50"><Check className="w-4 h-4 stroke-[2.5]" /><span>{isSubmitting ? 'Saving...' : 'Save Activity'}</span></button>
          </div>
        </form>
      </div>
    </div>
  );
};
