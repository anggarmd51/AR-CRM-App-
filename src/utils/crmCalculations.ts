import { Lead, PipelineMetrics, FollowUpCategory, PipelineStage, STAGE_CONFIG } from '../types/crm.ts';

/**
 * Calculates comprehensive CRM financial & pipeline metrics.
 */
export function calculatePipelineMetrics(leads: Lead[]): PipelineMetrics {
  const stageCounts: Record<PipelineStage, number> = {
    Prospect: 0,
    Meeting: 0,
    Negotiation: 0,
    'Closing Won': 0,
    'Closing Lost': 0,
  };

  let totalPipelineValue = 0;
  let wonValue = 0;
  let activeValue = 0;
  let weightedPipelineValue = 0;

  for (const lead of leads) {
    const stage = lead.pipeline_stage || 'Prospect';
    if (stage in stageCounts) {
      stageCounts[stage]++;
    }

    const value = Number(lead.deal_value) || 0;
    totalPipelineValue += value;

    if (stage === 'Closing Won') {
      wonValue += value;
    } else if (stage !== 'Closing Lost') {
      activeValue += value;
      const prob = STAGE_CONFIG[stage]?.probability ?? 0.3;
      weightedPipelineValue += value * prob;
    }
  }

  const closedCount = stageCounts['Closing Won'] + stageCounts['Closing Lost'];
  const winRatePercentage = closedCount > 0 ? (stageCounts['Closing Won'] / closedCount) * 100 : 0;

  return {
    totalPipelineValue,
    wonValue,
    activeValue,
    weightedPipelineValue: Math.round(weightedPipelineValue),
    stageCounts,
    totalLeads: leads.length,
    winRatePercentage: Math.round(winRatePercentage * 10) / 10,
  };
}

/**
 * Normalizes date to 'YYYY-MM-DD' for robust calendar comparisons.
 */
export function toDateStringOnly(dateInput: string | Date | undefined): string | null {
  if (!dateInput) return null;
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/**
 * Categorizes leads into Overdue, Due Today, Upcoming, and No Date.
 */
export function filterFollowUps(leads: Lead[], referenceDateStr?: string): FollowUpCategory {
  const refDate = referenceDateStr
    ? new Date(referenceDateStr).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const overdue: Lead[] = [];
  const dueToday: Lead[] = [];
  const upcoming: Lead[] = [];
  const noDate: Lead[] = [];

  for (const lead of leads) {
    // Only check active deals (not won or lost)
    if (lead.pipeline_stage === 'Closing Won' || lead.pipeline_stage === 'Closing Lost') {
      continue;
    }

    const dateOnly = toDateStringOnly(lead.next_followup_date);
    if (!dateOnly) {
      noDate.push(lead);
    } else if (dateOnly < refDate) {
      overdue.push(lead);
    } else if (dateOnly === refDate) {
      dueToday.push(lead);
    } else {
      upcoming.push(lead);
    }
  }

  // Sort by date ascending
  overdue.sort((a, b) => (a.next_followup_date || '').localeCompare(b.next_followup_date || ''));
  dueToday.sort((a, b) => (a.next_followup_date || '').localeCompare(b.next_followup_date || ''));
  upcoming.sort((a, b) => (a.next_followup_date || '').localeCompare(b.next_followup_date || ''));

  return { overdue, dueToday, upcoming, noDate };
}

/**
 * Formats monetary amounts with neat separators.
 */
export function formatCurrency(amount: number, currency: string = 'IDR'): string {
  if (isNaN(amount)) return '0';
  if (currency === 'IDR') {
    // Format compact or full
    if (amount >= 1_000_000_000) {
      return `Rp ${(amount / 1_000_000_000).toFixed(1)}B`;
    }
    if (amount >= 1_000_000) {
      return `Rp ${(amount / 1_000_000).toFixed(1)}M`;
    }
    return `Rp ${new Intl.NumberFormat('id-ID').format(amount)}`;
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

/**
 * Cleans phone number to standard international dial format without symbols.
 */
export function cleanPhoneNumber(phone: string | number | undefined): string {
  if (!phone) return '';
  let str = String(phone).replace(/[^\d+]/g, '');
  if (str.startsWith('+')) {
    str = str.slice(1);
  } else if (str.startsWith('0')) {
    // Default Indonesian national format to international +62
    str = '62' + str.slice(1);
  }
  return str;
}

export interface WhatsAppTemplate {
  id: string;
  title: string;
  message: (lead: Partial<Lead>) => string;
}

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'intro',
    title: 'Intro & Connect',
    message: (l) =>
      `Hi ${l.contact_person || 'there'}, I hope you're having a productive week. Reaching out from our commercial team regarding ${l.company_name || 'your business'}. Would you be open to a quick 10-minute catchup this week?`,
  },
  {
    id: 'meeting_confirm',
    title: 'Meeting Confirmation',
    message: (l) =>
      `Hi ${l.contact_person || 'there'}, confirming our upcoming meeting for ${l.company_name || 'our discussion'}. Looking forward to connecting! Please let me know if you need to adjust the timing.`,
  },
  {
    id: 'proposal_followup',
    title: 'Proposal Follow-up',
    message: (l) =>
      `Hi ${l.contact_person || 'there'}, following up on the commercial proposal we shared for ${l.company_name || 'your project'}. Have you had a chance to review with your team? Happy to address any questions.`,
  },
  {
    id: 'checkin',
    title: 'Quick Check-in',
    message: (l) =>
      `Hi ${l.contact_person || 'there'}, just checking in to see how everything is progressing at ${l.company_name || 'your company'}. Let me know if there's anything our team can support you with!`,
  },
];

/**
 * Generates an instant WhatsApp click-to-chat URL with pre-filled message.
 */
export function generateWhatsAppUrl(
  phone: string | number,
  templateId: string,
  lead: Partial<Lead>
): string {
  const cleaned = cleanPhoneNumber(phone);
  const template = WHATSAPP_TEMPLATES.find((t) => t.id === templateId) || WHATSAPP_TEMPLATES[0];
  const text = template.message(lead);
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
}

/**
 * Formats a date string for user-friendly UI display.
 */
export function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return 'No date set';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
