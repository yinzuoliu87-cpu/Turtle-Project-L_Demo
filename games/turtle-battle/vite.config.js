// Vite config — keeps the codebase vanilla (globals + <script> tags).
// Vite just acts as a dev server with HMR for CSS + live reload on JS change.
// No ES-module migration; no bundling changes at build time.
export default {
  root: '.',
  server: {
    port: 5173,
    open: '/index.html',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
};
