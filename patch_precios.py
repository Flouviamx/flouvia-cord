import re

with open('src/pages/precios.astro', 'r') as f:
    content = f.read()

# Remove the hero toggle
hero_toggle_regex = r'<div class="pr-toggle reveal".*?</div>'
content = re.sub(hero_toggle_regex, '', content, flags=re.DOTALL)

# Replace the grid
grid_old = """        <section class="pr-grid-wrap">
            <div class="pr-grid">
                {PLANES.map((p) => {
                    const anual = precioAnualMensualizado(p.precioMensual);
                    return (
                        <article class:list={['plan reveal', { 'plan-featured': p.destacado }]}>
                            {p.ribbon && <span class="plan-ribbon">{p.ribbon}</span>}
                            <div class="plan-head">
                                <h3 class="plan-name">{p.nombre}</h3>
                                <p class="plan-tagline">{p.tagline}</p>
                            </div>
                            <div class="plan-price">
                                {p.precioMensual === 0 ? (
                                    <>
                                        <span class="editorial plan-amount">$0</span>
                                        <span class="plan-cycle">{isEn ? 'forever' : 'para siempre'}</span>
                                    </>
                                ) : (
                                    <>
                                        <span
                                            class="editorial plan-amount"
                                            data-mensual={String(p.precioMensual)}
                                            data-anual={String(anual)}
                                        >{money0(p.precioMensual)}</span>
                                        <span class="plan-cycle">
                                            <span>{isEn ? 'USD / month' : 'MXN / mes'}</span>
                                            <i class="plan-billed" data-billed>{isEn ? 'billed monthly' : 'facturado mensual'}</i>
                                        </span>
                                    </>
                                )}
                            </div>
                            <a
                                href={p.precioMensual === 0
                                    ? p.ctaHref
                                    : `/registro?redirect_url=${encodeURIComponent(`/app/checkout?plan=${p.id}&cycle=mensual`)}`}
                                data-cta-plan={p.precioMensual === 0 ? undefined : p.id}
                                class:list={['plan-cta', p.destacado ? 'plan-cta-solid' : 'plan-cta-ghost']}
                            >{p.ctaLabel}</a>
                            <ul class="plan-feats">
                                {p.feats.map((f) => (
                                    <li><span class="pf-check">✓</span> {f}</li>
                                ))}
                            </ul>
                        </article>
                    );
                })}
            </div>"""

grid_new = """        <section class="pr-grid-wrap">
            <div class="pr-grid">
                {PLANES.map((p) => {
                    const anual = precioAnualMensualizado(p.precioMensual);
                    return (
                        <article class:list={['plan reveal', { 'plan-featured': p.destacado }]}>
                            <div class="plan-head">
                                <h3 class="plan-name">{p.nombre}</h3>
                                <div class="plan-price-wrap">
                                    {p.precioMensual === 0 ? (
                                        <div class="plan-price">
                                            <span class="editorial plan-amount">$0</span>
                                        </div>
                                    ) : (
                                        <div class="plan-price" data-monthly={money0(p.precioMensual)} data-annual={money0(anual)}>
                                            <span class="editorial plan-amount plan-amount-val">{money0(p.precioMensual)}</span>
                                            <span class="plan-cycle">{isEn ? 'USD / mo' : 'MXN / mes'}</span>
                                        </div>
                                    )}
                                </div>
                                
                                <p class="plan-tagline">{p.tagline}</p>

                                {p.precioMensual > 0 && (
                                    <div class="plan-billing-toggle">
                                        <label class="toggle-switch">
                                            <input type="checkbox" class="billing-toggle-checkbox" />
                                            <span class="toggle-slider"></span>
                                        </label>
                                        <span class="toggle-label">{isEn ? 'Billed yearly' : 'Cobro anual'}</span>
                                    </div>
                                )}
                            </div>
                            
                            <div class="plan-feats-wrap">
                                <p class="plan-feats-title">{p.id === 'free' ? (isEn ? 'Includes:' : 'Incluye:') : (isEn ? 'Everything above +' : 'Todo lo anterior +')}</p>
                                <ul class="plan-feats">
                                    {p.feats.map((f) => (
                                        <li>
                                            <div class="pf-check">
                                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                                </svg>
                                            </div>
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            
                            <div class="plan-footer">
                                <a
                                    href={p.precioMensual === 0
                                        ? p.ctaHref
                                        : `/registro?redirect_url=${encodeURIComponent(`/app/checkout?plan=${p.id}&cycle=mensual`)}`}
                                    data-cta-plan={p.precioMensual === 0 ? undefined : p.id}
                                    data-base-href={`/registro?redirect_url=${encodeURIComponent(`/app/checkout?plan=${p.id}`)}`}
                                    class:list={['plan-cta', p.destacado ? 'plan-cta-solid' : 'plan-cta-ghost']}
                                >{p.ctaLabel}</a>
                            </div>
                        </article>
                    );
                })}
            </div>"""

