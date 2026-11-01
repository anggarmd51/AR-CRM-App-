export type ClipboardCopyResult = { ok: true } | { ok: false; error: string };

/** Normalize Indonesian national input to digits, then accept only conservative E.164 length. */
export function normalizeWhatsAppPhone(phone: string | number | undefined): string {
  if (phone === undefined || phone === null) return '';
  const raw = String(phone).trim();
  if (!raw || !/^[+\d\s().-]+$/.test(raw)) return '';
  if (raw.includes('+') && (!raw.startsWith('+') || raw.slice(1).includes('+'))) return '';
  let digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) {
    // A plus is only valid as the leading international marker.
    if (raw.trim().slice(1).includes('+')) return '';
  } else if (digits.startsWith('0')) {
    digits = `62${digits.slice(1)}`;
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) return '';
  return digits;
}

export function isValidWhatsAppPhone(phone: string | number | undefined): boolean {
  return normalizeWhatsAppPhone(phone).length > 0;
}

/** Interpolates {{key}} placeholders; missing values remain visibly marked. */
export function interpolateWhatsAppTemplate(
  templateText: string,
  variables: Record<string, string | number | undefined>,
): string {
  return templateText.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => {
    const value = variables[key];
    return value === undefined || value === null || value === '' ? `[${key}]` : String(value);
  });
}

export const interpolateWhatsAppMessage = interpolateWhatsAppTemplate;

/** Returns a safe click-to-chat URL or undefined when the recipient number is invalid. */
export function createWhatsAppHref(
  phone: string | number | undefined,
  message: string,
): string | undefined {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return undefined;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export async function copyTextToClipboard(text: string, clipboard: Pick<Clipboard, 'writeText'> | undefined = globalThis.navigator?.clipboard): Promise<ClipboardCopyResult> {
  if (!clipboard?.writeText) return { ok: false, error: 'Clipboard tidak tersedia di browser ini.' };
  try {
    await clipboard.writeText(text);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Teks belum dapat disalin. Pilih dan salin pesan secara manual.' };
  }
}
