export const SITE = 'https://cordhq.app';
export const DOCS_SITE = 'https://docs.cordhq.app';
export const DEV_SITE = 'https://dev.cordhq.app';

export const ORG_ID = `${SITE}/#organization`;
export const WEBSITE_ID = `${SITE}/#website`;
export const SOFTWARE_ID = `${SITE}/#software`;
export const FLOUVIA_ID = 'https://flouvia.com/#organization';

export const CORD_SAME_AS = [
    'https://www.linkedin.com/company/cordapp/',
    'https://x.com/usecordapp',
    'https://instagram.com/cord.hq',
    'https://tiktok.com/@cord.hq',
];

export const flouviaEntity = () => ({
    '@type': 'Organization',
    '@id': FLOUVIA_ID,
    name: 'Flouvia',
    url: 'https://flouvia.com',
});

export const cordOrganization = () => ({
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'Cord',
    url: SITE,
    logo: { '@type': 'ImageObject', url: `${SITE}/favicon-512x512.png`, width: 512, height: 512 },
    image: `${SITE}/og-cord.jpg`,
    sameAs: CORD_SAME_AS,
    parentOrganization: { '@id': FLOUVIA_ID },
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: 'contacto@cordhq.app', availableLanguage: ['es', 'en'] }],
});

export const inLanguage = (lang: 'es' | 'en') => (lang === 'es' ? 'es' : 'en');
