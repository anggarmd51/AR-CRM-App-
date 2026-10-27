import { Buffer } from 'node:buffer';
import { createSign, timingSafeEqual } from 'node:crypto';
import type {
  ExportRow,
  FirestoreExportConfig,
  FirestoreLeadDocument,
  SheetsUpsertAdapter,
} from './firestoreSheetsExport.ts';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const GOOGLE_API_TIMEOUT_MS = 25_000;
const ROWS_PER_BATCH = 400;

type FetchLike = typeof fetch;

type FirestoreValue = Record<string, unknown>;

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function rangePath(range: string): string {
  return encodeURIComponent(range);
}

async function readJson(response: Response, operation: string): Promise<any> {
  if (!response.ok) throw new Error(`${operation} failed with HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${operation} returned an invalid response.`);
  }
}

function decodeFirestoreValue(value: FirestoreValue): unknown {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) {
    const decoded = Number(value.integerValue);
    if (!Number.isFinite(decoded)) throw new Error('Firestore returned an invalid integer value.');
    return decoded;
  }
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('mapValue' in value) {
    const fields = (value.mapValue as { fields?: Record<string, FirestoreValue> } | undefined)?.fields ?? {};
    return decodeFirestoreFields(fields);
  }
  if ('arrayValue' in value) {
    const values = (value.arrayValue as { values?: FirestoreValue[] } | undefined)?.values ?? [];
    return values.map(decodeFirestoreValue);
  }
  return undefined;
}

function decodeFirestoreFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

function assertDocumentName(name: unknown, config: FirestoreExportConfig): string {
  if (typeof name !== 'string') throw new Error('Firestore returned a document without a name.');
  const prefix = `projects/${config.projectId}/databases/(default)/documents/workspaces/${config.workspaceId}/leads/`;
  if (!name.startsWith(prefix)) throw new Error('Firestore returned a document outside the fixed leads collection.');
  const id = name.slice(prefix.length);
  if (!id || id.includes('/') || id.length > 150) throw new Error('Firestore returned an invalid lead document name.');
  return id;
}

