import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://thiepn.dev',
  base: '/library',
  outDir: './dist/library',
  output: 'static',
  trailingSlash: 'never',
  build: {
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
