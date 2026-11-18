/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Chemins relatifs : l'application fonctionne à la racine d'un domaine, dans un sous-dossier
  // (GitHub Pages) et depuis le disque (application PC Electron).
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // enregistrement manuel (désactivé dans l'application PC)
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Cap Budget',
        short_name: 'Cap Budget',
        description: 'Suivi de budget, patrimoine et optimisation fiscale.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f7f9',
        theme_color: '#0f766e',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Ajouter une opération', url: './#/transactions', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: 'Importer un relevé', url: './#/import', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        // le moteur de lecture PDF dépasse la limite par défaut de 2 Mo
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        // les appels à Supabase ne passent jamais par le cache
        navigateFallbackDenylist: [/^\/auth/, /^\/rest/],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  test: { globals: true, environment: 'node' },
});
