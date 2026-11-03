import type { ServerResponse } from 'node:http';
import { isAccountPinApprovedProductionBranch } from '../../src/server/accountPinFirebaseAdmin.ts';
import { getAccountPinRuntime } from '../account-pin/http.ts';
import {
  createProspectingHttpHandler,
  defaultProspectingProfile,
  type ProspectingHttpRequest,
} from '../../src/server/prospectingHttp.ts';
import { PROSPECTING_PROVIDERS, type ProspectingProviderId } from '../../src/server/prospecting.ts';

export const config = {
  api: { bodyParser: { sizeLimit: '2kb' } },
};

const REQUIRED_PROVIDER_KEYS = PROSPECTING_PROVIDERS.map((provider) => provider.keyEnv);

export function isProspectingProductionEnabled(environment: Record<string, string | undefined>): boolean {
  return environment.PROSPECTING_AI_ENABLED === 'true'
    && environment.PROSPECTING_AI_COST_AND_DATA_REVIEWED === 'true'
    && environment.VERCEL_ENV === 'production'
    && environment.VITE_FIREBASE_TARGET === 'production'
    && isAccountPinApprovedProductionBranch(environment.VERCEL_GIT_COMMIT_REF)
    && REQUIRED_PROVIDER_KEYS.every((name) => Boolean(environment[name]?.trim()));
}

const handler = createProspectingHttpHandler({
  enabled: () => isProspectingProductionEnabled(process.env),
  getRuntime: () => getAccountPinRuntime(),
  profile: (query, options) => defaultProspectingProfile(query, options),
  environment: process.env,
  log: (event) => {
    // Never log prompts, provider responses, tokens, or API keys.
    console.info('[prospecting]', {
      provider: event.provider as ProspectingProviderId,
      result: event.result,
      reason: event.reason,
    });
  },
});

export default async function prospecting(request: ProspectingHttpRequest, response: ServerResponse): Promise<void> {
  await handler(request, response);
}
