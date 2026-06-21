import { getCollection } from 'astro:content';

export async function GET() {
  const supportEntries = await getCollection('support');
  
  const searchIndex = supportEntries.map(entry => ({
    slug: entry.id,
    title: entry.data.title,
    description: entry.data.description,
    category: entry.data.category,
  }));

  return new Response(JSON.stringify(searchIndex), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
