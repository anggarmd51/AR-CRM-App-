import React, { useState, useEffect } from 'react';
import {
  Compass,
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
  Sparkles,
  UserCheck,
  ShieldCheck,
  TrendingUp,
  RotateCcw,
  Loader2,
  Layers,
} from 'lucide-react';
import { GlobalLead, Lead } from '../types/crm.ts';
import { GLOBAL_LEADS_CATALOG } from '../utils/syncQueue.ts';
import { searchAndEnrichProspects } from '../utils/aiLeadEnrichment.ts';
import { formatCurrency } from '../utils/crmCalculations.ts';

interface GlobalLeadsViewProps {
  personalLeads: Lead[];
  onImportGlobalLead: (lead: GlobalLead) => void;
  onNavigateToPipeline: () => void;
}

const SAMPLE_AI_QUERIES = [
  'Manufaktur di Medan',
  'Klinik Kecantikan Jakarta',
  'Distributor F&B Surabaya',
  'Logistik & Cold Chain',
  'Fintech & Payment Gateway',
];

export const GlobalLeadsView: React.FC<GlobalLeadsViewProps> = ({
  personalLeads,
  onImportGlobalLead,
  onNavigateToPipeline,
}) => {
  // Search input state
  const [aiSearchInput, setAiSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  
  // Loading & View state
  const [isScanning, setIsScanning] = useState(false);
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const [viewSource, setViewSource] = useState<'ai' | 'standard'>('ai');
  const [enrichedResults, setEnrichedResults] = useState<GlobalLead[]>([]);
  
  // Secondary Filters
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
  const [dealValueFilter, setDealValueFilter] = useState<'all' | '50m' | '100m'>('all');
  const [importingId, setImportingId] = useState<string | null>(null);

  // Initialize with initial AI prospect directory
  useEffect(() => {
    const initialLeads = searchAndEnrichProspects('');
    setEnrichedResults(initialLeads);
  }, []);

  // Names of companies already in personal CRM pipeline
  const personalCompanyNames = new Set(
    personalLeads.map((l) => l.company_name.toLowerCase().trim())
  );

  // Handle AI Search Execution
  const handleRunAiSearch = (queryToRun?: string) => {
    const query = (queryToRun !== undefined ? queryToRun : aiSearchInput).trim();
    if (!query) return;

    if (queryToRun !== undefined) {
      setAiSearchInput(queryToRun);
    }
    setActiveQuery(query);
    setViewSource('ai');
    setIsScanning(true);
    setScanStepIndex(0);

    // Realistic scanning phase animations
    const step1Timer = setTimeout(() => setScanStepIndex(1), 400);
    const step2Timer = setTimeout(() => setScanStepIndex(2), 850);

    const finishTimer = setTimeout(() => {
      const results = searchAndEnrichProspects(query);
      setEnrichedResults(results);
      setIsScanning(false);
    }, 1250);

    return () => {
      clearTimeout(step1Timer);
      clearTimeout(step2Timer);
      clearTimeout(finishTimer);
    };
  };

  const handleResetSearch = () => {
    setAiSearchInput('');
    setActiveQuery('');
    setSelectedIndustry('all');
    setDealValueFilter('all');
    setEnrichedResults(searchAndEnrichProspects(''));
  };

  // Determine active dataset based on tab
  const currentDataset = viewSource === 'ai' ? enrichedResults : GLOBAL_LEADS_CATALOG;

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

  const scanningSteps = [
    'AI sedang memindai direktori B2B & profil perusahaan...',
    'Memperkaya profil decision maker & memverifikasi direct dial/email...',
    'Menghitung AI Match Score & estimasi potensi nilai deal...',
  ];

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1f1f1f]/10 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 bg-[#1f1f1f] text-white rounded-[6px]">
              <Sparkles className="w-4 h-4 text-[#ff4800]" />
            </span>
            <h2 className="text-xl font-bold text-[#1f1f1f] tracking-tight font-serif-heading">
              AI Lead Finder & Enrichment
            </h2>
          </div>
          <p className="text-xs text-[#6b665c] mt-0.5">
            Pindai prospek korporat B2B, temukan pengambil keputusan terverifikasi, dan masukkan ke pipeline dengan 1-click
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

      {/* AI Prospecting Search Bar (AR CRM Design System) */}
      <div className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-4 space-y-3 shadow-none">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Text Input with prompt */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-[#6b665c]" />
            <input
              type="text"
              placeholder="Cari industri/niche target (contoh: Manufaktur di Medan, Klinik Kecantikan, Distributor F&B)"
              value={aiSearchInput}
              onChange={(e) => setAiSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRunAiSearch();
                }
              }}
              className="w-full bg-[#fcfcfa] border border-[#1f1f1f] rounded-[8px] pl-9 pr-3 py-2.5 text-xs text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:ring-1 focus:ring-[#ff4800]"
            />
          </div>

          {/* AI Search CTA Button */}
          <button
            onClick={() => handleRunAiSearch()}
            disabled={isScanning || !aiSearchInput.trim()}
            className="flex items-center justify-center gap-2 bg-[#ff4800] hover:bg-[#e03f00] disabled:bg-[#ff4800]/50 text-white text-xs font-bold px-4 py-2.5 rounded-[8px] border border-[#1f1f1f] transition-all active:scale-[0.98] shrink-0"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Memindai AI...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Cari Prospek dengan AI</span>
              </>
            )}
          </button>
        </div>

        {/* Quick Sample Queries / Chips */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-[11px] font-semibold text-[#6b665c] mr-1">Rekomendasi Niche:</span>
          {SAMPLE_AI_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => handleRunAiSearch(q)}
              className="text-[11px] font-medium bg-[#fcfcfa] hover:bg-[#f2ede4] text-[#1f1f1f] px-2.5 py-1 rounded-[6px] border border-[#1f1f1f]/50 hover:border-[#1f1f1f] transition-all"
            >
              {q}
            </button>
          ))}
          {activeQuery && (
            <button
              onClick={handleResetSearch}
              className="text-[11px] text-[#ff4800] hover:underline flex items-center gap-1 ml-auto font-medium"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Pencarian</span>
            </button>
          )}
        </div>
      </div>

      {/* AI Scanning / Enrichment Animation Banner */}
      {isScanning && (
        <div className="bg-[#f8f5ee] border border-[#ff4800] rounded-[12px] p-4 flex items-center gap-3.5 animate-pulse">
          <div className="w-8 h-8 rounded-full bg-[#ff4800] flex items-center justify-center text-white shrink-0">
            <Sparkles className="w-4 h-4 animate-spin" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-[#1f1f1f]">
                AI sedang memindai dan memperkaya data prospek...
              </p>
              <span className="text-[10px] font-mono font-bold text-[#ff4800]">
                {scanStepIndex + 1}/3
              </span>
            </div>
            <p className="text-[11px] text-[#6b665c]">
              {scanningSteps[scanStepIndex]}
            </p>
          </div>
        </div>
      )}

      {/* Source Selector & Secondary Filters Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
        {/* Dataset Source Toggle */}
        <div className="flex items-center gap-1 bg-[#f8f5ee] border border-[#1f1f1f] p-1 rounded-[8px] self-start">
          <button
            onClick={() => setViewSource('ai')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-[6px] transition-all ${
              viewSource === 'ai'
                ? 'bg-[#1f1f1f] text-white'
                : 'text-[#6b665c] hover:text-[#1f1f1f]'
            }`}
          >
            <Sparkles className="w-3 h-3 text-[#ff4800]" />
            <span>AI Discovered ({enrichedResults.length})</span>
          </button>
          <button
            onClick={() => setViewSource('standard')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-[6px] transition-all ${
              viewSource === 'standard'
                ? 'bg-[#1f1f1f] text-white'
                : 'text-[#6b665c] hover:text-[#1f1f1f]'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Standard Directory ({GLOBAL_LEADS_CATALOG.length})</span>
          </button>
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

      {/* Results Count & Query Notice */}
      <div className="flex items-center justify-between text-xs text-[#6b665c] px-0.5">
        <span>
          Menampilkan <strong className="text-[#1f1f1f]">{displayedLeads.length}</strong> prospek B2B
          {activeQuery && (
            <span>
              {' '}untuk kata kunci &ldquo;<strong className="text-[#1f1f1f]">{activeQuery}</strong>&rdquo;
            </span>
          )}
        </span>
        <span className="text-[11px] flex items-center gap-1 font-medium text-[#1f1f1f]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#155e3c]" />
          Verified Decision Makers
        </span>
      </div>

      {/* AR CRM Enriched Lead Cards Grid */}
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
                {/* Company Header with Logo/Initials and AI Score */}
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

                  {/* AI Match Score Badge (AR CRM Intelligence) */}
                  {lead.ai_match_score ? (
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-[10px] font-bold text-[#ff4800] bg-[#fff5f0] border border-[#ff4800]/40 px-2 py-0.5 rounded-[4px] flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {lead.ai_match_score}% {lead.intent_level || 'Match'}
                      </span>
                      {lead.employee_count && (
                        <span className="text-[10px] text-[#6b665c] mt-0.5 font-medium">
                          {lead.employee_count}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] font-semibold bg-[#fcfcfa] border border-[#1f1f1f] px-2 py-0.5 rounded-[4px]">
                      Verified Lead
                    </span>
                  )}
                </div>

                {/* Decision Maker Section (AR CRM Verified Profile) */}
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

                  {/* Contact verification row */}
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

                    <span className="text-[9px] font-bold text-[#155e3c] bg-[#edf7f1] border border-[#155e3c]/30 px-1.5 py-0.2 rounded-[3px] ml-auto">
                      VERIFIED DIRECT
                    </span>
                  </div>
                </div>

                {/* AI Intelligence Insights (AR CRM Analytics) */}
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
      {displayedLeads.length === 0 && !isScanning && (
        <div className="border border-[#1f1f1f] rounded-[16px] bg-[#f8f5ee] p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-[#fcfcfa] border border-[#1f1f1f] flex items-center justify-center mx-auto text-[#6b665c]">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-[#1f1f1f]">Tidak ada prospek yang sesuai</h4>
            <p className="text-xs text-[#6b665c] max-w-sm mx-auto mt-1">
              Coba gunakan kata kunci industri lain atau ubah filter nilai deal di atas.
            </p>
          </div>
          <button
            onClick={handleResetSearch}
            className="text-xs font-bold text-[#ff4800] hover:underline"
          >
            Tampilkan Semua Prospek Rekomendasi
          </button>
        </div>
      )}
    </div>
  );
};
