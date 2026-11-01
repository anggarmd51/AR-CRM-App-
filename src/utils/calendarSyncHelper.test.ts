import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCalendarDate, generateIcsContent, isValidCalendarDateInput } from './calendarSyncHelper.ts';

const encoder = new TextEncoder();

test('date-only follow-ups become one-day all-day calendar events', () => {
  assert.equal(formatCalendarDate('2026-11-02', true), '20261102');
  const ics = generateIcsContent({ id: 'lead-123', title: 'Follow-up', startDate: '2026-11-02' });
  assert.match(ics, /DTSTART;VALUE=DATE:20261102/);
  assert.match(ics, /DTEND;VALUE=DATE:20261103/);
  assert.match(ics, /UID:lead-123@arcrm\.app/);
  assert.ok(ics.endsWith('\r\n'));
});

test('timed events use UTC timestamps and enforce a bounded duration', () => {
  assert.equal(formatCalendarDate('2026-11-02T10:15:00Z'), '20261102T101500Z');
  const ics = generateIcsContent({ id: 'meeting-1', title: 'Call', startDate: '2026-11-02T10:15:00Z', durationMinutes: 30 });
  assert.match(ics, /DTSTART:20261102T101500Z/);
  assert.match(ics, /DTEND:20261102T104500Z/);
  assert.throws(() => generateIcsContent({ title: 'Call', startDate: '2026-11-02T10:15:00Z', durationMinutes: 0 }), /Durasi kalender/);
});

test('rejects impossible date-only inputs', () => {
  assert.equal(isValidCalendarDateInput('2024-02-29'), true);
  assert.equal(isValidCalendarDateInput('2026-02-29'), false);
  assert.equal(isValidCalendarDateInput('2026-13-01'), false);
  assert.throws(() => generateIcsContent({ title: 'Bad date', startDate: '2026-02-30' }), /Tanggal kalender/);
});

test('escapes text and folds long UTF-8 lines without splitting code points', () => {
  const longCompany = 'Perusahaan,;\\ Indonesia 東京 '.repeat(8);
  const ics = generateIcsContent({
    id: 'long-event',
    title: `Follow-up: ${longCompany}`,
    description: 'baris satu\nbaris dua, dengan; tanda\\',
    startDate: '2026-11-02',
  });
  assert.match(ics, /\\,|\\;/);
  assert.match(ics, /\\n/);
  for (const line of ics.split('\r\n').filter(Boolean)) {
    assert.ok(encoder.encode(line).length <= 75, `line exceeds 75 octets: ${line}`);
  }
  assert.match(ics, /\r\n /, 'folded continuation lines begin with one space');
});
