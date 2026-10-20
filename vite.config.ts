import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export default defineConfig({
  plugins: [
    react(),
    // El plugin de PWA agrega su manifest a todos los HTML; en crm.html tiene
    // que quedar solo el de la app del CRM. Se quita al terminar el build.
    {
      name: 'crm-solo-su-manifest',
      apply: 'build',
      enforce: 'post',
      closeBundle() {
        const archivo = 'dist/crm.html'
        if (!existsSync(archivo)) return
        const html = readFileSync(archivo, 'utf8')
        writeFileSync(archivo, html.replace(/<link rel="manifest" href="\/manifest\.webmanifest"\s*\/?>/, ''))
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      // Registro manual (src/pwaUpdate.ts) en vez del script mínimo por
      // defecto: necesitamos la lógica de workbox-window que detecta una
      // nueva versión y recarga la página sola, no solo el registro.
      injectRegister: false,
      // Con injectRegister: false el plugin NO agrega skipWaiting/clientsClaim
      // (solo lo hace con injectRegister 'auto'), y la versión nueva quedaba
      // "esperando" hasta cerrar todas las pestañas: la compu del mostrador,
      // abierta todo el día, no recibía las actualizaciones. Con esto la
      // versión nueva se activa sola y pwaUpdate.ts recarga la página.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        importScripts: ['push-handler.js'],
        // /crm se pide siempre a la red (crm.html, con el manifest de la app
        // del CRM). Si lo atendiera el service worker, serviría index.html y el
        // celu instalaría la app con el manifest equivocado.
        navigateFallbackDenylist: [/^\/crm/],
        // crm.html no se precachea: siempre se pide a la red.
        globIgnores: ['crm.html'],
      },
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
  build: {
    rollupOptions: {
      input: { main: 'index.html', crm: 'crm.html' },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
