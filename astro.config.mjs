import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://robotdognz.github.io',
  base: '/NeoPropaedia',
  integrations: [
    preact(),
    tailwind(),
    mdx(),
  ],
  output: 'static',
});
