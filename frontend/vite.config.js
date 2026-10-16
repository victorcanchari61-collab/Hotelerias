import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/*
 * A donde van las rutas que el codigo pide relativas.
 *
 * Se declara una vez y se usa en dev y en `vite preview`: sin esto, probar el
 * build de produccion en local no tenia backend y no se podia reproducir nada
 * de lo que solo falla compilado.
 */
const proxy = {
  '/api': {
    // 127.0.0.1 y no localhost: en Windows, localhost prueba primero IPv6 y
    // recien despues cae a IPv4 — ~200 ms perdidos en CADA peticion.
    target: 'http://127.0.0.1:5220',
    changeOrigin: true,
  },
  // Las fotos de flota y conductores: el backend las sirve desde su raiz
  // ("/uploads/..."), no bajo "/api", asi que necesitan su propia entrada.
  '/uploads': {
    target: 'http://127.0.0.1:5220',
    changeOrigin: true,
  },
  // ws: true porque SignalR sube la conexion a WebSocket.
  '/hubs': {
    target: 'http://127.0.0.1:5220',
    changeOrigin: true,
    ws: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // "@/core/..." en vez de "../../../core/...": las capas se importan por
    // su nombre, y se ve de un vistazo de que capa viene cada cosa.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Lo que jsdom no trae y el kit de UI usa (ResizeObserver, matchMedia).
    setupFiles: ['src/test/setup.ts'],
  },
  server: { proxy },
  // Igual que arriba, para poder abrir el build ya compilado contra el backend.
  preview: { proxy },
})