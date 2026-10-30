import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailComposeHref, createTelHref, createWhatsAppHref, detectMobileEmailHandler } from './leadContact.ts';

test('Call, WhatsApp and Gmail links are normalized and reject malformed targets', () => {
  assert.equal(createTelHref('+62 (812) 3456-7890'), 'tel:+6281234567890');
  assert.equal(createTelHref('javascript:alert(1)'), undefined);
  assert.equal(createWhatsAppHref('081234567890'), 'https://wa.me/6281234567890');
  assert.equal(createWhatsAppHref('x'), undefined);
  assert.equal(createEmailComposeHref('sales@example.id', true), 'mailto:sales%40example.id');
  assert.match(createEmailComposeHref('sales@example.id', false) ?? '', /^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&to=/);
  assert.equal(createEmailComposeHref('not-an-email', false), undefined);
  assert.equal(detectMobileEmailHandler('Android Mobile'), true);
  assert.equal(detectMobileEmailHandler('Windows NT'), false);
});
