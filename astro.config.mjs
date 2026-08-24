import { defineConfig } from 'astro/config';
import remarkExplicitHeadingIds from './src/lib/markdown/remark-explicit-heading-ids.mjs';

export default defineConfig({
  site: 'https://thiepn.dev',
  base: '/library',
  outDir: './dist/library',
  output: 'static',
  trailingSlash: 'never',
  markdown: {
    remarkPlugins: [remarkExplicitHeadingIds],
  },
  build: {
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
