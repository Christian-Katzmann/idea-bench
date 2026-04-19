import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'node:fs/promises';
import {defineConfig, type Plugin} from 'vite';
import { viteApiPlugin } from './src/server/vite-api-plugin';
import { config as loadDotenv } from 'dotenv';
// Make .env.local available to API handlers loaded by the dev plugin.
loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });

/**
 * Post-build plugin: inject modulepreload + stylesheet preload hints into
 * dist/login.html matching the hashed assets referenced by dist/index.html.
 *
 * Why: `/login` is served as static HTML for the initial paint. When the
 * user clicks "Sign in", the browser navigates to `/` which loads the SPA.
 * Without this plugin, the SPA chunks only start downloading AFTER the SPA
 * HTML has been parsed. With it, the browser starts fetching vendor-react,
 * vendor-tanstack, the entry JS, and the stylesheet in parallel with the
 * user typing their password — so the post-login paint feels instant.
 *
 * Hashes change every build; the plugin extracts them from index.html and
 * rewrites login.html in-place so there is no manifest to maintain.
 */
function injectLoginPreloads(): Plugin {
  return {
    name: 'inject-login-preloads',
    apply: 'build',
    closeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        const dist = path.resolve(__dirname, 'dist');
        const indexPath = path.join(dist, 'index.html');
        const loginPath = path.join(dist, 'login.html');

        let index: string;
        let login: string;
        try {
          [index, login] = await Promise.all([
            fs.readFile(indexPath, 'utf8'),
            fs.readFile(loginPath, 'utf8'),
          ]);
        } catch {
          // One of the files doesn't exist (e.g. partial build). Skip.
          return;
        }

        const links: string[] = [];
        const entryMatch = index.match(
          /<script\s+type="module"\s+crossorigin\s+src="([^"]+)"/,
        );
        if (entryMatch) {
          links.push(
            `<link rel="modulepreload" href="${entryMatch[1]}" crossorigin>`,
          );
        }
        const preloadRe =
          /<link\s+rel="modulepreload"\s+crossorigin\s+href="([^"]+)"/g;
        for (const m of index.matchAll(preloadRe)) {
          links.push(`<link rel="modulepreload" href="${m[1]}" crossorigin>`);
        }
        const cssMatch = index.match(
          /<link\s+rel="stylesheet"\s+crossorigin\s+href="([^"]+)"/,
        );
        if (cssMatch) {
          links.push(
            `<link rel="preload" as="style" href="${cssMatch[1]}" crossorigin>`,
          );
        }

        if (links.length === 0) return;

        const open = '<!-- spa-preload:auto -->';
        const close = '<!-- /spa-preload:auto -->';
        const block = `${open}\n    ${links.join('\n    ')}\n    ${close}`;

        const next = login.includes(open)
          ? login.replace(
              new RegExp(`${open}[\\s\\S]*?${close}`),
              block,
            )
          : login.replace('</head>', `    ${block}\n  </head>`);

        if (next !== login) {
          await fs.writeFile(loginPath, next, 'utf8');
        }
      },
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), viteApiPlugin(), injectLoginPreloads()],
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
