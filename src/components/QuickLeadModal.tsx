import React, { useState } from 'react';
import { X, Plus, Calendar, Flame, Check } from 'lucide-react';
import { Lead, PipelineStage, LeadScore, PIPELINE_STAGES } from '../types/crm.ts';

interface QuickLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddLead: (leadData: Omit<Lead, 'id' | '_syncStatus' | 'created_at' | 'updated_at'>) => void;
}

export const QuickLeadModal: React.FC<QuickLeadModalProps> = ({
  isOpen,
  onClose,
  onAddLead,
}) => {
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [industry, setIndustry] = useState('Logistics & Transport');
  const [city, setCity] = useState('Jakarta');
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>('Prospect');
  const [dealValue, setDealValue] = useState<number>(25000000);
  const [nextFollowupDate, setNextFollowupDate] = useState(
    new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10)
  );
  const [leadScore, setLeadScore] = useState<LeadScore>('Hot');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !contactPerson.trim()) return;

    onAddLead({
      company_name: companyName.trim(),
      contact_person: contactPerson.trim(),
      phone: phone.trim(),
      industry,
      city,
      pipeline_stage: pipelineStage,
      deal_value: Number(dealValue) || 0,
      next_followup_date: nextFollowupDate,
      lead_score: leadScore,
    });

    onClose();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f1f1f]/50 backdrop-blur-xs overflow-y-auto">
      {/* 16px radius, cream canvas, 1px hairline border */}
      <div className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[16px] w-full max-w-lg overflow-hidden my-8">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1f1f1f] flex items-center justify-between bg-[#f8f5ee]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[8px] bg-[#1f1f1f] text-[#ff4800]">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-bold text-[#1f1f1f] text-base font-serif-heading">Quick Lead Input</h3>
              <p className="text-xs text-[#6b665c]">Add account to personal sales pipeline & AR Cloud Sync</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[8px] hover:bg-[#eae4d5] text-[#1f1f1f] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Company & Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[#1f1f1f] font-semibold">Company / Account Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. PT Artha Sentosa"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[#1f1f1f] font-semibold">Contact Person *</label>
              <input
                type="text"
                required
                placeholder="e.g. Maya Indah (VP Sales)"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa]"
              />
            </div>
          </div>

          {/* Phone & City */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[#1f1f1f] font-semibold">Phone / WhatsApp</label>
              <input
                type="text"
                placeholder="e.g. +628123456789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa] font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[#1f1f1f] font-semibold">City</label>
              <input
                type="text"
                placeholder="e.g. Jakarta, Surabaya"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa]"
              />
            </div>
          </div>

          {/* Industry */}
          <div className="space-y-1">
            <label className="text-[#1f1f1f] font-semibold">Industry</label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] font-medium focus:outline-none"
            >
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
              <label className="text-[#1f1f1f] font-semibold">Initial Stage</label>
              <select
                value={pipelineStage}
                onChange={(e) => setPipelineStage(e.target.value as PipelineStage)}
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
              <label className="text-[#1f1f1f] font-semibold">Deal Value (IDR)</label>
              <input
                type="number"
                step="1000000"
                value={dealValue}
                onChange={(e) => setDealValue(Number(e.target.value))}
                className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] font-bold font-mono focus:outline-none focus:bg-[#fcfcfa]"
              />
            </div>
          </div>

          {/* Next Followup Date & Lead Score */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[#1f1f1f] font-semibold flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#ff4800]" />
                <span>Next Follow-up Date</span>
              </label>
              <input
                type="date"
                value={nextFollowupDate}
                onChange={(e) => setNextFollowupDate(e.target.value)}
                className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-[#1f1f1f] font-medium focus:outline-none focus:bg-[#fcfcfa]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[#1f1f1f] font-semibold flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-[#ff4800]" />
                <span>Lead Score Tag</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                {(['Hot', 'Warm', 'Cold'] as LeadScore[]).map((score) => (
                  <button
                    key={score}
                    type="button"
                    onClick={() => setLeadScore(score)}
                    className={`py-1.5 rounded-[8px] border text-center font-bold transition-all ${
                      leadScore === score
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
              onClick={onClose}
              className="px-4 py-2 rounded-[8px] text-[#6b665c] hover:text-[#1f1f1f] font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-[#ff4800] hover:bg-[#e03f00] text-white font-bold px-5 py-2.5 rounded-[8px] border border-[#1f1f1f] flex items-center gap-1.5 transition-all"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Create Lead</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
