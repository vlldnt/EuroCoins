import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Ports fixes pour ne pas entrer en conflit avec les autres projets.
export default defineConfig({
  plugins: [react()],
  server: { port: 3006, strictPort: true },
  preview: { port: 3007, strictPort: true },
})
