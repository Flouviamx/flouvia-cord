import { getCollection } from 'astro:content';

export const prerender = true;

export async function GET() {
    const supportEntries = await getCollection('support');
    
    // We create a lightweight index to ship to the client
    const index = supportEntries.map(entry => ({
        id: entry.id,
        title: entry.data.title,
        description: entry.data.description,
        category: entry.data.category,
        url: `/soporte/${entry.id}`
    }));

    return new Response(JSON.stringify(index), {
        status: 200,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}
