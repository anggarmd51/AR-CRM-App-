import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'path';
import {defineConfig} from 'vite';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    // Vercel system environment is not otherwise exposed to browser code. Only
    // the non-secret deployment class is embedded so Firebase can fail closed.
    define: {
      __VERCEL_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? ''),
      __VERCEL_GIT_COMMIT_REF__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_REF ?? ''),
    },
    plugins: [react(), tailwindcss()],
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'vendor',
                test: /node_modules[\\/]/,
                maxSize: 350 * 1024,
              },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(configDirectory, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
