import React, { useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Linkedin, Mail, Plus, Search, Sparkles, UsersRound } from 'lucide-react';
import { getFirebaseAuth } from '../firebase.ts';
import {
  MAX_PROSPECT_QUERY_LENGTH,
  buildFallbackGoogleDorks,
  buildGoogleSearchUrl,
  buildLinkedInPeopleSearchUrl,
  parseProspectResearchResponse,
  validateProspectQuery,
  type ProspectResearchResult,
} from '../utils/prospectResearch.ts';

interface GlobalLeadsViewProps {
  onSaveToPipeline: (companyNameDraft: string) => void;
}

const QUICK_FILTERS = ['C-Level', 'IT', 'HR', 'Finance', 'Procurement'] as const;

export const GlobalLeadsView: React.FC<GlobalLeadsViewProps> = ({ onSaveToPipeline }) => {
  const [query, setQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [result, setResult] = useState<ProspectResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const [copiedDorks, setCopiedDorks] = useState(false);
  const searchQuery = useMemo(
    () => [query.trim(), ...selectedFilters].filter(Boolean).join(' ').trim(),
    [query, selectedFilters],
  );
  const linkedInSearchUrl = searchQuery.length > 0 && searchQuery.length <= MAX_PROSPECT_QUERY_LENGTH
    ? buildLinkedInPeopleSearchUrl(searchQuery)
    : undefined;
  const instantGoogleSearchUrl = searchQuery.length > 0 && searchQuery.length <= MAX_PROSPECT_QUERY_LENGTH
    ? buildGoogleSearchUrl(buildFallbackGoogleDorks(searchQuery))
    : undefined;

  const toggleFilter = (filter: string) => {
    setSelectedFilters((current) => current.includes(filter)
      ? current.filter((item) => item !== filter)
      : [...current, filter]);
    setError(null);
    setResult(null);
  };

  const handleResearch = async () => {
    if (isResearching) return;
    let validatedQuery: string;
    try {
      validatedQuery = validateProspectQuery(searchQuery);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Masukkan kata pencarian.');
      setResult(null);
      return;
    }

    let user: ReturnType<typeof getFirebaseAuth>['currentUser'];
    try {
      user = getFirebaseAuth().currentUser;
    } catch {
      setError('Sesi owner belum siap. Muat ulang aplikasi lalu coba lagi.');
      setResult(null);
      return;
    }
    if (!user) {
      setError('Masuk sebagai owner CRM untuk menjalankan riset.');
      setResult(null);
      return;
    }

    setIsResearching(true);
    setError(null);
    setResult(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/ai/prospecting', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ query: validatedQuery }),
      });
      if (!response.ok) {
        const errorPayload: unknown = await response.json().catch(() => null);
        const errorCode = errorPayload && typeof errorPayload === 'object' && !Array.isArray(errorPayload)
          && typeof (errorPayload as Record<string, unknown>).code === 'string'
          ? (errorPayload as Record<string, string>).code
          : undefined;
        if (response.status === 503 && errorCode === 'feature_disabled') {
          throw new Error('Riset AI belum diaktifkan pada environment ini.');
        }
        if (response.status === 503 && errorCode === 'providers_temporarily_unavailable') {
          throw new Error('Semua server AI sedang sibuk. Silakan coba beberapa saat lagi.');
        }
        if (response.status === 503) throw new Error('Layanan riset AI sementara tidak tersedia. Coba lagi nanti.');
        if (response.status === 429) throw new Error('Batas riset harian tercapai. Coba lagi besok.');
        if (response.status === 401 || response.status === 403) throw new Error('Sesi owner tidak dapat diverifikasi. Masuk kembali lalu coba lagi.');
        throw new Error('Riset gagal sementara. Coba lagi nanti.');
      }
      const payload: unknown = await response.json();
      setResult(parseProspectResearchResponse(payload));
    } catch (researchError) {
      setError(researchError instanceof TypeError
        ? 'Koneksi ke layanan riset AI terputus. Periksa koneksi lalu coba lagi.'
        : researchError instanceof Error
          ? researchError.message
          : 'Riset gagal sementara. Coba lagi nanti.');
    } finally {
      setIsResearching(false);
    }
  };

  const handleCopyDorks = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.google_dorks);
      setCopiedDorks(true);
      window.setTimeout(() => setCopiedDorks(false), 1800);
    } catch {
      setError('Clipboard tidak tersedia di browser ini. Pilih dan salin teks Google Dorks secara manual.');
    }
  };

  const targetRoles = result?.target_roles
    .split(/\r?\n/)
    .map((role) => role.replace(/^\s*[-•]\s*/, '').trim())
    .filter(Boolean) ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24 sm:space-y-7">
      <header className="border-b border-[#1f1f1f] pb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff4800]">Riset prospek B2B</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1f1f] font-serif-heading sm:text-3xl">Leads Finder</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b665c]">Temukan pengambil keputusan, petakan profil perusahaan, lalu lanjutkan koneksi dari satu tempat.</p>
      </header>

      <section aria-label="Pencarian database dan profiling AI" className="rounded-[16px] border border-[#1f1f1f] bg-[#fcfcfa] p-4 shadow-sm sm:p-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff4800]">AI Prospect Search</p>
            <h3 className="mt-1 text-lg font-bold text-[#1f1f1f] sm:text-xl">Siapa yang ingin Anda temukan?</h3>
          </div>
          <label htmlFor="prospect-search" className="sr-only">Cari perusahaan, industri, jabatan, atau kota</label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6b665c]" />
            <input
              id="prospect-search"
              type="search"
              maxLength={MAX_PROSPECT_QUERY_LENGTH}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setError(null); setResult(null); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void handleResearch(); } }}
              placeholder="Perusahaan, industri, jabatan, atau kota…"
              className="min-h-14 w-full rounded-[8px] border border-[#1f1f1f] bg-[#f8f5ee] py-3 pl-12 pr-4 text-base text-[#1f1f1f] outline-none transition placeholder:text-[#6b665c] focus:border-[#ff4800] focus:bg-[#fcfcfa] focus:ring-4 focus:ring-[#ff4800]/15"
            />
          </div>

          <div className="mt-4">
            <p className="mb-2 text-center text-[11px] font-semibold text-[#6b665c]">Quick filters <span className="font-normal">· pilih satu atau beberapa</span></p>
            <div className="flex flex-wrap justify-center gap-2" aria-label="Filter jabatan cepat">
              {QUICK_FILTERS.map((filter) => {
                const isSelected = selectedFilters.includes(filter);
                return (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleFilter(filter)}
                    className={`min-h-10 rounded-[8px] border px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4800] focus-visible:ring-offset-2 ${isSelected ? 'border-[#1f1f1f] bg-[#1f1f1f] text-[#fcfcfa] shadow-sm' : 'border-[#1f1f1f] bg-[#fcfcfa] text-[#6b665c] hover:bg-[#f2ede4] hover:text-[#1f1f1f]'}`}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void handleResearch()}
              disabled={!searchQuery || isResearching}
              className="group flex min-h-14 items-center justify-center gap-3 rounded-[8px] border border-[#1f1f1f] bg-[#ff4800] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#e03f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff4800]/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/15"><Sparkles className="h-5 w-5" /></span>
              <span className="text-left">{isResearching ? 'Mencari kontak…' : 'Cari Kontak (AI & Dorks)'}<span className="mt-0.5 block text-[10px] font-medium text-white/90">Profil, jabatan, dan pola email</span></span>
            </button>
            <a
              href={linkedInSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!linkedInSearchUrl}
              onClick={(event) => {
                if (!linkedInSearchUrl) event.preventDefault();
                setError(null);
              }}
              className="flex min-h-14 items-center justify-center gap-3 rounded-[8px] border border-[#1f1f1f] bg-[#f8f5ee] px-4 py-3 text-sm font-bold text-[#1f1f1f] transition hover:bg-[#f2ede4] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff4800]/20 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
              <span className="grid h-9 w-9 place-items-center rounded-[8px] bg-[#eae4d5]"><Linkedin className="h-5 w-5 text-[#0F2C59]" /></span>
              <span className="text-left">Cari Orang di LinkedIn<span className="mt-0.5 block text-[10px] font-medium text-[#6b665c]">Membuka tab pencarian People</span></span>
            </a>
          </div>
          {instantGoogleSearchUrl && (
            <p className="mt-3 text-center text-[11px] leading-5 text-[#6b665c]">
              <a href={instantGoogleSearchUrl} target="_blank" rel="noopener noreferrer" onClick={() => setError(null)} className="font-semibold text-[#0F2C59] underline decoration-[#0F2C59]/40 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4800]">
                Cari Google instan tanpa AI
              </a>
              <span> · Kata dari kolom di atas dipecah otomatis; hasil perlu diverifikasi.</span>
            </p>
          )}
          <p className="mt-3 text-center text-[10px] leading-4 text-[#6b665c]">AI memberi saran awal; verifikasi profil dan kontak sebelum outreach. App Links LinkedIn bergantung pada konfigurasi aplikasi dan perangkat Anda.</p>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}
      {isResearching && <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-[8px] border border-[#ff4800]/30 bg-[#fff5f0] px-4 py-3 text-sm font-medium text-[#9b2c00]"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#ff4800]" />Sedang menyusun profil prospek…</div>}

      {result && (
        <article className="overflow-hidden rounded-[16px] border border-[#1f1f1f] bg-[#fcfcfa] shadow-sm">
          <header className="flex items-start gap-3 border-b border-[#1f1f1f] bg-[#f8f5ee] px-4 py-4 sm:px-6">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] bg-[#fff5f0] text-[#ff4800]"><Sparkles className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ff4800]">AI prospect profile</p>
              <h3 className="mt-1 break-words text-base font-bold text-[#1f1f1f] sm:text-lg font-serif-heading">{searchQuery}</h3>
              <p className="mt-1 text-xs text-[#6b665c]">Saran AI — verifikasi sebelum digunakan.</p>
            </div>
          </header>
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
            <section className="rounded-[8px] border border-[#1f1f1f] bg-[#f8f5ee] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[#1f1f1f]">
                <UsersRound className="h-4 w-4 text-[#ff4800]" />
                <h4 className="text-xs font-bold uppercase tracking-wide">Jabatan Kunci / PIC</h4>
                <span className="rounded-[4px] border border-[#ff4800]/40 bg-[#fff5f0] px-2 py-1 text-[9px] font-extrabold tracking-wide text-[#9b2c00]">[PERLU DIVERIFIKASI]</span>
              </div>
              <ul className="space-y-2">
                {targetRoles.map((role, index) => <li key={`${role}-${index}`} className="flex items-start gap-2 text-sm leading-5 text-[#1f1f1f]"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff4800]" />{role}</li>)}
              </ul>
            </section>
            <section className="rounded-[8px] border border-[#1f1f1f] bg-[#f8f5ee] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[#1f1f1f]">
                <Mail className="h-4 w-4 text-[#ff4800]" />
                <h4 className="text-xs font-bold uppercase tracking-wide">Estimasi Pola Email</h4>
                <span className="rounded-[4px] border border-[#ff4800]/40 bg-[#fff5f0] px-2 py-1 text-[9px] font-extrabold tracking-wide text-[#9b2c00]">[ESTIMASI AI]</span>
              </div>
              <p className="break-words rounded-[8px] border border-[#1f1f1f]/20 bg-[#fcfcfa] px-3 py-2.5 text-sm leading-5 text-[#1f1f1f]">{result.email_pattern}</p>
            </section>
            <section className="rounded-[8px] border border-[#1f1f1f] bg-[#f8f5ee] p-4 text-[#1f1f1f] sm:col-span-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Search className="h-4 w-4 text-[#ff4800]" /><h4 className="text-xs font-bold uppercase tracking-wide">Google Dorks</h4></div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void handleCopyDorks()} className="inline-flex min-h-10 items-center gap-2 rounded-[8px] border border-[#1f1f1f] bg-[#fcfcfa] px-3 text-xs font-bold text-[#1f1f1f] transition hover:bg-[#f2ede4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4800]">
                    {copiedDorks ? <Check className="h-4 w-4 text-[#155e3c]" /> : <Copy className="h-4 w-4" />}{copiedDorks ? 'Tersalin' : '1-Click Copy'}
                  </button>
                  <a href={buildGoogleSearchUrl(result.google_dorks)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-[8px] border border-[#1f1f1f] bg-[#ff4800] px-3 text-xs font-bold text-white transition hover:bg-[#e03f00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4800]">
                    <ExternalLink className="h-4 w-4" />Buka Pencarian di Google
                  </a>
                </div>
              </div>
              <p className="mb-2 text-[10px] leading-4 text-[#6b665c]">Template pencarian profil profesional publik; hasil tetap perlu diverifikasi.</p>
              <code className="block break-words rounded-[8px] border border-[#1f1f1f]/20 bg-[#fcfcfa] p-3 font-mono text-xs leading-5 text-[#1f1f1f]">{result.google_dorks}</code>
            </section>
          </div>
          <footer className="border-t border-[#1f1f1f] bg-[#f8f5ee] px-4 py-4 sm:px-6">
            <button type="button" onClick={() => onSaveToPipeline(query.trim())} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[8px] border border-[#1f1f1f] bg-[#ff4800] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#e03f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff4800]/30">
              <Plus className="h-4 w-4" />Tambah ke Pipeline Lead
            </button>
            <p className="mt-2 text-center text-[10px] text-[#6b665c]">Membuka form untuk melengkapi detail Lead sebelum disimpan.</p>
          </footer>
        </article>
      )}
    </div>
  );
};
