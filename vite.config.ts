import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

let commitHash = 'unknown'
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  commitHash = 'no-git'
}

const buildTime = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      selfDestroying: true,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: '三村囲碁オンライン',
        short_name: '囲碁オンライン',
        description: '三村智保によるオンライン囲碁レッスンプラットフォーム',
        lang: 'ja',
        theme_color: '#4f46e5',
        background_color: '#0f1115',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          // Supabase API: 常にネットワーク（認証/RLSが効くデータをキャッシュしない）
          {
            urlPattern: /^https:\/\/.*\.supabase\.(co|io)\/.*/i,
            handler: 'NetworkOnly',
          },
          // Vercel Functions (LiveKit token等): 常にネットワーク
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkOnly',
          },
          // LiveKit signaling/data: ws/wss は SW で扱わないが念のため
          {
            urlPattern: /^https?:\/\/.*\.(livekit\.cloud|livekit\.io)\/.*/i,
            handler: 'NetworkOnly',
          },
          // Google Fonts (CSS): stale-while-revalidate
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
            },
          },
          // Google Fonts (woff2): cache-first
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1年
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // 開発時はSW無効（HMRと干渉するため）
      },
    }),
  ],
  server: {
    host: true,
    port: 5175,
    allowedHosts: ['online.mimura15.jp'],
    proxy: {
      '/api': {
        target: 'http://localhost:5176',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
