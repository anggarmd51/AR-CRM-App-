import { normalizeWhatsAppPhone } from './whatsapp.ts';

export function createTelHref(phone: string | number | undefined): string | undefined {
  const raw = String(phone ?? '').trim();
  const dialable = raw.replace(/[\s().-]/g, '');
  if (!/^\+?\d{3,20}$/.test(dialable)) return undefined;
  return `tel:${dialable}`;
}

export function createWhatsAppHref(phone: string | number | undefined): string | undefined {
  const normalized = normalizeWhatsAppPhone(phone);
  return normalized ? `https://wa.me/${normalized}` : undefined;
}

export function isPlausibleEmail(email: string | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim();
  return normalized.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function createEmailComposeHref(email: string | undefined, mobile: boolean): string | undefined {
  if (!isPlausibleEmail(email)) return undefined;
  const normalized = email!.trim();
  if (mobile) return `mailto:${encodeURIComponent(normalized)}`;
  const params = new URLSearchParams({ view: 'cm', fs: '1', to: normalized });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function detectMobileEmailHandler(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}
