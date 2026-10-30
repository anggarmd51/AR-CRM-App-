interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_TARGET: string;
  readonly VITE_FIREBASE_STAGING_PROJECT_ID_ALLOWLIST: string;
  readonly VITE_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY: string;
  readonly VITE_FIREBASE_WORKSPACE_ID: string;
  readonly VITE_FIREBASE_OWNER_UID: string;
  readonly VITE_AI_MEETING_SUMMARIZER_ENABLED: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.css';
