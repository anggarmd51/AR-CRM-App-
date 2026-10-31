import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  HardDrive,
  MapPin,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
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

const EMPTY_FORM: LocalProspectInput = {
  companyName: '',
  industry: '',
  city: '',
  notes: '',
};

const inputClassName = 'w-full rounded-[8px] border border-[#1f1f1f]/35 bg-white px-3 py-2.5 text-sm text-[#1f1f1f] placeholder:text-[#8b8579] focus:border-[#ff4800] focus:outline-none focus:ring-2 focus:ring-[#ff4800]/20';

export const GlobalLeadsView: React.FC = () => {
  const [prospects, setProspects] = useState<LocalProspectRecord[]>(() => readLocalProspects());
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<LocalProspectInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

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
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t border-[#1f1f1f]/10 pt-3 min-[380px]:flex-row min-[380px]:justify-end">
                <button type="button" onClick={() => startEdit(record)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[8px] border border-[#1f1f1f]/25 bg-white px-3 py-2 text-xs font-semibold text-[#1f1f1f] hover:border-[#ff4800]">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button type="button" onClick={() => handleDelete(record)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[8px] border border-[#9b2c2c]/30 bg-white px-3 py-2 text-xs font-semibold text-[#9b2c2c] hover:border-[#9b2c2c]">
                  <Trash2 className="h-3.5 w-3.5" /> Hapus
                </button>
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