content = content.replace(grid_old, grid_new)

# Replace the JS
script_old = """<script>
    document.addEventListener('DOMContentLoaded', () => {
        const isEn = document.documentElement.lang === 'en';
        // ── Toggle mensual/anual ──
        const toggle = document.querySelector<HTMLElement>('.pr-toggle');
        const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('.pr-toggle-btn'));
        const amounts = Array.from(document.querySelectorAll<HTMLElement>('.plan-amount[data-mensual]'));
        const billed = Array.from(document.querySelectorAll<HTMLElement>('[data-billed]'));
        const fmt = (n: number) => '$' + new Intl.NumberFormat('es-MX').format(n);

        const setCycle = (cycle: string) => {
            if (toggle) toggle.dataset.cycle = cycle;
            btns.forEach((b) => {
                const on = b.dataset.cycle === cycle;
                b.classList.toggle('is-active', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            amounts.forEach((el) => {
                const v = cycle === 'anual' ? el.dataset.anual : el.dataset.mensual;
                if (v) el.textContent = fmt(parseInt(v, 10));
            });
            billed.forEach((el) => { el.textContent = cycle === 'anual' ? (isEn ? 'billed annually' : 'facturado anual') : (isEn ? 'billed monthly' : 'facturado mensual'); });
            // Arrastra el ciclo elegido al CTA → checkout del plan correcto.
            document.querySelectorAll<HTMLAnchorElement>('[data-cta-plan]').forEach((a) => {
                const dest = `/app/checkout?plan=${a.dataset.ctaPlan}&cycle=${cycle}`;
                a.href = `/registro?redirect_url=${encodeURIComponent(dest)}`;
            });
        };
        btns.forEach((b) => b.addEventListener('click', () => setCycle(b.dataset.cycle || 'mensual')));

        // ── Calculadora de valor ──"""

script_new = """<script>
    document.addEventListener('DOMContentLoaded', () => {
        const isEn = document.documentElement.lang === 'en';
        
        // ── Toggle mensual/anual ──
        const toggles = document.querySelectorAll('.billing-toggle-checkbox');
        
        toggles.forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const isAnnual = (e.target as HTMLInputElement).checked;
                
                // Sync all toggles
                toggles.forEach(t => {
                    if (t !== e.target) {
                        (t as HTMLInputElement).checked = isAnnual;
                    }
                });

                // Update prices
                document.querySelectorAll('.plan-price').forEach(priceDiv => {
                    const monthly = priceDiv.getAttribute('data-monthly');
                    const annual = priceDiv.getAttribute('data-annual');
                    if (monthly && annual) {
                        const valSpan = priceDiv.querySelector('.plan-amount-val');
                        if (valSpan) valSpan.textContent = isAnnual ? annual : monthly;
                    }
                });

                // Update CTA hrefs
                document.querySelectorAll('.plan-cta').forEach(cta => {
                    const baseHref = cta.getAttribute('data-base-href');
                    if (baseHref) {
                        const cycle = isAnnual ? 'anual' : 'mensual';
                        cta.setAttribute('href', `${baseHref}&cycle=${cycle}`);
                    }
                });
            });
        });

        // ── Calculadora de valor ──"""

content = content.replace(script_old, script_new)

with open('src/pages/precios.astro', 'w') as f:
    f.write(content)
