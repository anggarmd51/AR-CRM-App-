import type { Lead } from '../types/crm.ts';
import { toDateStringOnly } from './crmCalculations.ts';

const COLUMNS = [
  ['Lead ID', (lead: Lead) => lead.id, 'String'],
  ['Company Name', (lead: Lead) => lead.company_name, 'String'],
  ['Contact Person', (lead: Lead) => lead.contact_person, 'String'],
  ['Email', (lead: Lead) => lead.email ?? '', 'String'],
  ['Phone', (lead: Lead) => lead.phone, 'String'],
  ['Industry', (lead: Lead) => lead.industry, 'String'],
  ['City', (lead: Lead) => lead.city, 'String'],
  ['Pipeline Stage', (lead: Lead) => lead.pipeline_stage, 'String'],
  ['Deal Value (IDR)', (lead: Lead) => Number(lead.deal_value) || 0, 'Number'],
  ['Next Follow-Up Date', (lead: Lead) => lead.next_followup_date || '', 'String'],
  ['Lead Score', (lead: Lead) => lead.lead_score, 'String'],
  ['Sync Status', (lead: Lead) => lead._syncStatus || 'synced', 'String'],
  ['Created At', (lead: Lead) => lead.created_at || '', 'String'],
] as const;

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlCell(value: unknown, type: 'String' | 'Number'): string {
  return `<Cell><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`;
}

export function generateLeadsExcelXml(leads: Lead[]): string {
  const header = `<Row>${COLUMNS.map(([label]) => xmlCell(label, 'String')).join('')}</Row>`;
  const rows = leads.map((lead) => `<Row>${COLUMNS.map(([, value, type]) => xmlCell(value(lead), type)).join('')}</Row>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Leads"><Table>${header}${rows.join('')}</Table></Worksheet></Workbook>`;
}

export function downloadLeadsExcel(leads: Lead[], customFilename?: string): string {
  const date = toDateStringOnly(new Date()) ?? '';
  const filename = customFilename ?? `AR_CRM_Rekapitulasi_Leads_${date}.xls`;
  const blob = new Blob([generateLeadsExcelXml(leads)], { type: 'application/vnd.ms-excel;charset=utf-8' });
  if (typeof window !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return filename;
}
