import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: 'dist',
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        format: 'iife',
      },
    },
  },
  plugins: [
    {
      name: 'remove-crossorigin',
      enforce: 'post',
      transformIndexHtml(html) {
        return html
          .replace(/ crossorigin/g, '')
          .replace(/ type="module"/g, '');
      },
    },
  ],
});
