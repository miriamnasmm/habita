import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Para publicar en GitHub Pages bajo /habita/ se construye con GHPAGES=1.
// En dev ('npm run dev') sirve en '/'.
export default defineConfig({
  base: process.env.GHPAGES ? '/habita/' : '/',
  plugins: [react()],
})
