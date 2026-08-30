import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkExplicitHeadingIds from './src/lib/markdown/remark-explicit-heading-ids.mjs';

export default defineConfig({
  site: 'https://thiepn.dev',
  base: '/library',
  outDir: './dist/library',
  output: 'static',
  trailingSlash: 'never',
  markdown: {
    processor: unified({
      remarkPlugins: [remarkExplicitHeadingIds],
    }),
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
