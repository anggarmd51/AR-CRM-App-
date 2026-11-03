import React, { useState } from 'react';
import { ExternalLink, HardDrive, Search, Sparkles, ArrowDownToLine } from 'lucide-react';
import { getFirebaseAuth } from '../firebase.ts';
import { readExistingLocalProspectBackup } from '../utils/localProspectDirectory.ts';
import {
  buildLinkedInPeopleSearchUrl,
  parseProspectResearchResponse,
  validateProspectQuery,
  type ProspectResearchResult,
} from '../utils/prospectResearch.ts';

interface GlobalLeadsViewProps {
  onSaveToPipeline: (companyNameDraft: string) => void;
}

const inputClassName = 'w-full rounded-[8px] border border-[#1f1f1f]/35 bg-white px-3 py-3 text-sm text-[#1f1f1f] placeholder:text-[#8b8579] focus:border-[#ff4800] focus:outline-none focus:ring-2 focus:ring-[#ff4800]/20';

export const GlobalLeadsView: React.FC<GlobalLeadsViewProps> = ({ onSaveToPipeline }) => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ProspectResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const [hasLegacyBackup, setHasLegacyBackup] = useState(() => readExistingLocalProspectBackup() !== null);
  const linkedInUrl = query.trim() ? buildLinkedInPeopleSearchUrl(query) : undefined;

  const handleResearch = async () => {
    if (isResearching) return;
    let searchQuery: string;
    try {
      searchQuery = validateProspectQuery(query);
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
        body: JSON.stringify({ query: searchQuery }),
      });
      if (!response.ok) {
        if (response.status === 503) throw new Error('Riset AI belum diaktifkan pada environment ini.');
        if (response.status === 429) throw new Error('Batas riset harian tercapai. Coba lagi besok.');
        if (response.status === 401 || response.status === 403) throw new Error('Sesi owner tidak dapat diverifikasi. Masuk kembali lalu coba lagi.');
        throw new Error('Riset gagal sementara. Coba lagi nanti.');
      }
      const payload: unknown = await response.json();
      setResult(parseProspectResearchResponse(payload));
    } catch (researchError) {
      setError(researchError instanceof Error ? researchError.message : 'Riset gagal sementara. Coba lagi nanti.');
    } finally {
      setIsResearching(false);
    }
  };

  const handleDownloadLegacyBackup = () => {
    const raw = readExistingLocalProspectBackup();
    if (raw === null) {
      setHasLegacyBackup(false);
      return;
    }
    const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ar-crm-catatan-prospek-lokal-backup.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 pb-24">
      <header className="border-b border-[#1f1f1f]/10 pb-4">
        <div className="flex items-center gap-2">
          <span className="rounded-[6px] bg-[#1f1f1f] p-1 text-white">
            <Search className="h-4 w-4 text-[#ff4800]" />
          </span>
          <h2 className="text-xl font-bold tracking-tight text-[#1f1f1f] font-serif-heading">Direktori Prospek</h2>
        </div>
        <p className="mt-1 text-xs text-[#6b665c]">Cari perusahaan, industri, atau jabatan dalam satu langkah.</p>
      </header>

      <section aria-label="Pencarian prospek" className="space-y-3 rounded-[12px] border border-[#1f1f1f]/15 bg-[#f8f5ee] p-3.5 sm:p-4">
        <label htmlFor="prospect-search" className="block text-xs font-bold text-[#1f1f1f]">Kata pencarian</label>
        <input
          id="prospect-search"
          type="search"
          maxLength={240}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setError(null); setResult(null); }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void handleResearch(); } }}
          placeholder="Nama perusahaan, industri, atau jabatan — mis. PT Sukses Makmur, Manufaktur, IT Manager"
          className={inputClassName}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleResearch()}
            disabled={!query.trim() || isResearching}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[8px] border border-[#1f1f1f] bg-[#1f1f1f] px-2.5 py-2 text-xs font-bold text-white hover:bg-[#393939] disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-[#ff4800]" />
            <span>{isResearching ? 'Meriset…' : 'Riset Profil via AI'}</span>
          </button>
          <a
            href={linkedInUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!linkedInUrl}
            onClick={(event) => { if (!linkedInUrl) event.preventDefault(); }}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[8px] border border-[#1f1f1f]/35 bg-white px-2.5 py-2 text-center text-xs font-bold text-[#1f1f1f] hover:border-[#ff4800] aria-disabled:cursor-not-allowed aria-disabled:opacity-45 sm:text-sm"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span>Cari di LinkedIn</span>
          </a>
        </div>
        <p className="text-[10px] leading-4 text-[#6b665c]">Riset AI mengirim kata pencarian ke provider LLM eksternal. Jangan masukkan data pribadi atau rahasia.</p>
      </section>

      {error && <p role="alert" className="rounded-[8px] border border-[#9b2c2c]/25 bg-[#fff5f0] px-3 py-2.5 text-xs font-semibold text-[#9b2c2c]">{error}</p>}
      {isResearching && <p role="status" aria-live="polite" className="text-xs text-[#6b665c]">Menghubungi layanan riset yang tersedia…</p>}

      {result && (
        <article className="space-y-4 rounded-[12px] border border-[#1f1f1f]/20 bg-[#fcfcfa] p-4">
          <header className="flex items-start gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-[#1f1f1f]/20 bg-[#f8f5ee]">
              <Sparkles className="h-4 w-4 text-[#ff4800]" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-[#1f1f1f]">Profil prospek: {query.trim()}</h3>
              <p className="mt-1 text-[10px] text-[#9b2c2c]">Saran AI — belum diverifikasi; bukan fakta kontak.</p>
            </div>
          </header>
          <section className="space-y-1">
            <h4 className="text-[11px] font-bold text-[#6b665c]">Rekomendasi peran PIC</h4>
            <p className="break-words text-xs leading-5 text-[#1f1f1f]">{result.target_roles}</p>
          </section>
          <section className="space-y-1">
            <h4 className="text-[11px] font-bold text-[#6b665c]">Pola email generik</h4>
            <p className="break-words text-xs leading-5 text-[#1f1f1f]">{result.email_pattern}</p>
          </section>
          <section className="space-y-1">
            <h4 className="text-[11px] font-bold text-[#6b665c]">Kueri Google Dorks</h4>
            <p className="break-words rounded-[6px] bg-[#f8f5ee] p-2 font-mono text-[11px] leading-5 text-[#1f1f1f]">{result.google_dorks}</p>
          </section>
          <div className="space-y-2 border-t border-[#1f1f1f]/10 pt-3">
            <p className="text-[10px] leading-4 text-[#6b665c]">Tombol simpan membuka formulir Lead untuk ditinjau. Saran AI tidak disalin ke CRM; Firestore saat ini hanya menerima field Lead yang sudah diizinkan.</p>
            <button
              type="button"
              onClick={() => onSaveToPipeline(query.trim())}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-[#1f1f1f] bg-[#ff4800] px-4 py-2 text-sm font-bold text-white hover:bg-[#e03f00]"
            >
              <HardDrive className="h-4 w-4" /> Simpan ke Pipeline
            </button>
          </div>
        </article>
      )}

      {hasLegacyBackup && (
        <section className="flex flex-col gap-2 rounded-[10px] border border-[#1f1f1f]/10 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] leading-4 text-[#6b665c]">Catatan lokal lama tetap berada di browser ini; tampilan baru tidak mengubah atau menghapusnya.</p>
          <button type="button" onClick={handleDownloadLegacyBackup} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[7px] border border-[#1f1f1f]/25 px-3 py-1.5 text-[10px] font-semibold text-[#1f1f1f] hover:border-[#ff4800]">
            <ArrowDownToLine className="h-3.5 w-3.5" /> Unduh salinan lokal lama
          </button>
        </section>
      )}
    </div>
  );
};
