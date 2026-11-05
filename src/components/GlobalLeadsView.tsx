import React, { useMemo, useState } from 'react';
import { Check, Copy, Linkedin, Mail, Plus, Search, Sparkles, UsersRound } from 'lucide-react';
import { getFirebaseAuth } from '../firebase.ts';
import {
  MAX_PROSPECT_QUERY_LENGTH,
  buildLinkedInPeopleSearchDeepLink,
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
  const linkedInDeepLink = searchQuery.length > 0 && searchQuery.length <= MAX_PROSPECT_QUERY_LENGTH
    ? buildLinkedInPeopleSearchDeepLink(searchQuery)
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
      <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-6 text-white shadow-sm sm:px-8 sm:py-8">
        <div aria-hidden="true" className="absolute -right-12 -top-16 h-52 w-52 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-200">
            <Sparkles className="h-3.5 w-3.5" /> B2B Prospecting Workspace
          </div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Leads Finder</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Temukan pengambil keputusan, petakan profil perusahaan, lalu lanjutkan koneksi dari satu tempat.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-200">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Sparkles className="h-3.5 w-3.5 text-orange-300" /> AI Database & Profiling</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Linkedin className="h-3.5 w-3.5 text-sky-300" /> LinkedIn Deep-Link</span>
          </div>
        </div>
      </header>

      <section aria-label="Pencarian database dan profiling AI" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-600">AI Prospect Search</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">Siapa yang ingin Anda temukan?</h3>
          </div>
          <label htmlFor="prospect-search" className="sr-only">Cari perusahaan, industri, atau jabatan</label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              id="prospect-search"
              type="search"
              maxLength={MAX_PROSPECT_QUERY_LENGTH}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setError(null); setResult(null); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void handleResearch(); } }}
              placeholder="Perusahaan, industri, atau jabatan…"
              className="min-h-14 w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-12 pr-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100"
            />
          </div>

          <div className="mt-4">
            <p className="mb-2 text-center text-[11px] font-semibold text-slate-500">Quick filters <span className="font-normal">· pilih satu atau beberapa</span></p>
            <div className="flex flex-wrap justify-center gap-2" aria-label="Filter jabatan cepat">
              {QUICK_FILTERS.map((filter) => {
                const isSelected = selectedFilters.includes(filter);
                return (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleFilter(filter)}
                    className={`min-h-10 rounded-full border px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${isSelected ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:bg-orange-50 hover:text-slate-900'}`}
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
              className="group flex min-h-14 items-center justify-center gap-3 rounded-xl border border-orange-600 bg-orange-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/15"><Sparkles className="h-5 w-5" /></span>
              <span className="text-left">{isResearching ? 'Mencari kontak…' : 'Cari Kontak (AI & Dorks)'}<span className="mt-0.5 block text-[10px] font-medium text-orange-100">Profil, jabatan, dan pola email</span></span>
            </button>
            <a
              href={linkedInDeepLink ?? undefined}
              aria-disabled={!linkedInDeepLink}
              onClick={(event) => {
                if (!linkedInDeepLink) event.preventDefault();
                setError(null);
              }}
              className="flex min-h-14 items-center justify-center gap-3 rounded-xl border border-[#0a66c2] bg-[#0a66c2] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#004182] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/15"><Linkedin className="h-5 w-5" /></span>
              <span className="text-left">Buka Aplikasi LinkedIn<span className="mt-0.5 block text-[10px] font-medium text-sky-100">Coba cari dengan kata kunci di atas</span></span>
            </a>
          </div>
          <p className="mt-3 text-center text-[10px] leading-4 text-slate-500">AI memberi saran awal; verifikasi profil dan kontak sebelum outreach. Deep-link LinkedIn bergantung pada dukungan aplikasi di perangkat.</p>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}
      {isResearching && <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-900"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-orange-500" />Sedang menyusun profil prospek…</div>}

      {result && (
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:px-6">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700"><Sparkles className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">AI prospect profile</p>
              <h3 className="mt-1 break-words text-base font-bold text-slate-900 sm:text-lg">{searchQuery}</h3>
              <p className="mt-1 text-xs text-slate-500">Saran AI — verifikasi sebelum digunakan.</p>
            </div>
          </header>
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
            <section className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-slate-700">
                <UsersRound className="h-4 w-4 text-orange-600" />
                <h4 className="text-xs font-bold uppercase tracking-wide">Jabatan Kunci / PIC</h4>
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[9px] font-extrabold tracking-wide text-amber-900">[PERLU DIVERIFIKASI]</span>
              </div>
              <ul className="space-y-2">
                {targetRoles.map((role, index) => <li key={`${role}-${index}`} className="flex items-start gap-2 text-sm leading-5 text-slate-700"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />{role}</li>)}
              </ul>
            </section>
            <section className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-slate-700">
                <Mail className="h-4 w-4 text-orange-600" />
                <h4 className="text-xs font-bold uppercase tracking-wide">Estimasi Pola Email</h4>
                <span className="rounded-full border border-orange-300 bg-orange-50 px-2 py-1 text-[9px] font-extrabold tracking-wide text-orange-900">[ESTIMASI AI]</span>
              </div>
              <p className="break-words rounded-lg bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-700">{result.email_pattern}</p>
            </section>
            <section className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-white sm:col-span-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Search className="h-4 w-4 text-orange-300" /><h4 className="text-xs font-bold uppercase tracking-wide">Google Dorks</h4></div>
                <button type="button" onClick={() => void handleCopyDorks()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
                  {copiedDorks ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}{copiedDorks ? 'Tersalin' : '1-Click Copy'}
                </button>
              </div>
              <code className="block break-words rounded-lg bg-black/30 p-3 font-mono text-xs leading-5 text-slate-200">{result.google_dorks}</code>
            </section>
          </div>
          <footer className="border-t border-slate-100 bg-slate-50 px-4 py-4 sm:px-6">
            <button type="button" onClick={() => onSaveToPipeline(query.trim())} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300">
              <Plus className="h-4 w-4" />Tambah ke Pipeline Lead
            </button>
            <p className="mt-2 text-center text-[10px] text-slate-500">Membuka form untuk melengkapi detail Lead sebelum disimpan.</p>
          </footer>
        </article>
      )}
    </div>
  );
};
