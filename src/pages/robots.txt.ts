import type { APIRoute } from 'astro';

export const prerender = false;

const PRIVATE_HOSTS = new Set(['ops.cordhq.app', 'billing.cordhq.app']);
const PUBLIC_HOSTS = new Set(['cordhq.app', 'www.cordhq.app', 'docs.cordhq.app', 'dev.cordhq.app']);

const PRIVATE_ROBOTS = `User-agent: *
Disallow: /
`;

const publicRobots = (origin: string) => `User-agent: *
Allow: /
Disallow: /app/
Disallow: /api/
Disallow: /embed/
Disallow: /i/
Disallow: /sign-in
Disallow: /sign-up
Disallow: /forgot-password
Disallow: /verify-email
Disallow: /onboarding/
Disallow: /ops/

# Search and answer-engine crawlers may read public pages. Product and account
# surfaces remain blocked by the same rules above.
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-Web
User-agent: anthropic-ai
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Google-Extended
User-agent: GoogleOther
User-agent: CCBot
User-agent: meta-externalagent
User-agent: Amazonbot
User-agent: Applebot-Extended
Allow: /
Disallow: /app/
Disallow: /api/
Disallow: /embed/
Disallow: /i/
Disallow: /sign-in
Disallow: /sign-up
Disallow: /forgot-password
Disallow: /verify-email
Disallow: /onboarding/
Disallow: /ops/

Sitemap: ${origin}/sitemap.xml
`;

export const GET: APIRoute = ({ url }) => {
    const host = url.hostname.toLowerCase();
    const body = PRIVATE_HOSTS.has(host)
        ? PRIVATE_ROBOTS
        : publicRobots(PUBLIC_HOSTS.has(host) ? `https://${host === 'www.cordhq.app' ? 'cordhq.app' : host}` : 'https://cordhq.app');

    return new Response(body, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        },
    });
};
