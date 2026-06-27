import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // New deploys take over silently (we also keep updater.js as a fast
      // in-session signal). Uses the hand-written public/manifest.webmanifest
      // already linked in index.html — don't generate a second one.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false,
      workbox: {
        // Precache the FULL app shell, including the lazy admin chunk. The admin
        // chunk used to be excluded (globIgnores) to keep it out of visitors'
        // precache — but that made it the ONE lazy route not served from the SW
        // cache. After a deploy, a client still on a stale shell would import
        // the OLD admin hash, which is gone from the CDN → 404 → the dynamic
        // import rejects → crash to the ErrorBoundary ("Something went sideways"),
        // and a reload kept hitting the same stale shell. Every OTHER lazy route
        // survived because it loads from the (version-consistent) precache.
        // Precaching the admin chunk too keeps the shell and the chunk in lock-
        // step, which is the actual fix. It adds ~17KB gzip to the precache —
        // the AnalyticsPulseDetail/cobe chunk was already precached anyway.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        navigateFallback: '/index.html',
        // A payment return must always hit the network, never a stale shell.
        navigateFallbackDenylist: [/^\/checkout\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' ||
              url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Same-origin images only. Supabase API/auth/realtime is never
            // cached — always fresh, so we can't serve stale auth or data.
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split heavy, rarely-changing vendor code into its own long-cache
        // chunks so the entry stays lean and a deploy doesn't bust everything.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
});
