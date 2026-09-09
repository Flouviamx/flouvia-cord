/** Preserve the cycle inside the post-signup redirect, rather than on signup. */
export function planCheckoutLink(baseHref: string, cycle: 'mensual' | 'anual') {
    const url = new URL(baseHref, 'https://cordhq.app');
    const redirect = url.searchParams.get('redirect_url');
    if (redirect) {
        const checkout = new URL(redirect, url.origin);
        checkout.searchParams.set('cycle', cycle);
        url.searchParams.set('redirect_url', checkout.pathname + checkout.search);
    } else url.searchParams.set('cycle', cycle);
    return url.pathname + url.search;
}
