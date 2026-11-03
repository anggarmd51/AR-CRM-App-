import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ExternalLink,
  HardDrive,
  MapPin,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteLocalProspect,
  readLocalProspects,
  saveLocalProspect,
  searchLocalProspects,
  writeLocalProspects,
  type LocalProspectInput,
  type LocalProspectRecord,
} from '../utils/localProspectDirectory.ts';
import {
  buildLinkedInPeopleSearchUrl,
  researchProspectWithGemini,
  type ProspectResearchResult,
} from '../utils/prospectResearch.ts';

const EMPTY_FORM: LocalProspectInput = {
  companyName: '',
  industry: '',
  city: '',
  notes: '',
};

const inputClassName = 'w-full rounded-[8px] border border-[#1f1f1f]/35 bg-white px-3 py-2.5 text-sm text-[#1f1f1f] placeholder:text-[#8b8579] focus:border-[#ff4800] focus:outline-none focus:ring-2 focus:ring-[#ff4800]/20';
const LINKEDIN_JOB_TITLES = ['Owner', 'Founder', 'CEO', 'COO', 'CFO', 'CTO', 'Sales Director', 'Procurement Director'];

export const GlobalLeadsView: React.FC = () => {
  const [prospects, setProspects] = useState<LocalProspectRecord[]>(() => readLocalProspects());
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<LocalProspectInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiConsent, setGeminiConsent] = useState(false);
  const [researchResults, setResearchResults] = useState<Record<string, ProspectResearchResult>>({});
  const [researchErrors, setResearchErrors] = useState<Record<string, string>>({});
  const [researchingId, setResearchingId] = useState<string | null>(null);
  const [linkedinJobTitles, setLinkedinJobTitles] = useState<Record<string, string>>({});

  const visibleProspects = useMemo(
    () => searchLocalProspects(prospects, query),
    [prospects, query],
  );

  const persist = (next: LocalProspectRecord[]) => {
    setProspects(next);
    setStorageWarning(writeLocalProspects(next)
      ? null
      : 'Penyimpanan browser tidak tersedia. Perubahan ini hanya bertahan selama halaman masih terbuka.');
  };

  const startAdd = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setFormOpen(true);
  };

  const startEdit = (record: LocalProspectRecord) => {
    setEditingId(record.id);
    setForm({
      companyName: record.companyName,
      industry: record.industry,
      city: record.city,
      notes: record.notes,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      persist(saveLocalProspect(prospects, form, { id: editingId ?? undefined }));
      closeForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Catatan tidak dapat disimpan.');
    }
  };

  const handleDelete = (record: LocalProspectRecord) => {
    if (!window.confirm(`Hapus catatan lokal “${record.companyName}” dari browser ini?`)) return;
    persist(deleteLocalProspect(prospects, record.id));
    if (editingId === record.id) closeForm();
  };

  const handleResearch = async (record: LocalProspectRecord) => {
    if (!geminiApiKey.trim() || !geminiConsent || researchingId) return;
    setResearchingId(record.id);
    setResearchErrors((current) => ({ ...current, [record.id]: '' }));
    try {
      const result = await researchProspectWithGemini(geminiApiKey, record.companyName, record.industry);
      setResearchResults((current) => ({ ...current, [record.id]: result }));
    } catch (error) {
      setResearchErrors((current) => ({
        ...current,
        [record.id]: error instanceof Error ? error.message : 'Riset gagal. Periksa kuota/koneksi dan coba lagi.',
      }));
    } finally {
      setResearchingId(null);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      <header className="flex flex-col gap-3 border-b border-[#1f1f1f]/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-[6px] bg-[#1f1f1f] p-1 text-white">
              <Search className="h-4 w-4 text-[#ff4800]" />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-[#1f1f1f] font-serif-heading">
              Direktori Prospek Lokal
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#6b665c]">
            Mode demo berbasis sampel fiktif. Pencarian dan perubahan berjalan di browser ini saja.
          </p>
        </div>
        <button
          type="button"
          onClick={startAdd}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-[#1f1f1f] bg-[#ff4800] px-4 py-2 text-sm font-bold text-white hover:bg-[#e03f00]"
        >
          <Plus className="h-4 w-4" />
          Tambah catatan lokal
        </button>
      </header>

      <section role="note" aria-label="Batasan data direktori lokal" className="space-y-2 rounded-[12px] border border-[#9b2c2c]/35 bg-[#fff5f0] p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#9b2c2c]" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#1f1f1f]">Data demo, bukan daftar perusahaan nyata atau prospek terverifikasi</p>
            <p className="text-[11px] leading-4 text-[#6b665c]">
              Seluruh sampel bersifat fiktif. Catatan yang Anda tambahkan di sini juga hanya catatan lokal untuk latihan; fitur ini tidak menyatakan bahwa data tersebut nyata atau siap dipakai sebagai data prospek operasional.
            </p>
          </div>
        </div>
        <p className="flex items-start gap-2 text-[11px] leading-4 text-[#6b665c]">
          <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Disimpan hanya di penyimpanan browser ini, tidak disinkronkan ke Firebase atau CRM, dan dapat hilang jika penyimpanan browser dibersihkan.</span>
        </p>
        {storageWarning && <p role="status" className="text-[11px] font-semibold text-[#9b2c2c]">{storageWarning}</p>}
      </section>

      <section aria-label="Pengaturan riset Gemini" className="space-y-3 rounded-[12px] border border-[#1f1f1f]/20 bg-[#f8f5ee] p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#ff4800]" />
          <h3 className="text-sm font-bold text-[#1f1f1f]">Pengaturan riset PIC — Gemini</h3>
        </div>
        <p className="text-[11px] leading-4 text-[#6b665c]">
          Masukkan kunci Gemini API milik Anda sendiri. Kunci hanya berada di memori halaman ini (tidak disimpan); browser mengirim permintaan langsung ke Google, sehingga kunci dapat terlihat oleh pengguna/perangkat dan skrip pada origin ini. Gunakan kunci khusus yang dibatasi ke Gemini API.
        </p>
        <p className="text-[11px] leading-4 text-[#6b665c]">
          Saat menekan “Riset PIC”, hanya nama perusahaan dan industri yang dikirim. Tier gratis Gemini 2.5 Flash tercantum di harga Google saat ini, tetapi kuota/kelayakan dapat berubah; jika proyek Anda memakai tier berbayar, penggunaan dapat dikenai biaya. Tier gratis juga dapat memakai input untuk peningkatan produk. Aplikasi ini tidak dapat menjamin biaya Rp0.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="min-w-0 flex-1 space-y-1 text-xs font-semibold text-[#6b665c]" htmlFor="prospect-gemini-api-key">
            <span>Kunci Gemini API (tidak disimpan)</span>
            <input
              id="prospect-gemini-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={geminiApiKey}
              onChange={(event) => setGeminiApiKey(event.target.value)}
              placeholder="Tempel kunci Gemini API Anda"
              className={inputClassName}
            />
          </label>
          <button type="button" onClick={() => setGeminiApiKey('')} className="min-h-11 self-end rounded-[8px] border border-[#1f1f1f]/30 bg-white px-3 py-2 text-xs font-semibold text-[#1f1f1f] hover:border-[#ff4800]">
            Hapus kunci
          </button>
        </div>
        <label className="flex items-start gap-2 text-[11px] leading-4 text-[#1f1f1f]">
          <input type="checkbox" checked={geminiConsent} onChange={(event) => setGeminiConsent(event.target.checked)} className="mt-0.5" />
          <span>Saya setuju mengirim nama perusahaan dan industri ke Gemini. Saya tidak akan memasukkan data rahasia/pribadi dan memahami dugaan maupun pola email wajib diverifikasi; Google dapat memakai data pada tier gratis untuk peningkatan produk.</span>
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1f1f1f] underline">Kelola kunci di Google AI Studio</a>
          <a href="https://ai.google.dev/gemini-api/docs/api-key" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1f1f1f] underline">Panduan keamanan kunci Google</a>
          <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1f1f1f] underline">Harga dan tier Gemini</a>
        </div>
      </section>

      <section className="rounded-[12px] border border-[#1f1f1f]/15 bg-[#f8f5ee] p-3 sm:p-4">
        <label htmlFor="local-prospect-search" className="mb-1.5 block text-xs font-bold text-[#1f1f1f]">Cari dalam direktori lokal</label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b665c]" />
          <input
            id="local-prospect-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari nama contoh, kategori, kota, atau catatan"
            className={`${inputClassName} pl-9`}
          />
        </div>
        <p className="mt-2 text-[11px] text-[#6b665c]" aria-live="polite">
          {visibleProspects.length} dari {prospects.length} catatan lokal
        </p>
      </section>

      {formOpen && (
        <section className="rounded-[12px] border border-[#1f1f1f] bg-[#f8f5ee] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[#1f1f1f]">{editingId ? 'Edit catatan lokal' : 'Tambah catatan lokal'}</h3>
            <button type="button" onClick={closeForm} aria-label="Tutup formulir" className="grid h-9 w-9 place-items-center rounded-[8px] border border-[#1f1f1f]/20 bg-white text-[#1f1f1f] hover:border-[#ff4800]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleSave} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold text-[#6b665c]">
              <span>Nama contoh (fiktif) <span aria-hidden="true">*</span></span>
              <input required maxLength={120} value={form.companyName} onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))} placeholder="Contoh: Perusahaan Fiktif — Mentari" className={inputClassName} />
            </label>
            <label className="space-y-1 text-xs font-semibold text-[#6b665c]">
              <span>Kategori simulasi <span aria-hidden="true">*</span></span>
              <input required maxLength={80} value={form.industry} onChange={(event) => setForm((current) => ({ ...current, industry: event.target.value }))} placeholder="Contoh: Simulasi ritel" className={inputClassName} />
            </label>
            <label className="space-y-1 text-xs font-semibold text-[#6b665c]">
              <span>Kota contoh <span aria-hidden="true">*</span></span>
              <input required maxLength={80} value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} placeholder="Contoh: Semarang" className={inputClassName} />
            </label>
            <label className="space-y-1 text-xs font-semibold text-[#6b665c] sm:col-span-2">
              <span>Catatan simulasi</span>
              <textarea maxLength={300} rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Opsional; jangan masukkan data CRM atau informasi pribadi." className={`${inputClassName} resize-y`} />
            </label>
            <p className="text-[11px] leading-4 text-[#6b665c] sm:col-span-2">
              Hindari memasukkan data orang, kontak, informasi rahasia, atau data prospek nyata. Status setiap catatan tetap <strong>Perlu Verifikasi Manual</strong>.
            </p>
            {formError && <p role="alert" className="text-xs font-semibold text-[#9b2c2c] sm:col-span-2">{formError}</p>}
            <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeForm} className="min-h-11 rounded-[8px] border border-[#1f1f1f]/30 bg-white px-4 py-2 text-sm font-semibold text-[#1f1f1f] hover:border-[#1f1f1f]">Batal</button>
              <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-[#1f1f1f] bg-[#1f1f1f] px-4 py-2 text-sm font-bold text-white hover:bg-[#393939]">
                <Save className="h-4 w-4" />
                Simpan di browser ini
              </button>
            </div>
          </form>
        </section>
      )}

      {visibleProspects.length > 0 ? (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {visibleProspects.map((record) => (
            <article key={record.id} className="flex min-w-0 flex-col justify-between rounded-[12px] border border-[#1f1f1f]/25 bg-[#fcfcfa] p-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-[#1f1f1f]/20 bg-[#f8f5ee]">
                      <Building2 className="h-4 w-4 text-[#6b665c]" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-bold leading-5 text-[#1f1f1f] font-serif-heading">{record.companyName}</h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6b665c]">
                        <span>{record.industry}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{record.city}</span>
                      </p>
                    </div>
                  </div>
                  <span className="max-w-28 shrink-0 rounded-[4px] border border-[#1f1f1f]/20 bg-[#f8f5ee] px-2 py-1 text-center text-[10px] font-semibold leading-3 text-[#6b665c]">
                    {record.origin === 'sample' ? 'Sampel fiktif' : 'Catatan lokal'}
                  </span>
                </div>
                {record.notes && <p className="break-words border-l-2 border-[#ff4800] pl-2 text-[11px] leading-4 text-[#6b665c]">{record.notes}</p>}
                <p className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#9b2c2c]/25 bg-[#fff5f0] px-2 py-1 text-[10px] font-bold text-[#9b2c2c]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Perlu Verifikasi Manual
                </p>
                {researchResults[record.id] && (
                  <section aria-label={`Hasil dugaan PIC ${record.companyName}`} className="space-y-2 rounded-[8px] border border-[#ff4800]/30 bg-[#fffaf5] p-3">
                    <h4 className="text-xs font-bold text-[#1f1f1f]">Dugaan AI — bukan data terverifikasi</h4>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-[#6b665c]">Jabatan yang mungkin relevan</p>
                      {researchResults[record.id].roles.length ? researchResults[record.id].roles.map((role) => (
                        <p key={role.id} className="text-[11px] leading-4 text-[#1f1f1f]">
                          <strong>{role.title}</strong> (confidence {role.confidence})
                        </p>
                      )) : <p className="text-[11px] text-[#6b665c]">Belum ada jabatan yang cukup masuk akal untuk diperkirakan.</p>}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-[#6b665c]">Pola email generik untuk diuji — bukan alamat publik</p>
                      {researchResults[record.id].emailPatterns.length ? researchResults[record.id].emailPatterns.map((pattern) => (
                        <p key={pattern.id} className="break-all text-[11px] leading-4 text-[#1f1f1f]">
                          <strong>{pattern.pattern}</strong> (confidence {pattern.confidence})
                        </p>
                      )) : <p className="text-[11px] text-[#6b665c]">Tidak ada pola yang dapat diperkirakan.</p>}
                    </div>
                    <p className="text-[10px] leading-4 text-[#9b2c2c]">Tidak ada pencarian web atau verifikasi sumber. Jangan gunakan hasil ini sebagai identitas PIC atau alamat email aktual.</p>
                  </section>
                )}
                {researchErrors[record.id] && <p role="alert" className="text-[11px] font-semibold text-[#9b2c2c]">{researchErrors[record.id]}</p>}
              </div>
              <div className="mt-4 space-y-2 border-t border-[#1f1f1f]/10 pt-3">
                <label className="block space-y-1 text-[10px] font-semibold text-[#6b665c]">
                  <span>Jabatan untuk pencarian LinkedIn</span>
                  <select value={linkedinJobTitles[record.id] ?? 'Owner'} onChange={(event) => setLinkedinJobTitles((current) => ({ ...current, [record.id]: event.target.value }))} className={`${inputClassName} py-2 text-xs`}>
                    {LINKEDIN_JOB_TITLES.map((title) => <option key={title} value={title}>{title}</option>)}
                  </select>
                </label>
                <div className="flex flex-col gap-2 min-[380px]:flex-row">
                  <a href={buildLinkedInPeopleSearchUrl(record.companyName, linkedinJobTitles[record.id] ?? 'Owner')} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[8px] border border-[#1f1f1f]/25 bg-white px-3 py-2 text-xs font-semibold text-[#1f1f1f] hover:border-[#ff4800]">
                    <ExternalLink className="h-3.5 w-3.5" /> Riset di LinkedIn
                  </a>
                  <button type="button" onClick={() => void handleResearch(record)} disabled={!geminiApiKey.trim() || !geminiConsent || researchingId !== null} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[8px] border border-[#1f1f1f] bg-[#1f1f1f] px-3 py-2 text-xs font-semibold text-white hover:bg-[#393939] disabled:cursor-not-allowed disabled:opacity-40">
                    <Sparkles className="h-3.5 w-3.5 text-[#ff4800]" /> {researchingId === record.id ? 'Meriset…' : 'Riset PIC'}
                  </button>
                  <button type="button" onClick={() => startEdit(record)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[8px] border border-[#1f1f1f]/25 bg-white px-3 py-2 text-xs font-semibold text-[#1f1f1f] hover:border-[#ff4800]">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(record)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[8px] border border-[#9b2c2c]/30 bg-white px-3 py-2 text-xs font-semibold text-[#9b2c2c] hover:border-[#9b2c2c]">
                  <Trash2 className="h-3.5 w-3.5" /> Hapus
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[12px] border border-[#1f1f1f]/20 bg-[#f8f5ee] px-5 py-10 text-center">
          <Search className="mx-auto h-6 w-6 text-[#6b665c]" />
          <h3 className="mt-3 text-sm font-bold text-[#1f1f1f]">Tidak ada catatan yang cocok</h3>
          <p className="mt-1 text-xs text-[#6b665c]">Coba kata pencarian lain atau tambahkan catatan simulasi lokal.</p>
        </div>
      )}
    </div>
  );
};
