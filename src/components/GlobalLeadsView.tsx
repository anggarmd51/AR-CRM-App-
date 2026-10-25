import React, { useState } from 'react';
import {
  Search,
  Download,
  Building2,
  MapPin,
  Phone,
  Mail,
  CheckCircle2,
  ArrowRight,
  Filter,
  DollarSign,
  UserCheck,
  ShieldCheck,
} from 'lucide-react';
import { GlobalLead, Lead } from '../types/crm.ts';
import { formatCurrency } from '../utils/crmCalculations.ts';

interface GlobalLeadsViewProps {
  personalLeads: Lead[];
  globalLeads?: GlobalLead[];
  onImportGlobalLead: (lead: GlobalLead) => void;
  onNavigateToPipeline: () => void;
}

export const GlobalLeadsView: React.FC<GlobalLeadsViewProps> = ({
  personalLeads,
  globalLeads = [],
  onImportGlobalLead,
  onNavigateToPipeline,
}) => {
  // No generated prospect data is used. This view only shows locally stored records.
  
  // Secondary Filters
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
  const [dealValueFilter, setDealValueFilter] = useState<'all' | '50m' | '100m'>('all');
  const [importingId, setImportingId] = useState<string | null>(null);

  // Names of companies already in personal CRM pipeline
  const personalCompanyNames = new Set(
    personalLeads.map((l) => l.company_name.toLowerCase().trim())
  );

  const handleResetSearch = () => {
    setSelectedIndustry('all');
    setDealValueFilter('all');
  };

  const currentDataset = globalLeads;

  // Extract unique industries for filter dropdown
  const industries = [
    'all',
    ...Array.from(new Set(currentDataset.map((l) => l.industry))),
  ];

  // Filter leads based on secondary filters
  const displayedLeads = currentDataset.filter((lead) => {
    const matchesIndustry =
      selectedIndustry === 'all' || lead.industry === selectedIndustry;

    const estimatedVal = Number(lead.estimated_value) || 0;
    const matchesValue =
      dealValueFilter === 'all' ||
      (dealValueFilter === '50m' && estimatedVal >= 50_000_000) ||
      (dealValueFilter === '100m' && estimatedVal >= 100_000_000);

    return matchesIndustry && matchesValue;
  });

  const handleImport = async (lead: GlobalLead) => {
    const targetId = lead.id || lead.company_name;
    setImportingId(targetId);
    await onImportGlobalLead(lead);
    setTimeout(() => {
      setImportingId(null);
    }, 600);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1f1f1f]/10 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 bg-[#1f1f1f] text-white rounded-[6px]">
              <Search className="w-4 h-4 text-[#ff4800]" />
            </span>
            <h2 className="text-xl font-bold text-[#1f1f1f] tracking-tight font-serif-heading">
              Direktori Prospek
            </h2>
          </div>
          <p className="text-xs text-[#6b665c] mt-0.5">
            Prospek yang tersimpan lokal. Tidak ada pencarian eksternal atau verifikasi otomatis yang aktif.
          </p>
        </div>

        <button
          onClick={onNavigateToPipeline}
          className="self-start sm:self-auto text-xs font-semibold text-[#1f1f1f] hover:text-[#ff4800] flex items-center gap-1.5 px-3 py-1.5 bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] group transition-all"
        >
          <span>Sales Pipeline ({personalLeads.length})</span>
          <ArrowRight className="w-3.5 h-3.5 text-[#ff4800] group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      <div role="status" className="bg-[#fff5f0] border border-[#ff4800]/60 rounded-[12px] p-4 space-y-1">
        <p className="text-xs font-bold text-[#1f1f1f]">Pencarian prospek eksternal dinonaktifkan</p>
        <p className="text-[11px] text-[#6b665c]">
          Data katalog dan kontak sintetis telah dihapus. Daftar di bawah hanya menampilkan record yang sudah tersimpan di browser; sumber dan kebenarannya belum diverifikasi.
        </p>
      </div>

      {/* Source Selector & Secondary Filters Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
        <div className="text-xs font-semibold text-[#1f1f1f] bg-[#f8f5ee] border border-[#1f1f1f] px-3 py-2 rounded-[8px] self-start">
          Record lokal: {globalLeads.length}
        </div>

        {/* Secondary Filters: Industry & Deal Value */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Industry Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-[#6b665c]" />
            <select
              value={selectedIndustry}
              onChange={(e) => setSelectedIndustry(e.target.value)}
              aria-label="Filter by industry"
              className="bg-transparent text-xs text-[#1f1f1f] font-semibold focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Industri</option>
              {industries.filter((i) => i !== 'all').map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          </div>

          {/* Deal Value Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-2.5 py-1.5">
            <DollarSign className="w-3.5 h-3.5 text-[#ff4800]" />
            <select
              value={dealValueFilter}
              onChange={(e) => setDealValueFilter(e.target.value as 'all' | '50m' | '100m')}
              aria-label="Filter by deal value"
              className="bg-transparent text-xs text-[#1f1f1f] font-semibold focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Nilai</option>
              <option value="50m">&gt; Rp 50 Juta</option>
              <option value="100m">&gt; Rp 100 Juta</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Count & Provenance Notice */}
      <div className="flex items-center justify-between text-xs text-[#6b665c] px-0.5">
        <span>
          Menampilkan <strong className="text-[#1f1f1f]">{displayedLeads.length}</strong> record prospek lokal
        </span>
        <span className="text-[11px] flex items-center gap-1 font-medium text-[#9b2c2c]">
          <ShieldCheck className="w-3.5 h-3.5" />
          Belum diverifikasi
        </span>
      </div>

      {/* Locally stored lead records */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {displayedLeads.map((lead) => {
          const isAlreadyInPipeline = personalCompanyNames.has(
            lead.company_name.toLowerCase().trim()
          );
          const isCurrentlyImporting = importingId === (lead.id || lead.company_name);
          const initials =
            lead.company_initials ||
            lead.company_name
              .replace(/^(PT|CV|UD)\s+/i, '')
              .split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')
              .toUpperCase();

          return (
            <div
              key={lead.id || lead.company_name}
              className={`border border-[#1f1f1f] rounded-[16px] p-4 flex flex-col justify-between transition-all ${
                isAlreadyInPipeline
                  ? 'bg-[#fcfcfa]'
                  : 'bg-[#f8f5ee] hover:bg-[#f4efe5]'
              }`}
            >
              <div className="space-y-3">
                {/* Company Header with local record label */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5">
                    {/* Company Monogram Badge */}
                    <div className="w-9 h-9 rounded-[8px] bg-[#fcfcfa] border border-[#1f1f1f] flex items-center justify-center font-bold text-xs text-[#1f1f1f] font-mono shrink-0">
                      {initials}
                    </div>

                    <div>
                      <h3 className="font-bold text-[#1f1f1f] text-sm sm:text-base font-serif-heading leading-tight">
                        {lead.company_name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-[#6b665c]">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-[#1f1f1f]/50" />
                          {lead.industry}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-[#1f1f1f]/50" />
                          {lead.city}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-semibold bg-[#fcfcfa] border border-[#1f1f1f] px-2 py-0.5 rounded-[4px] shrink-0">
                    Record lokal
                  </span>
                </div>

                {/* Contact fields; source is not independently verified. */}
                <div className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[8px] p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-[#ff4800]" />
                      <span className="text-xs font-bold text-[#1f1f1f]">
                        {lead.contact_person}
                      </span>
                    </div>
                    {lead.decision_maker_title && (
                      <span className="text-[10px] font-semibold bg-[#f8f5ee] border border-[#1f1f1f]/60 text-[#1f1f1f] px-2 py-0.5 rounded-[4px]">
                        {lead.decision_maker_title}
                      </span>
                    )}
                  </div>

                  {/* Contact details */}
                  <div className="flex items-center gap-3 text-[11px] text-[#1f1f1f] flex-wrap pt-0.5 border-t border-[#1f1f1f]/10">
                    <div className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-[#155e3c]" />
                      <span className="font-mono">{lead.phone}</span>
                    </div>

                    {lead.email && (
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3 text-[#ff4800]" />
                        <span className="font-mono">{lead.email}</span>
                      </div>
                    )}

                    <span className="text-[9px] font-bold text-[#9b2c2c] bg-[#fff5f0] border border-[#9b2c2c]/30 px-1.5 py-0.2 rounded-[3px] ml-auto">
                      BELUM DIVERIFIKASI
                    </span>
                  </div>
                </div>

                {/* Additional stored notes */}
                {lead.insights && (
                  <p className="text-[11px] text-[#6b665c] italic border-l-2 border-[#ff4800] pl-2 py-0.5 leading-snug">
                    {lead.insights}
                  </p>
                )}

                {/* Deal Value & Tags row */}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {lead.tags &&
                      lead.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-semibold bg-[#fcfcfa] text-[#1f1f1f] px-2 py-0.5 rounded-[4px] border border-[#1f1f1f]/60"
                        >
                          {tag}
                        </span>
                      ))}
                  </div>

                  {lead.estimated_value && (
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-[#6b665c] block uppercase tracking-wider font-semibold">
                        Est. Deal Size
                      </span>
                      <span className="text-xs font-mono font-bold text-[#1f1f1f] bg-[#fcfcfa] border border-[#1f1f1f] px-2 py-0.5 rounded-[4px]">
                        {formatCurrency(lead.estimated_value)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button: 8px radius with Sprout Orange */}
              <div className="pt-3 mt-3 border-t border-[#1f1f1f]/10 flex items-center justify-between">
                <span className="text-[11px] text-[#6b665c] font-medium">
                  {isAlreadyInPipeline ? 'Tersimpan di CRM Sales' : 'Siap dikonversi ke pipeline'}
                </span>

                {isAlreadyInPipeline ? (
                  <button
                    disabled
                    className="flex items-center gap-1.5 bg-[#fcfcfa] border border-[#1f1f1f] text-[#1f1f1f] text-xs font-bold px-3 py-1.5 rounded-[8px] cursor-default opacity-90"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#ff4800]" />
                    <span>In Pipeline</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleImport(lead)}
                    disabled={isCurrentlyImporting}
                    className="flex items-center gap-1.5 bg-[#ff4800] hover:bg-[#e03f00] text-white text-xs font-bold px-4 py-2 rounded-[8px] border border-[#1f1f1f] transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isCurrentlyImporting ? 'Mengimpor...' : 'Import ke Pipeline'}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {displayedLeads.length === 0 && (
        <div className="border border-[#1f1f1f] rounded-[16px] bg-[#f8f5ee] p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-[#fcfcfa] border border-[#1f1f1f] flex items-center justify-center mx-auto text-[#6b665c]">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-[#1f1f1f]">Belum ada record prospek lokal</h4>
            <p className="text-xs text-[#6b665c] max-w-sm mx-auto mt-1">
              Pencarian eksternal dinonaktifkan sampai ada sumber prospek nyata dengan provenance yang dapat diperiksa.
            </p>
          </div>
          <button
            onClick={handleResetSearch}
            className="text-xs font-bold text-[#ff4800] hover:underline"
          >
            Reset filter
          </button>
        </div>
      )}
    </div>
  );
};
