import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLeadsExcelXml } from './exportExcel.ts';
import type { Lead } from '../types/crm.ts';

const sample: Lead = {
  id: 'a1', company_name: '=1+1 & <test>', contact_person: 'Sample', email: 'person@example.com', phone: '', industry: 'Tech', city: 'Jakarta',
  pipeline_stage: 'Prospect', deal_value: 50, next_followup_date: '', lead_score: 'Unrated',
};

test('Excel .xls XML cells preserve text and escape content rather than executing formulas', () => {
  const xml = generateLeadsExcelXml([sample]);
  assert.match(xml, /ss:Name="Leads"/);
  assert.match(xml, /&lt;test&gt;/);
  assert.match(xml, /&amp;/);
  assert.match(xml, /ss:Type="String">=1\+1/);
  assert.doesNotMatch(xml, /<Formula/);
});
