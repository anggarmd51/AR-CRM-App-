import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePipelineMetrics,
  filterFollowUps,
  cleanPhoneNumber,
  generateWhatsAppUrl,
  toDateStringOnly,
  formatCurrency,
  formatDateDisplay,
  formatDateTimeDisplay,
  formatNumber,
} from './crmCalculations.ts';
import { Lead } from '../types/crm.ts';

const mockLeads: Lead[] = [
  {
    id: 'L1',
    company_name: 'Alpha Corp',
    contact_person: 'Alice',
    phone: '08123456789',
    industry: 'Tech',
    city: 'Jakarta',
    pipeline_stage: 'Prospect',
    deal_value: 10000,
    next_followup_date: '2026-10-20', // overdue relative to 2026-10-23
    lead_score: 'Hot',
  },
  {
    id: 'L2',
    company_name: 'Beta Ltd',
    contact_person: 'Bob',
    phone: '+628987654321',
    industry: 'Finance',
    city: 'Surabaya',
    pipeline_stage: 'Meeting',
    deal_value: 20000,
    next_followup_date: '2026-10-23', // due today
    lead_score: 'Warm',
  },
  {
    id: 'L3',
    company_name: 'Gamma Inc',
    contact_person: 'Charlie',
    phone: '62811223344',
    industry: 'Retail',
    city: 'Bandung',
    pipeline_stage: 'Negotiation',
    deal_value: 30000,
    next_followup_date: '2026-10-25', // upcoming
    lead_score: 'Hot',
  },
  {
    id: 'L4',
    company_name: 'Delta Co',
    contact_person: 'David',
    phone: '0855667788',
    industry: 'Health',
    city: 'Medan',
    pipeline_stage: 'Closing Won',
    deal_value: 50000,
    next_followup_date: '2026-10-23', // Won, should not show in follow-ups
    lead_score: 'Hot',
  },
  {
    id: 'L5',
    company_name: 'Epsilon Tech',
    contact_person: 'Eve',
    phone: '',
    industry: 'Logistics',
    city: 'Jakarta',
    pipeline_stage: 'Closing Lost',
    deal_value: 15000,
    next_followup_date: '',
    lead_score: 'Cold',
  },
];

test('calculatePipelineMetrics excludes Closing Lost value and preserves other stage totals', () => {
  const metrics = calculatePipelineMetrics(mockLeads);
  assert.equal(metrics.totalLeads, 5);
  assert.equal(metrics.totalPipelineValue, 110000); // 10k + 20k + 30k + 50k; excludes lost 15k
  assert.equal(metrics.wonValue, 50000);
  assert.equal(metrics.activeValue, 60000); // 10k (Prospect) + 20k (Meeting) + 30k (Negotiation)
  // Weighted: 10000*0.2 + 20000*0.5 + 30000*0.8 = 2000 + 10000 + 24000 = 36000
  assert.equal(metrics.weightedPipelineValue, 36000);
  assert.equal(metrics.stageCounts['Prospect'], 1);
  assert.equal(metrics.stageCounts['Meeting'], 1);
  assert.equal(metrics.stageCounts['Negotiation'], 1);
  assert.equal(metrics.stageCounts['Closing Won'], 1);
  assert.equal(metrics.stageCounts['Closing Lost'], 1);
  // Win rate: 1 won / (1 won + 1 lost) = 50%
  assert.equal(metrics.winRatePercentage, 50);
});

test('filterFollowUps categorizes active leads by reference date correctly', () => {
  const categories = filterFollowUps(mockLeads, '2026-10-23');
  assert.equal(categories.overdue.length, 1);
  assert.equal(categories.overdue[0].id, 'L1');
  assert.equal(categories.dueToday.length, 1);
  assert.equal(categories.dueToday[0].id, 'L2');
  assert.equal(categories.upcoming.length, 1);
  assert.equal(categories.upcoming[0].id, 'L3');
  // L4 (Closing Won) and L5 (Closing Lost) should be excluded
});

test('cleanPhoneNumber formats 08... and +62... correctly', () => {
  assert.equal(cleanPhoneNumber('08123456789'), '628123456789');
  assert.equal(cleanPhoneNumber('+628987654321'), '628987654321');
  assert.equal(cleanPhoneNumber('62811223344'), '62811223344');
  assert.equal(cleanPhoneNumber(''), '');
});

test('generateWhatsAppUrl builds valid wa.me link with encoded template', () => {
  const url = generateWhatsAppUrl('08123456789', 'intro', {
    contact_person: 'Alice',
    company_name: 'Alpha Corp',
  });
  assert.ok(url.startsWith('https://wa.me/628123456789?text='));
  assert.ok(url.includes(encodeURIComponent('Alice')));
  assert.ok(url.includes(encodeURIComponent('Alpha Corp')));
});

test('toDateStringOnly handles ISO and YYYY-MM-DD correctly', () => {
  assert.equal(toDateStringOnly('2026-10-24T17:00:00.000Z'), '2026-10-25');
  assert.equal(toDateStringOnly('2026-10-25'), '2026-10-25');
  assert.equal(toDateStringOnly(undefined), null);
  assert.equal(toDateStringOnly('invalid-date'), null);
});

test('calendar dates stay unchanged while timestamps use the Asia/Jakarta calendar day', () => {
  assert.equal(toDateStringOnly('2026-10-24'), '2026-10-24');
  assert.equal(toDateStringOnly('2026-10-24T16:30:00.000Z'), '2026-10-24');
  assert.equal(toDateStringOnly('2026-10-24T17:30:00.000Z'), '2026-10-25');
  assert.equal(toDateStringOnly('2026-02-30'), null);
});

test('filterFollowUps compares date-only and timestamp values by Indonesian local day', () => {
  const boundaryLeads = [
    { ...mockLeads[0], id: 'timestamp-today', next_followup_date: '2026-10-25T17:30:00.000Z' },
    { ...mockLeads[1], id: 'calendar-today', next_followup_date: '2026-10-26' },
    { ...mockLeads[2], id: 'timestamp-overdue', next_followup_date: '2026-10-24T16:30:00.000Z' },
  ];
  const categories = filterFollowUps(boundaryLeads, '2026-10-25T18:00:00.000Z');

  assert.deepEqual(categories.dueToday.map((lead) => lead.id), ['timestamp-today', 'calendar-today']);
  assert.deepEqual(categories.overdue.map((lead) => lead.id), ['timestamp-overdue']);
});

test('number, currency, and date displays use Indonesian locale formatting', () => {
  assert.equal(formatNumber(1_234_567.8, { maximumFractionDigits: 1 }), '1.234.567,8');
  assert.equal(formatCurrency(1_234_567_890), 'Rp\u00a01.234.567.890');
  assert.equal(formatDateDisplay('2026-10-25'), '25 Okt 2026');
  assert.equal(formatDateTimeDisplay('2026-10-24T16:30:00.000Z'), '24 Okt 2026, 23.30');
});
