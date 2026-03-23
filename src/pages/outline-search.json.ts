import type { APIRoute } from 'astro';
import { loadOutlineGraph } from '../utils/outlineGraph';
import { buildOutlineSearchEntries } from '../utils/outlineSearch';

export const GET: APIRoute = async () => {
  const outline = await loadOutlineGraph();
  const baseUrl = import.meta.env.BASE_URL;
  const entries = buildOutlineSearchEntries(outline, baseUrl);

  return new Response(JSON.stringify(entries), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
