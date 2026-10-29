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
  Sparkles,
  LoaderCircle,
  ExternalLink,
} from 'lucide-react';
import { GlobalLead, Lead } from '../types/crm.ts';
import { formatCurrency, formatNumber } from '../utils/crmCalculations.ts';
import { getFirebaseAuth } from '../firebase.ts';
import { normalizeImportedCompanyName } from '../utils/leadImportIdentity.ts';
import {
  normalizeLeadFinderSources,
  parseLeadFinderSuggestions,
  validateLeadFinderInput,
  type LeadFinderSource,
} from '../leadFinderAi.ts';

interface GlobalLeadsViewProps {
  personalLeads: Lead[];
  globalLeads?: GlobalLead[];
  pendingImportedCompanyNames?: ReadonlySet<string>;
  aiSearchEnabled?: boolean;
  onImportGlobalLead: (lead: GlobalLead) => Promise<void>;
  onNavigateToPipeline: () => void;
}

export const GlobalLeadsView: React.FC<GlobalLeadsViewProps> = ({
  personalLeads,
  globalLeads = [],
  pendingImportedCompanyNames = new Set(),
  aiSearchEnabled = false,
  onImportGlobalLead,
  onNavigateToPipeline,
}) => {

  // Secondary Filters
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
  const [dealValueFilter, setDealValueFilter] = useState<'all' | '50m' | '100m'>('all');
  const [importingCompanyNames, setImportingCompanyNames] = useState<Set<string>>(() => new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const [industryQuery, setIndustryQuery] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [customerProfileQuery, setCustomerProfileQuery] = useState('');
  const [aiResults, setAiResults] = useState<GlobalLead[]>([]);
  const [aiSources, setAiSources] = useState<LeadFinderSource[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Names of companies already in personal CRM pipeline
  const personalCompanyNames = new Set(
    personalLeads.map((l) => normalizeImportedCompanyName(l.company_name))
  );

  const handleResetSearch = () => {
    setSelectedIndustry('all');
    setDealValueFilter('all');
  };

  const currentDataset = [...globalLeads, ...aiResults];

  const handleAiSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!aiSearchEnabled || aiLoading) return;
    const input = {
      industry: industryQuery,
      city: cityQuery,
      ...(customerProfileQuery.trim() ? { customerProfile: customerProfileQuery } : {}),
    };
    const validation = validateLeadFinderInput(input);
    if (!validation.ok) {
      setAiError(validation.error);
      return;
    }

    const user = getFirebaseAuth().currentUser;
    if (!user) {
      setAiError('Sesi login tidak tersedia. Masuk kembali lalu coba lagi.');
      return;
    }

    setAiLoading(true);
    setAiError(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/ai/lead-finder', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: {
          authorization: `Bearer ${idToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(validation.value),
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      const data = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
      if (!response.ok) {
        if (response.status === 429) throw new Error('Batas lima permintaan AI gabungan hari ini sudah tercapai. Coba lagi besok.');
        if (response.status === 401 || response.status === 403) throw new Error('Sesi PIN akun perlu diverifikasi kembali. Masuk ulang lalu coba lagi.');
        if (response.status === 404) throw new Error('Pencarian AI belum diaktifkan pada server ini.');
        throw new Error(typeof data.error === 'string' ? data.error : 'Pencarian AI sementara tidak tersedia.');
      }

      const suggestions = parseLeadFinderSuggestions(JSON.stringify({ leads: data.leads }));
      const sources = normalizeLeadFinderSources(data.sources);
      if (suggestions.length === 0 || sources.length === 0) {
        throw new Error('Gemini tidak mengembalikan saran dengan sumber web yang dapat diperiksa.');
      }
      setAiResults(suggestions.map((suggestion, index) => ({
        id: `ai-${index}-${suggestion.company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        company_name: suggestion.company_name,
        contact_person: '',
        phone: '',
        industry: suggestion.industry,
        city: suggestion.city,
        estimated_value: undefined,
        ai_match_score: suggestion.fit_score,
        is_ai_enriched: true,
        insights: suggestion.reason,
      })));
      setAiSources(sources);
      setSelectedIndustry('all');
      setDealValueFilter('all');
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Pencarian AI sementara tidak tersedia.');
    } finally {
      setAiLoading(false);
    }
  };

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
    const companyKey = normalizeImportedCompanyName(lead.company_name);
    if (personalCompanyNames.has(companyKey) || pendingImportedCompanyNames.has(companyKey) || importingCompanyNames.has(companyKey)) return;
    setImportError(null);
    setImportingCompanyNames((current) => new Set(current).add(companyKey));
    try {
      await onImportGlobalLead(lead);
    } catch {
      setImportError(`"${lead.company_name}" belum berhasil diimpor. Anda dapat mencoba lagi.`);
    } finally {
      setImportingCompanyNames((current) => {
        const next = new Set(current);
        next.delete(companyKey);
        return next;
      });
    }
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
              AI Lead Finder
            </h2>
          </div>
          <p className="text-xs text-[#6b665c] mt-0.5">
            Temukan kandidat perusahaan dari web publik; AI tidak mengirim data CRM Anda.
          </p>
        </div>

        <button
          onClick={onNavigateToPipeline}
          className="self-start sm:self-auto text-xs font-semibold text-[#1f1f1f] hover:text-[#ff4800] flex items-center gap-1.5 px-3 py-1.5 bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] group transition-all"
        >
          <span>Sales Pipeline ({formatNumber(personalLeads.length)})</span>
          <ArrowRight className="w-3.5 h-3.5 text-[#ff4800] group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      <div role="status" className="bg-[#fff5f0] border border-[#ff4800]/60 rounded-[12px] p-4 space-y-1">
        <p className="text-xs font-bold text-[#1f1f1f]">Saran AI bukan data kontak terverifikasi</p>
        <p className="text-[11px] text-[#6b665c]">
          Batas lima permintaan AI per hari dipakai bersama Lead Finder dan ringkasan rapat. Gemini menerima hanya kategori, kota, dan profil bisnis yang Anda isi—bukan daftar Lead, catatan Activity, email, atau nomor telepon.
        </p>
      </div>

      <section className="rounded-[16px] border border-[#1f1f1f] bg-[#f8f5ee] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#ff4800]" />
          <h3 className="text-sm font-bold text-[#1f1f1f]">Cari perusahaan prospek</h3>
        </div>
        <form onSubmit={(event) => void handleAiSearch(event)} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label className="text-[11px] font-semibold text-[#6b665c] space-y-1">
            <span>Kategori usaha</span>
            <input value={industryQuery} onChange={(event) => setIndustryQuery(event.target.value)} maxLength={120} placeholder="Contoh: kontraktor gedung" disabled={!aiSearchEnabled || aiLoading} className="w-full rounded-[8px] border border-[#1f1f1f] bg-[#fcfcfa] px-3 py-2 text-xs text-[#1f1f1f] disabled:opacity-60" />
          </label>
          <label className="text-[11px] font-semibold text-[#6b665c] space-y-1">
            <span>Kota / area</span>
            <input value={cityQuery} onChange={(event) => setCityQuery(event.target.value)} maxLength={120} placeholder="Contoh: Bandung" disabled={!aiSearchEnabled || aiLoading} className="w-full rounded-[8px] border border-[#1f1f1f] bg-[#fcfcfa] px-3 py-2 text-xs text-[#1f1f1f] disabled:opacity-60" />
          </label>
          <label className="text-[11px] font-semibold text-[#6b665c] space-y-1 sm:col-span-2">
            <span>Profil bisnis yang cocok (opsional)</span>
            <input value={customerProfileQuery} onChange={(event) => setCustomerProfileQuery(event.target.value)} maxLength={240} placeholder="Contoh: perusahaan menengah dengan proyek komersial" disabled={!aiSearchEnabled || aiLoading} className="w-full rounded-[8px] border border-[#1f1f1f] bg-[#fcfcfa] px-3 py-2 text-xs text-[#1f1f1f] disabled:opacity-60" />
          </label>
          <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center gap-2">
            <button type="submit" disabled={!aiSearchEnabled || aiLoading || !industryQuery.trim() || !cityQuery.trim()} className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#1f1f1f] bg-[#ff4800] px-4 py-2 text-xs font-bold text-white hover:bg-[#e03f00] disabled:cursor-not-allowed disabled:opacity-50">
              {aiLoading ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              {aiLoading ? 'Mencari di web…' : 'Cari dengan Gemini'}
            </button>
            {!aiSearchEnabled && <span className="text-[11px] text-[#9b2c2c]">AI belum diaktifkan pada deployment ini.</span>}
          </div>
        </form>
        {aiError && <p role="alert" className="text-xs text-[#9b2c2c]">{aiError}</p>}
        {importError && <p role="alert" className="text-xs text-[#9b2c2c]">{importError}</p>}
      </section>

      {/* Source Selector & Secondary Filters Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
        <div className="text-xs font-semibold text-[#1f1f1f] bg-[#f8f5ee] border border-[#1f1f1f] px-3 py-2 rounded-[8px] self-start">
          Saran AI: {formatNumber(aiResults.length)} · Record lain: {formatNumber(globalLeads.length)}
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
          Menampilkan <strong className="text-[#1f1f1f]">{formatNumber(displayedLeads.length)}</strong> record prospek lokal
        </span>
        <span className="text-[11px] flex items-center gap-1 font-medium text-[#9b2c2c]">
          <ShieldCheck className="w-3.5 h-3.5" />
          Belum diverifikasi
        </span>
      </div>

      {/* Locally stored lead records */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {displayedLeads.map((lead) => {
          const companyKey = normalizeImportedCompanyName(lead.company_name);
          const isAlreadyInPipeline = personalCompanyNames.has(companyKey) || lead.alreadyImported === true;
          const isWaitingForFirestore = pendingImportedCompanyNames.has(companyKey);
          const isCurrentlyImporting = importingCompanyNames.has(companyKey);
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

                  <div className="flex items-center gap-1.5 shrink-0">
                    {lead.is_ai_enriched && typeof lead.ai_match_score === 'number' && (
                      <span aria-label={`Skor kecocokan AI: ${Math.round(lead.ai_match_score)} dari 100`} className="text-[10px] font-bold text-[#155e3c] bg-[#edf7f1] border border-[#155e3c]/40 px-2 py-0.5 rounded-[4px]">
                        Skor {formatNumber(lead.ai_match_score)} / 100
                      </span>
                    )}
                    <span className="text-[10px] font-semibold bg-[#fcfcfa] border border-[#1f1f1f] px-2 py-0.5 rounded-[4px]">
                      {lead.is_ai_enriched ? 'Saran AI' : 'Record lokal'}
                    </span>
                  </div>
                </div>

                {/* Contact fields; source is not independently verified. */}
                <div className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[8px] p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-[#ff4800]" />
                      <span className="text-xs font-bold text-[#1f1f1f]">
                        {lead.contact_person || 'Kontak belum ditemukan'}
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
                    {lead.phone ? (
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-[#155e3c]" />
                        <span className="font-mono">{lead.phone}</span>
                      </div>
                    ) : <span className="text-[#6b665c]">Nomor telepon tidak dicantumkan</span>}

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
                  {isAlreadyInPipeline ? 'Tersimpan di CRM Sales' : isWaitingForFirestore ? 'Menunggu konfirmasi Firestore' : 'Siap dikonversi ke pipeline'}
                </span>

                {isAlreadyInPipeline || isWaitingForFirestore ? (
                  <button
                    disabled
                    className="flex items-center gap-1.5 bg-[#fcfcfa] border border-[#1f1f1f] text-[#1f1f1f] text-xs font-bold px-3 py-1.5 rounded-[8px] cursor-default opacity-90"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#ff4800]" />
                    <span>{isAlreadyInPipeline ? 'In Pipeline' : 'Menunggu Firestore'}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => { void handleImport(lead); }}
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

      {aiSources.length > 0 && (
        <section className="rounded-[12px] border border-[#1f1f1f]/30 bg-[#fcfcfa] p-4 space-y-2">
          <h3 className="text-xs font-bold text-[#1f1f1f]">Sumber web dari Gemini</h3>
          <ul className="space-y-1.5">
            {aiSources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 break-all text-[11px] text-[#155e3c] underline underline-offset-2">
                  {source.title}<ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-[#6b665c]">Periksa sumber sebelum menghubungi atau menyimpan perusahaan. Gemini tidak menyediakan kontak pribadi pada hasil ini.</p>
        </section>
      )}

      {/* Empty State */}
      {displayedLeads.length === 0 && (
        <div className="border border-[#1f1f1f] rounded-[16px] bg-[#f8f5ee] p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-[#fcfcfa] border border-[#1f1f1f] flex items-center justify-center mx-auto text-[#6b665c]">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-[#1f1f1f]">Belum ada hasil prospek</h4>
            <p className="text-xs text-[#6b665c] max-w-sm mx-auto mt-1">
              Isi kategori usaha dan kota di atas. Kandidat AI hanya tampil jika ada sumber web untuk diperiksa.
            </p>
          </div>
          <button
            onClick={handleResetSearch}
            className="text-xs font-bold text-[#ff4800] hover:underline"
          >
            Reset filter tampilan
          </button>
        </div>
      )}
    </div>
  );
};
