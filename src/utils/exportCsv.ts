import { Lead } from '../types/crm.ts';

/**
 * Escapes a cell value for safe RFC-4180 CSV generation.
 */
export function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) {
    return '""';
  }
  let str = String(value);

  // SEC-02 Fix: Neutralize CSV / Formula Injection (CWE-1236)
  // If cell starts with formula trigger characters (=, +, -, @), prepend single quote (')
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // If string contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Converts an array of Lead objects into formatted CSV string content.
 */
export function generateLeadsCsv(leads: Lead[]): string {
  const headers = [
    'Lead ID',
    'Company Name',
    'Contact Person',
    'Phone',
    'Industry',
    'City',
    'Pipeline Stage',
    'Deal Value (IDR)',
    'Next Follow-Up Date',
    'Lead Score',
    'Sync Status',
    'Created At',
  ];

  const rows = leads.map((lead) => [
    escapeCsvCell(lead.id),
    escapeCsvCell(lead.company_name),
    escapeCsvCell(lead.contact_person),
    escapeCsvCell(lead.phone),
    escapeCsvCell(lead.industry),
    escapeCsvCell(lead.city),
    escapeCsvCell(lead.pipeline_stage),
    escapeCsvCell(lead.deal_value || 0),
    escapeCsvCell(lead.next_followup_date || '-'),
    escapeCsvCell(lead.lead_score),
    escapeCsvCell(lead._syncStatus || 'synced'),
    escapeCsvCell(lead.created_at || ''),
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
}

/**
 * Triggers client-side download of the CSV file.
 * Returns the downloaded filename.
 */
export function downloadLeadsCsv(leads: Lead[], customFilename?: string): string {
  const csvContent = generateLeadsCsv(leads);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const filename = customFilename || `AR_CRM_Rekapitulasi_Leads_${dateStr}.csv`;

  // Use UTF-8 Byte Order Mark (BOM) so Excel opens UTF-8 Indonesian accents cleanly
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });

  if (typeof window !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return filename;
}
