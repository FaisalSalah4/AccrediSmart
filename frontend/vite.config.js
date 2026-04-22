import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,   // exposes on your local network IP (e.g. http://192.168.x.x:5173)
    // No proxy needed — all requests go to Supabase directly from the browser
  }
})
