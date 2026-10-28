import React, { useEffect, useRef, useState } from 'react';
import { Check, MapPin, Sparkles, X } from 'lucide-react';
import { getFirebaseAuth } from '../firebase.ts';
import { formatMeetingSummary, summarizeMeetingNotesLocally } from '../meetingSummary.ts';
import type { MeetingSummary } from '../meetingSummary.ts';
import type { ActivityGpsLocation, ActivitySummarySource, Lead } from '../types/crm.ts';

interface ActivityLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  leads: Lead[];
  initialLead?: Lead | null;
  aiSummarizerEnabled?: boolean;
  onSaveActivity: (activityData: {
    lead_id: string;
    activity_type: string;
    notes: string;
    ai_summary?: string;
    ai_summary_source?: ActivitySummarySource;
    location_gps?: ActivityGpsLocation;
  }) => Promise<void>;
}

const EMPTY_SUMMARY: MeetingSummary = { summary: '', decisions: [], action_items: [] };

export const ActivityLoggerModal: React.FC<ActivityLoggerModalProps> = ({
  isOpen,
  onClose,
  leads,
  initialLead,
  aiSummarizerEnabled = false,
  onSaveActivity,
}) => {
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [activityType, setActivityType] = useState('Meeting Check-In');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [summarySource, setSummarySource] = useState<ActivitySummarySource | undefined>();
  const [summaryMessage, setSummaryMessage] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [location, setLocation] = useState<ActivityGpsLocation | undefined>();
  const [locationMessage, setLocationMessage] = useState('');
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const locationRequestId = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      setSelectedLeadId('');
      setActivityType('Meeting Check-In');
      setNotes('');
      setIsSubmitting(false);
      setAiConsent(false);
      setAiSummary('');
      setSummarySource(undefined);
      setSummaryMessage('');
      setIsSummarizing(false);
      setLocation(undefined);
      setLocationMessage('');
      setIsCapturingLocation(false);
      locationRequestId.current += 1;
      return;
    }
    setSelectedLeadId(initialLead?.id ?? '');
    setActivityType('Meeting Check-In');
    setNotes('');
    setAiConsent(false);
    setAiSummary('');
    setSummarySource(undefined);
    setSummaryMessage('');
    setLocation(undefined);
    setLocationMessage('');
    locationRequestId.current += 1;
  }, [isOpen, initialLead?.id]);

  if (!isOpen) return null;

  const close = () => {
    locationRequestId.current += 1;
    onClose();
  };

  const updateNotes = (value: string) => {
    setNotes(value);
    setAiConsent(false);
    setAiSummary('');
    setSummarySource(undefined);
    setSummaryMessage('');
  };

  const handleLocalSummary = () => {
    const extracted = summarizeMeetingNotesLocally(notes);
    if (!extracted) {
      setSummaryMessage('Tambahkan catatan terlebih dahulu.');
      return;
    }
    setAiSummary(formatMeetingSummary({ ...EMPTY_SUMMARY, summary: extracted }));
    setSummarySource('local');
    setSummaryMessage('Ringkasan lokal ekstraktif: hanya memilih teks yang sudah ada; tidak dikirim ke layanan AI.');
  };

  const handleAiSummary = async () => {
    if (!aiSummarizerEnabled || !aiConsent || !notes.trim() || isSummarizing) return;
    setIsSummarizing(true);
    setSummaryMessage('Mengirim catatan yang disetujui ke Gemini untuk diringkas…');
    setAiSummary('');
    setSummarySource(undefined);
    try {
      const currentUser = getFirebaseAuth().currentUser;
      if (!currentUser) throw new Error('Sesi owner tidak tersedia.');
      const idToken = await currentUser.getIdToken();
      const response = await fetch('/api/ai/summarize-notes', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ notes: notes.trim() }),
      });
      const payload = await response.json().catch(() => null) as { summary?: MeetingSummary; error?: string } | null;
      if (!response.ok || !payload?.summary) {
        throw new Error(payload?.error || 'Gemini tidak menyediakan ringkasan yang dapat diperiksa.');
      }
      const formatted = formatMeetingSummary(payload.summary);
      if (!formatted || formatted.length > 4_000) throw new Error('Ringkasan Gemini berada di luar batas aman.');
      setAiSummary(formatted);
      setSummarySource('gemini');
      setSummaryMessage('Ringkasan Gemini dibuat dari catatan yang Anda setujui. Periksa atau edit sebelum menyimpan.');
    } catch {
      const extracted = summarizeMeetingNotesLocally(notes);
      if (extracted) {
        setAiSummary(formatMeetingSummary({ ...EMPTY_SUMMARY, summary: extracted }));
        setSummarySource('local');
        setSummaryMessage('Gemini gagal atau tidak diizinkan; ringkasan lokal ekstraktif ditampilkan. Jika layanan sempat dipanggil, catatan mungkin telah dikirim ke Gemini.');
      } else {
        setSummaryMessage('Ringkasan AI tidak tersedia dan catatan belum cukup untuk fallback lokal.');
      }
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCaptureLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Browser ini tidak menyediakan geolokasi.');
      return;
    }
    const requestId = ++locationRequestId.current;
    setIsCapturingLocation(true);
    setLocationMessage('Meminta satu kali lokasi dari browser…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== locationRequestId.current) return;
        const captured = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_m: Math.round(position.coords.accuracy),
        };
        setLocation(captured);
        setLocationMessage(`Lokasi siap disimpan bersama aktivitas ini (akurasi ±${captured.accuracy_m} m).`);
        setIsCapturingLocation(false);
      },
      (error) => {
        if (requestId !== locationRequestId.current) return;
        const message = error.code === error.PERMISSION_DENIED
          ? 'Izin lokasi ditolak; tidak ada koordinat yang disimpan.'
          : error.code === error.TIMEOUT
            ? 'Permintaan lokasi timeout; coba lagi jika diperlukan.'
            : 'Lokasi tidak tersedia; tidak ada koordinat yang disimpan.';
        setLocation(undefined);
        setLocationMessage(message);
        setIsCapturingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedLeadId || !notes.trim() || isSubmitting || isSummarizing) return;
    setIsSubmitting(true);
    try {
      await onSaveActivity({
        lead_id: selectedLeadId,
        activity_type: activityType,
        notes: notes.trim(),
        ...(aiSummary.trim() && summarySource ? { ai_summary: aiSummary.trim(), ai_summary_source: summarySource } : {}),
        ...(location ? { location_gps: location } : {}),
      });
      close();
    } catch {
      // The app-level save handler reports the Firestore/outbox error.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f1f1f]/50 backdrop-blur-xs overflow-y-auto">
      <div className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[16px] w-full max-w-lg overflow-hidden my-8">
        <div className="px-5 py-4 border-b border-[#1f1f1f] flex items-center justify-between bg-[#f8f5ee]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[8px] bg-[#1f1f1f] text-[#ff4800]"><MapPin className="w-5 h-5" /></div>
            <div>
              <h3 className="font-bold text-[#1f1f1f] text-base font-serif-heading">Activity Logger</h3>
              <p className="text-xs text-[#6b665c]">GPS hanya sekali saat diminta; AI hanya setelah persetujuan.</p>
            </div>
          </div>
          <button type="button" onClick={close} disabled={isSubmitting} aria-label="Tutup" className="p-1.5 rounded-[8px] hover:bg-[#eae4d5] text-[#1f1f1f] transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-[#1f1f1f] font-semibold block">Select Account / Lead</label>
            <select value={selectedLeadId} onChange={(event) => setSelectedLeadId(event.target.value)} required className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2.5 text-xs text-[#1f1f1f] font-medium focus:outline-none focus:bg-[#fcfcfa]">
              <option value="" disabled>-- Choose Lead --</option>
              {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.company_name} ({lead.contact_person} - {lead.city})</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[#1f1f1f] font-semibold block">Activity Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {['Meeting Check-In', 'Phone Call', 'WhatsApp Message', 'Proposal Sent', 'Site Visit'].map((type) => (
                <button key={type} type="button" onClick={() => setActivityType(type)} className={`py-2 px-2.5 rounded-[8px] border text-center transition-all ${activityType === type ? 'bg-[#1f1f1f] border-[#1f1f1f] text-white font-bold' : 'bg-[#f8f5ee] border-[#1f1f1f] text-[#1f1f1f] hover:bg-[#eae4d5]'}`}>{type}</button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[#1f1f1f] font-semibold block">Field Notes</label>
            <textarea rows={4} maxLength={12_000} placeholder="Masukkan catatan aktivitas untuk record CRM." value={notes} onChange={(event) => updateNotes(event.target.value)} required className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] p-3 text-xs text-[#1f1f1f] placeholder-[#6b665c] focus:outline-none focus:bg-[#fcfcfa] resize-none" />
            <p className="text-[10px] text-[#6b665c]">Catatan asli tersimpan di CRM; Gemini tidak dipanggil otomatis.</p>
          </div>

          <section className="rounded-[12px] border border-[#1f1f1f]/35 bg-[#f8f5ee] p-3 space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-[#1f1f1f]"><MapPin className="w-3.5 h-3.5 text-[#ff4800]" />Lokasi check-in (opsional)</div>
            <p className="text-[10px] text-[#6b665c]">Koordinat hanya diambil setelah Anda menekan tombol; tidak ada pelacakan latar belakang. Jika disimpan, lokasi tersimpan pada aktivitas dan dapat dibuka di peta.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleCaptureLocation} disabled={isCapturingLocation || isSubmitting} className="rounded-[8px] border border-[#1f1f1f] bg-[#fcfcfa] px-3 py-2 font-semibold text-[#1f1f1f] disabled:opacity-50">{isCapturingLocation ? 'Meminta lokasi…' : location ? 'Ambil ulang lokasi' : 'Ambil GPS sekali'}</button>
              {location && <button type="button" onClick={() => { setLocation(undefined); setLocationMessage('Lokasi dihapus; aktivitas ini tidak menyimpan GPS.'); }} className="rounded-[8px] px-2 py-2 font-semibold text-[#9b2c2c]">Hapus lokasi</button>}
            </div>
            {locationMessage && <p role="status" className="text-[10px] text-[#6b665c]">{locationMessage}</p>}
            {location && <p className="font-mono text-[10px] text-[#1f1f1f]">{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</p>}
          </section>

          <section className="rounded-[12px] border border-[#1f1f1f]/35 bg-[#f8f5ee] p-3 space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-[#1f1f1f]"><Sparkles className="w-3.5 h-3.5 text-[#ff4800]" />Ringkasan rapat</div>
            <p className="text-[10px] text-[#6b665c]">Fallback lokal mengekstrak maksimal tiga kalimat tanpa mengirim data atau memakai kuota. Gemini berbagi batas lima permintaan harian dengan Lead Finder.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleLocalSummary} disabled={!notes.trim() || isSummarizing} className="rounded-[8px] border border-[#1f1f1f] bg-[#fcfcfa] px-3 py-2 font-semibold text-[#1f1f1f] disabled:opacity-50">Ringkas lokal</button>
              {aiSummarizerEnabled && <button type="button" onClick={() => void handleAiSummary()} disabled={!notes.trim() || !aiConsent || isSummarizing} className="rounded-[8px] border border-[#1f1f1f] bg-[#1f1f1f] px-3 py-2 font-semibold text-white disabled:opacity-50">{isSummarizing ? 'Memproses…' : 'Kirim ke Gemini'}</button>}
            </div>
            {aiSummarizerEnabled ? (
              <label className="flex items-start gap-2 text-[10px] text-[#1f1f1f]">
                <input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} disabled={isSummarizing} className="mt-0.5" />
                <span>Saya menyetujui pengiriman catatan saat ini ke Gemini untuk diringkas. Jangan sertakan informasi sensitif yang tidak diperlukan.</span>
              </label>
            ) : <p className="text-[10px] text-[#6b665c]">Gemini dinonaktifkan pada deployment ini; ringkasan lokal tetap tersedia.</p>}
            {summaryMessage && <p role="status" className="text-[10px] text-[#6b665c]">{summaryMessage}</p>}
            {aiSummary && <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-[#1f1f1f]">{summarySource === 'gemini' ? 'Hasil Gemini (dapat diedit)' : 'Hasil lokal (dapat diedit)'}</label>
              <textarea rows={4} maxLength={4_000} value={aiSummary} onChange={(event) => setAiSummary(event.target.value)} className="w-full rounded-[8px] border border-[#1f1f1f] bg-[#fcfcfa] p-2 text-[11px] text-[#1f1f1f]" />
              <button type="button" onClick={() => { setAiSummary(''); setSummarySource(undefined); }} className="text-[10px] font-semibold text-[#9b2c2c] underline">Jangan simpan ringkasan</button>
            </div>}
          </section>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1f1f1f]/10">
            <button type="button" onClick={close} disabled={isSubmitting} className="px-4 py-2 rounded-[8px] text-[#6b665c] hover:text-[#1f1f1f] font-semibold transition-colors">Cancel</button>
            <button type="submit" disabled={isSubmitting || isSummarizing || !selectedLeadId || !notes.trim()} className="bg-[#ff4800] hover:bg-[#e03f00] text-white font-bold px-5 py-2.5 rounded-[8px] border border-[#1f1f1f] flex items-center gap-1.5 transition-all disabled:opacity-50"><Check className="w-4 h-4 stroke-[2.5]" /><span>{isSubmitting ? 'Saving…' : 'Save Activity'}</span></button>
          </div>
        </form>
      </div>
    </div>
  );
};
