import React, { useState } from 'react';
import { History, Plus, Search, Calendar, Building2 } from 'lucide-react';
import { Activity, Lead } from '../types/crm.ts';

interface ActivitiesListViewProps {
  activities: Activity[];
  leads: Lead[];
  onOpenActivityLogger: (lead?: Lead) => void;
  onSelectLead: (lead: Lead) => void;
}

export const ActivitiesListView: React.FC<ActivitiesListViewProps> = ({
  activities,
  leads,
  onOpenActivityLogger,
  onSelectLead,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');

  const filtered = activities.filter((act) => {
    const matchedLead = leads.find((l) => l.id === act.lead_id);
    const searchTarget = `${act.notes} ${act.activity_type} ${
      matchedLead ? matchedLead.company_name + ' ' + matchedLead.contact_person : ''
    }`.toLowerCase();

    const matchesSearch = searchTarget.includes(searchQuery.toLowerCase());
    const matchesType = selectedType === 'all' || act.activity_type === selectedType;

    return matchesSearch && matchesType;
  });

  const activityTypes = [
    'all',
    'Meeting Check-In',
    'Phone Call',
    'WhatsApp Message',
    'Proposal Sent',
    'Site Visit',
  ];

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
            <h2 className="text-xl font-bold text-[#1f1f1f] tracking-tight flex items-center gap-2 font-serif-heading">
            <History className="w-5 h-5 text-[#ff4800]" />
            Field Activities & Check-Ins
          </h2>
          <p className="text-xs text-[#6b665c]">
            Audit trail of client visits and phone calls
          </p>
        </div>

        <button
          onClick={() => onOpenActivityLogger()}
          className="bg-[#ff4800] hover:bg-[#e03f00] text-white text-xs font-bold px-3.5 py-2 rounded-[8px] border border-[#1f1f1f] flex items-center gap-1.5 self-start sm:self-auto transition-colors"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Check-In</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#6b665c]" />
          <input
            type="text"
            placeholder="Search notes, company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] pl-9 pr-3 py-2 text-xs text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa]"
          />
        </div>

        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-xs text-[#1f1f1f] font-semibold focus:outline-none"
        >
          {activityTypes.map((t) => (
            <option key={t} value={t}>
              {t === 'all' ? 'All Activity Types' : t}
            </option>
          ))}
        </select>
      </div>

      {/* List: 16px radius, warm parchment, 1px hairline border */}
      {filtered.length === 0 ? (
        <div className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-8 text-center text-xs text-[#6b665c]">
          No activities match your search.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((act) => {
            const matchedLead = leads.find((l) => l.id === act.lead_id);

            return (
              <div
                key={act.id}
                className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#1f1f1f] font-serif-heading">
                      {act.activity_type}
                    </span>
                    {matchedLead && (
                      <button
                        onClick={() => onSelectLead(matchedLead)}
                        className="text-xs font-semibold text-[#1f1f1f] hover:text-[#ff4800] underline underline-offset-2 transition-colors flex items-center gap-1"
                      >
                        <Building2 className="w-3.5 h-3.5 text-[#1f1f1f]/50" />
                        <span>{matchedLead.company_name}</span>
                      </button>
                    )}
                  </div>

                </div>

                <p className="text-xs text-[#1f1f1f] leading-relaxed">{act.notes}</p>


                <div className="text-[10px] text-[#6b665c] flex items-center justify-between pt-1 border-t border-[#1f1f1f]/10">
                  <span className="flex items-center gap-1 font-medium">
                    <Calendar className="w-3 h-3 text-[#1f1f1f]/50" />
                    {act.created_at ? new Date(act.created_at).toLocaleString() : 'Recent'}
                  </span>
                  <span className="font-mono text-[#1f1f1f] font-semibold">
                    {act._syncStatus === 'synced' ? 'Synced to Cloud' : 'Local Cache (Pending Sync)'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
