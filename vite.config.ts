import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { viteApiPlugin } from './src/server/vite-api-plugin';
import { config as loadDotenv } from 'dotenv';
// Make .env.local available to API handlers loaded by the dev plugin.
loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), viteApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Split only the truly cross-route heavy vendors into long-lived
          // chunks. `@base-ui` / `@floating-ui` used to live in a single
          // vendor-baseui chunk; that forced every route to pay for Dialog +
          // Select even though those primitives are only used on a minority
          // of pages. Omitting them lets Rollup co-locate each primitive with
          // its consuming route chunk, trimming the initial bundle.
          manualChunks(id) {
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router') ||
              id.includes('node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/@tanstack')) {
              return 'vendor-tanstack';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
