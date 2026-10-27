import { Lead, PipelineMetrics, FollowUpCategory, PipelineStage, STAGE_CONFIG } from '../types/crm.ts';

const INDONESIAN_TIME_ZONE = 'Asia/Jakarta';
const calendarDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: INDONESIAN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dateDisplayFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: INDONESIAN_TIME_ZONE,
});
const dateTimeDisplayFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: INDONESIAN_TIME_ZONE,
});

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
    if (stage !== 'Closing Lost') {
      totalPipelineValue += value;
    }

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
 * Normalizes a calendar date or timestamp to its Indonesian local calendar day.
 * Date-only values are kept as-is; instants are interpreted in Asia/Jakarta.
 */
export function toDateStringOnly(dateInput: string | Date | undefined): string | null {
  if (!dateInput) return null;

  if (typeof dateInput === 'string') {
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const month = Number(dateOnlyMatch[2]);
      const day = Number(dateOnlyMatch[3]);
      const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]
        ? dateInput
        : null;
    }
  }

  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (Number.isNaN(date.getTime())) return null;

    const parts = Object.fromEntries(
      calendarDateFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return null;
  }
}

/**
 * Categorizes leads into Overdue, Due Today, Upcoming, and No Date.
 */
export function filterFollowUps(leads: Lead[], referenceDateStr?: string): FollowUpCategory {
  const refDate = toDateStringOnly(referenceDateStr) ?? toDateStringOnly(new Date())!;

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
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(safeAmount);
}

/** Formats counts and other numeric values using Indonesian separators. */
export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('id-ID', options).format(safeValue);
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
    const localDate = toDateStringOnly(dateStr);
    if (!localDate) return dateStr;
    const displayDate = new Date(`${localDate}T12:00:00+07:00`);
    return dateDisplayFormatter.format(displayDate);
  } catch {
    return dateStr;
  }
}

/** Formats an absolute timestamp in Indonesian local time for activity history. */
export function formatDateTimeDisplay(dateTimeStr?: string): string {
  if (!dateTimeStr) return 'Recent';
  try {
    const date = new Date(dateTimeStr);
    if (Number.isNaN(date.getTime())) return dateTimeStr;
    return dateTimeDisplayFormatter.format(date);
  } catch {
    return dateTimeStr;
  }
}
