import React, { useEffect, useState } from 'react';
import { History, Plus, Search, Calendar, Building2, MapPin, Sparkles } from 'lucide-react';
import { Activity, Lead } from '../types/crm.ts';
import { formatDateTimeDisplay } from '../utils/crmCalculations.ts';
import { loadActivityPhoto } from '../utils/activityPhotos.ts';

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
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];
    void Promise.all(activities.map(async (activity) => {
      try {
        const photo = await loadActivityPhoto(activity.id);
        if (!photo) return undefined;
        const url = URL.createObjectURL(photo);
        createdUrls.push(url);
        return [activity.id, url] as const;
      } catch {
        return undefined;
      }
    })).then((entries) => {
      if (cancelled) {
        createdUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setPhotoUrls(new Map(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    });
    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [activities]);

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

                <p className="text-xs text-[#1f1f1f] leading-relaxed whitespace-pre-wrap">{act.notes}</p>
                {photoUrls.has(act.id) && <figure className="space-y-1">
                  <img src={photoUrls.get(act.id)} alt={`Dokumentasi lokal untuk ${act.activity_type}`} loading="lazy" className="max-h-64 rounded-[8px] border border-[#1f1f1f] object-contain" />
                  <figcaption className="text-[10px] text-[#6b665c]">Foto lokal pada browser ini; tidak tersinkron antarperangkat.</figcaption>
                </figure>}
                {act.ai_summary && (
                  <div className="rounded-[8px] border border-[#1f1f1f]/30 bg-[#fcfcfa] p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#1f1f1f]"><Sparkles className="w-3 h-3 text-[#ff4800]" />Ringkasan {act.ai_summary_source === 'gemini' ? 'Gemini' : 'lokal'}</div>
                    <p className="text-xs text-[#1f1f1f] leading-relaxed whitespace-pre-wrap">{act.ai_summary}</p>
                  </div>
                )}
                {act.location_gps && (
                  <a
                    href={`https://maps.google.com/?q=${act.location_gps.latitude},${act.location_gps.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#155e3c] underline underline-offset-2"
                  >
                    <MapPin className="w-3 h-3" />
                    Check-in GPS ({act.location_gps.latitude.toFixed(5)}, {act.location_gps.longitude.toFixed(5)}; ±{act.location_gps.accuracy_m} m)
                  </a>
                )}


                <div className="text-[10px] text-[#6b665c] flex items-center justify-between pt-1 border-t border-[#1f1f1f]/10">
                  <span className="flex items-center gap-1 font-medium">
                    <Calendar className="w-3 h-3 text-[#1f1f1f]/50" />
                    {formatDateTimeDisplay(act.created_at)}
                  </span>
                  <span className={`font-mono font-semibold ${act._syncStatus === 'error' ? 'text-[#9b2c2c]' : act._syncStatus === 'synced' ? 'text-[#155e3c]' : 'text-[#a44a00]'}`}>
                    {!act._syncStatus || act._syncStatus === 'synced'
                      ? 'Diakui Firestore'
                      : act._syncStatus === 'error'
                        ? 'Gagal — periksa antrean'
                        : 'Menunggu pengakuan Firestore'}
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
