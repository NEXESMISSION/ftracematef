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
        // Precache the app shell. Skip the operator-only admin chunk (and its
        // cobe globe) — no visitor needs it offline, and it's dead weight in
        // every first-visit precache.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        globIgnores: ['**/AdminDashboard-*.js'],
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
