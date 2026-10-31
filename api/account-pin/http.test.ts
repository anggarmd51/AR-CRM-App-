import assert from 'node:assert/strict';
import test from 'node:test';
import { accountPinRequest, type AccountPinHttpRequest } from './http.ts';

test('account PIN HTTP adapter forwards Fetch Metadata for the Origin-less status GET fallback', () => {
  const request = {
    method: 'GET',
    headers: {
      authorization: 'Bearer valid.firebase.id.token',
      host: 'arcrm-preview.example.test',
      'x-forwarded-proto': 'https',
      'sec-fetch-site': 'same-origin',
    },
  } as unknown as AccountPinHttpRequest;

  assert.deepEqual(accountPinRequest(request), {
    method: 'GET',
    authorization: 'Bearer valid.firebase.id.token',
    origin: undefined,
    host: 'arcrm-preview.example.test',
    forwardedProto: 'https',
    fetchSite: 'same-origin',
    body: undefined,
  });
});
