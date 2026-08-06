import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Solo se precachean los assets del build (JS/CSS/HTML/íconos). Las
      // llamadas a Supabase y al proxy de TiendaNube nunca se cachean, para
      // no mostrar stock ni órdenes desactualizados.
      manifest: {
        name: 'Right Botines — Stock',
        short_name: 'Right Botines',
        description: 'Gestión de stock, ventas y Tienda Online de Right Botines',
        theme_color: '#060A10',
        background_color: '#060A10',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
