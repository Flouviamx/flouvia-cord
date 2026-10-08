import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildLlmsFull } from '../lib/llms-full';

export const prerender = true;

export const GET: APIRoute = async () => {
    const docs = await getCollection('docs', ({ id }) => id.startsWith('en/'));
    const text = buildLlmsFull(docs.map((d) => ({ id: d.id, title: String(d.data?.title ?? ''), description: String(d.data?.description ?? ''), body: d.body ?? '', lastUpdated: d.data?.lastUpdated })), 'en');
    return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