export function createGoogleExportAdapters(config: FirestoreExportConfig, fetchImpl: FetchLike = fetch) {
  let cachedAccessToken: string | undefined;

  async function getAccessToken(): Promise<string> {
    if (cachedAccessToken) return cachedAccessToken;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
    const claims = base64UrlJson({
      iss: config.serviceAccountEmail,
      scope: `${FIRESTORE_SCOPE} ${SHEETS_SCOPE}`,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    });
    const unsignedToken = `${header}.${claims}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsignedToken);
    signer.end();
    const signature = signer.sign(config.serviceAccountPrivateKey).toString('base64url');
    const assertion = `${unsignedToken}.${signature}`;
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(GOOGLE_API_TIMEOUT_MS),
    });
    const payload = await readJson(response, 'Google OAuth token request');
    if (typeof payload.access_token !== 'string' || payload.access_token.length < 10) {
      throw new Error('Google OAuth token response did not contain a valid access token.');
    }
    const accessToken = payload.access_token as string;
    cachedAccessToken = accessToken;
    return accessToken;
  }

  async function googleFetch(url: string, init: RequestInit, operation: string): Promise<Response> {
    const token = await getAccessToken();
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(GOOGLE_API_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${operation} failed with HTTP ${response.status}.`);
    return response;
  }

  const firestore = {
    async listOwnerLeads(input: { projectId: string; workspaceId: string; ownerUid: string }): Promise<FirestoreLeadDocument[]> {
      if (input.projectId !== config.projectId || input.workspaceId !== config.workspaceId || input.ownerUid !== config.ownerUid) {
        throw new Error('Firestore read target does not match the validated server configuration.');
      }
      const documentsBase = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents`;
      const workspacePath = `workspaces/${encodeURIComponent(config.workspaceId)}`;
      const workspaceResponse = await googleFetch(`${documentsBase}/${workspacePath}`, { method: 'GET' }, 'Firestore owner workspace check');
      const workspaceDocument = await readJson(workspaceResponse, 'Firestore owner workspace check');
      const workspaceFields = decodeFirestoreFields(workspaceDocument.fields ?? {});
      if (workspaceFields.ownerId !== config.ownerUid) {
        throw new Error('Firestore workspace root is not owned by the configured owner.');
      }

      const membershipPath = `${workspacePath}/members/${encodeURIComponent(config.ownerUid)}`;
      const membershipResponse = await googleFetch(`${documentsBase}/${membershipPath}`, { method: 'GET' }, 'Firestore owner membership check');
      const membershipDocument = await readJson(membershipResponse, 'Firestore owner membership check');
      const membershipFields = decodeFirestoreFields(membershipDocument.fields ?? {});
      if (membershipFields.role !== 'owner') {
        throw new Error('Firestore workspace membership is not owner-role.');
      }

      const parent = `projects/${config.projectId}/databases/(default)/documents/${workspacePath}`;
      const url = `https://firestore.googleapis.com/v1/${parent}:runQuery`;
      const response = await googleFetch(url, {
        method: 'POST',
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'leads' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'ownerId' },
                op: 'EQUAL',
                value: { stringValue: config.ownerUid },
              },
            },
          },
        }),
      }, 'Firestore owner leads read');
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error('Firestore owner leads read returned an invalid response.');
      }
      if (!Array.isArray(payload)) throw new Error('Firestore owner leads read returned an invalid result set.');
      return payload.flatMap((entry: any) => {
        if (!entry?.document) return [];
        const document = entry.document;
        return [{
          id: assertDocumentName(document.name, config),
          data: decodeFirestoreFields(document.fields ?? {}),
        }];
      });
    },
  };

  const sheets: SheetsUpsertAdapter = {
    async upsertRows({ spreadsheetId, sheetName, headers, rows }) {
      if (spreadsheetId !== config.spreadsheetId || sheetName !== config.sheetName) {
        throw new Error('Google Sheets write target does not match the validated server configuration.');
      }
      const quotedName = quoteSheetName(sheetName);
      const tableRange = `${quotedName}!A1:H`;
      const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
      const getUrl = `${baseUrl}/values/${rangePath(tableRange)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;
      const getResponse = await googleFetch(getUrl, { method: 'GET' }, 'Google Sheets export table read');
      const existingPayload = await readJson(getResponse, 'Google Sheets export table read');
      const values: unknown[][] = Array.isArray(existingPayload.values) ? existingPayload.values : [];

      const dataStartRow = 2;
      if (values.length === 0) {
        const headerRange = `${quotedName}!A1:H1`;
        const url = `${baseUrl}/values/${rangePath(headerRange)}?valueInputOption=RAW`;
        const response = await googleFetch(url, {
          method: 'PUT',
          body: JSON.stringify({ range: headerRange, majorDimension: 'ROWS', values: [headers] }),
        }, 'Google Sheets header initialization');
        await readJson(response, 'Google Sheets header initialization');
      } else {
        const actualHeader = values[0].map((cell) => String(cell ?? ''));
        if (actualHeader.length !== headers.length || headers.some((header, index) => actualHeader[index] !== header)) {
          throw new Error('Google Sheets target tab does not have the expected export header.');
        }
      }

      const existingRowByKey = new Map<string, number>();
      for (let index = dataStartRow - 1; index < values.length; index += 1) {
        const row = values[index] ?? [];
        const key = typeof row[0] === 'string' ? row[0] : row[0] == null ? '' : String(row[0]);
        const hasData = row.some((cell) => cell !== '' && cell !== null && cell !== undefined);
        if (!key && hasData) throw new Error('Google Sheets export table contains a row without a source_key.');
        if (!key) continue;
        if (existingRowByKey.has(key)) throw new Error('Google Sheets export table contains duplicate source_key values.');
        existingRowByKey.set(key, index + 1);
      }

      const updates: Array<{ range: string; values: ExportRow[] }> = [];
      const inserts: ExportRow[] = [];
      for (const row of rows) {
        const sourceKey = String(row[0] ?? '');
        const existingRow = existingRowByKey.get(sourceKey);
        if (existingRow) {
          updates.push({ range: `${quotedName}!A${existingRow}:H${existingRow}`, values: [row] });
        } else {
          inserts.push(row);
        }
      }

      for (let offset = 0; offset < updates.length; offset += ROWS_PER_BATCH) {
        const batch = updates.slice(offset, offset + ROWS_PER_BATCH);
        const url = `${baseUrl}/values:batchUpdate`;
        const response = await googleFetch(url, {
          method: 'POST',
          body: JSON.stringify({ valueInputOption: 'RAW', data: batch }),
        }, 'Google Sheets export update');
        await readJson(response, 'Google Sheets export update');
      }

      for (let offset = 0; offset < inserts.length; offset += ROWS_PER_BATCH) {
        const batch = inserts.slice(offset, offset + ROWS_PER_BATCH);
        const appendUrl = `${baseUrl}/values/${rangePath(`${quotedName}!A:H`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
        const response = await googleFetch(appendUrl, {
          method: 'POST',
          body: JSON.stringify({ majorDimension: 'ROWS', values: batch }),
        }, 'Google Sheets export append');
        await readJson(response, 'Google Sheets export append');
      }

      return { inserted: inserts.length, updated: updates.length };
    },
  };

  return { firestore, sheets };
}

export function isCronAuthorized(header: string | string[] | undefined, expectedSecret: string | undefined): boolean {
  if (!expectedSecret || expectedSecret.length < 32 || typeof header !== 'string') return false;
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;
  const presented = header.slice(prefix.length);
  const presentedBytes = Buffer.from(presented, 'utf8');
  const expectedBytes = Buffer.from(expectedSecret, 'utf8');
  if (presentedBytes.length !== expectedBytes.length) return false;
  // Length is checked before a constant-time comparison to avoid its unequal-length exception.
  return timingSafeEqual(presentedBytes, expectedBytes);
}
