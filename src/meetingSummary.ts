export interface MeetingSummary {
  summary: string;
  decisions: string[];
  action_items: string[];
}

export type MeetingSummarySource = 'gemini' | 'local';

/** Deterministic local-only extractive fallback; it selects existing note fragments and invents no facts. */
export function summarizeMeetingNotesLocally(notes: string): string {
  const normalized = notes.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const fragments = normalized
    .split(/(?<=[.!?])\s+/)
    .map((fragment) => fragment.trim())
    .filter(Boolean);
  return fragments.slice(0, 3).join(' ').slice(0, 3_900);
}

export function formatMeetingSummary(summary: MeetingSummary): string {
  const sections = [`Ringkasan: ${summary.summary}`];
  if (summary.decisions.length) sections.push(`Keputusan: ${summary.decisions.join('; ')}`);
  if (summary.action_items.length) sections.push(`Tindak lanjut: ${summary.action_items.join('; ')}`);
  return sections.join('\n');
}
