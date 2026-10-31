import test from 'node:test';
import assert from 'node:assert/strict';
import { copyTextToClipboard, isValidWhatsAppPhone, normalizeWhatsAppPhone } from './whatsapp.ts';

test('normalizes valid Indonesian WhatsApp numbers conservatively', () => {
  assert.equal(normalizeWhatsAppPhone('0812 3456 7890'), '6281234567890');
  assert.equal(normalizeWhatsAppPhone('+62 (812) 3456-7890'), '6281234567890');
  assert.equal(isValidWhatsAppPhone('6281234567'), true);
  assert.equal(isValidWhatsAppPhone('12345'), false);
  assert.equal(isValidWhatsAppPhone('081234567890123456'), false);
  assert.equal(normalizeWhatsAppPhone('abc0812345678'), '');
});

test('reports clipboard success only after writeText resolves', async () => {
  let copied = '';
  const result = await copyTextToClipboard('pesan', { writeText: async (text) => { copied = text; } });
  assert.deepEqual(result, { ok: true });
  assert.equal(copied, 'pesan');
});

test('reports clipboard rejection and unavailable clipboard', async () => {
  const rejected = await copyTextToClipboard('pesan', { writeText: async () => { throw new Error('denied'); } });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /belum dapat disalin/);
  const unavailable = await copyTextToClipboard('pesan', undefined);
  assert.equal(unavailable.ok, false);
  assert.match(unavailable.error, /tidak tersedia/);
});

test('accepts explicit international numbers but rejects misplaced plus markers', () => {
  assert.equal(normalizeWhatsAppPhone('+1 202 555 0123'), '12025550123');
  assert.equal(normalizeWhatsAppPhone('62+812345678'), '');
  assert.equal(normalizeWhatsAppPhone('++62812345678'), '');
  assert.equal(normalizeWhatsAppPhone('+01234567890'), '');
});
