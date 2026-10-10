import { defineConfig } from 'vite';

// Dev and preview servers bind to 0.0.0.0 so they are reachable from a container or
// preview proxy. Production hosting is handled by Vercel (see vercel.json).
export default defineConfig({
  // Relative asset URLs allow the static build to live at either a domain root
  // or a project subpath (for example, GitHub Pages).
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020'
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true
  }
});
