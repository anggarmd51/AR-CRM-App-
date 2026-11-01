export interface CalendarEventParams {
  id?: string;
  title: string;
  description?: string;
  location?: string;
  startDate: string | Date;
  durationMinutes?: number;
  companyName?: string;
}

interface ParsedCalendarStart {
  date: Date;
  allDay: boolean;
}

function parseCalendarStart(input: string | Date): ParsedCalendarStart {
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) throw new Error('Tanggal kalender tidak valid.');
    return { date: input, allDay: false };
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error('Tanggal kalender tidak valid.');
    }
    return { date, allDay: true };
  }
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) throw new Error('Tanggal kalender tidak valid.');
  return { date, allDay: false };
}

export function isValidCalendarDateInput(value: string): boolean {
  try {
    parseCalendarStart(value);
    return true;
  } catch {
    return false;
  }
}

/** Formats UTC calendar dates as YYYYMMDD or YYYYMMDDTHHmmssZ. */
export function formatCalendarDate(dateInput: string | Date, isAllDay = false): string {
  const date = parseCalendarStart(dateInput).date;
  const pad = (number: number) => String(number).padStart(2, '0');
  const datePart = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  if (isAllDay) return datePart;
  return `${datePart}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const physicalLines: string[] = [];
  let current = '';
  for (const character of line) {
    if (encoder.encode(current + character).length > 75) {
      physicalLines.push(current);
      current = ` ${character}`;
    } else {
      current += character;
    }
  }
  physicalLines.push(current);
  return physicalLines.join('\r\n');
}

function safeUidPart(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160);
  return safe || 'follow-up';
}

export function generateIcsContent(params: CalendarEventParams): string {
  const parsedStart = parseCalendarStart(params.startDate);
  const durationMinutes = params.durationMinutes ?? 60;
  if (!parsedStart.allDay && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440)) {
    throw new Error('Durasi kalender harus antara 1 menit dan 24 jam.');
  }
  const start = parsedStart.date;
  const end = parsedStart.allDay
    ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1))
    : new Date(start.getTime() + durationMinutes * 60_000);
  const dtStamp = formatCalendarDate(new Date());
  const dateValueType = parsedStart.allDay ? ';VALUE=DATE' : '';
  const dtStart = formatCalendarDate(start, parsedStart.allDay);
  const dtEnd = formatCalendarDate(end, parsedStart.allDay);
  const uidSource = params.id?.trim() || `${dtStart}-${params.title}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AR CRM//Follow-up Reminder//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${safeUidPart(uidSource)}@arcrm.app`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART${dateValueType}:${dtStart}`,
    `DTEND${dateValueType}:${dtEnd}`,
    `SUMMARY:${escapeIcsText(params.title || 'Follow-up')}`,
    `DESCRIPTION:${escapeIcsText(params.description ?? '')}`,
    `LOCATION:${escapeIcsText(params.location ?? '')}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'Followup';
}

/** Downloads an ICS file locally; it does not transmit event data to a service. */
export function downloadIcsFile(params: CalendarEventParams, customFilename?: string): string {
  const ics = generateIcsContent(params);
  const filename = `${safeFilenamePart((customFilename ?? `Followup_${params.companyName ?? ''}`).replace(/\.ics$/i, ''))}.ics`;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return filename;
}
