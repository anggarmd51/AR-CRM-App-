import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLeadsCsv, escapeCsvCell } from './exportCsv.ts';
import { Lead } from '../types/crm.ts';

test('escapeCsvCell correctly wraps and escapes quotes and commas', () => {
  assert.equal(escapeCsvCell('Simple'), '"Simple"');
  assert.equal(escapeCsvCell('PT ABC, Tbk'), '"PT ABC, Tbk"');
  assert.equal(escapeCsvCell('Director "Chief" Officer'), '"Director ""Chief"" Officer"');
  assert.equal(escapeCsvCell(12345), '"12345"');
  assert.equal(escapeCsvCell(null), '""');
});

test('escapeCsvCell neutralizes formula injection triggers (=, +, -, @)', () => {
  assert.equal(escapeCsvCell('=SUM(A1:A10)'), '"\'=SUM(A1:A10)"');
  assert.equal(escapeCsvCell('+cmd|/C calc'), '"\'+cmd|/C calc"');
  assert.equal(escapeCsvCell('-2+3+cmd|'), '"\'-2+3+cmd|"');
  assert.equal(escapeCsvCell('@SUM(1,2)'), '"\'@SUM(1,2)"');
});

test('generateLeadsCsv produces well-formed CSV with headers and row values', () => {
  const sampleLeads: Lead[] = [
    {
      id: 'LEAD-101',
      company_name: 'PT Nusantara, Logistics',
      contact_person: 'Budi Santoso',
      phone: '+6281234567890',
      industry: 'Logistics',
      city: 'Jakarta',
      pipeline_stage: 'Meeting',
      deal_value: 45000000,
      next_followup_date: '2026-10-30',
      lead_score: 'Hot',
      created_at: '2026-10-24T00:00:00Z',
    },
  ];

  const csv = generateLeadsCsv(sampleLeads);
  const lines = csv.split('\r\n');

  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('Lead ID'));
  assert.ok(lines[0].includes('Deal Value (IDR)'));
  assert.ok(lines[1].includes('"LEAD-101"'));
  assert.ok(lines[1].includes('"PT Nusantara, Logistics"'));
  assert.ok(lines[1].includes('"45000000"'));
});
