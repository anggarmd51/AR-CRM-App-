import assert from 'node:assert/strict';
import test from 'node:test';
import { createImportedLeadDocumentId, normalizeImportedCompanyName } from './leadImportIdentity.ts';

test('Finder import identity is stable across case and whitespace variants', async () => {
  const first = await createImportedLeadDocumentId('synthetic-owner-a', 'synthetic-workspace-a', '  PT Contoh   Nusantara  ');
  const second = await createImportedLeadDocumentId('synthetic-owner-a', 'synthetic-workspace-a', 'pt contoh nusantara');
  assert.equal(first, second);
  assert.match(first, /^lead-import-[0-9a-f]{64}$/);
  assert.equal(normalizeImportedCompanyName(' PT Contoh   Nusantara '), 'pt contoh nusantara');
});

test('Finder import identity is isolated by owner and workspace', async () => {
  const baseline = await createImportedLeadDocumentId('synthetic-owner-a', 'synthetic-workspace-a', 'PT Contoh Nusantara');
  assert.notEqual(await createImportedLeadDocumentId('synthetic-owner-b', 'synthetic-workspace-a', 'PT Contoh Nusantara'), baseline);
  assert.notEqual(await createImportedLeadDocumentId('synthetic-owner-a', 'synthetic-workspace-b', 'PT Contoh Nusantara'), baseline);
});

test('Finder import identity rejects invalid input instead of falling back to a random document ID', async () => {
  await assert.rejects(createImportedLeadDocumentId('', 'workspace', 'PT Contoh'), /tidak valid/);
  await assert.rejects(createImportedLeadDocumentId('owner', 'workspace', '  '), /tidak valid/);
});
