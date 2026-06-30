import re

with open('src/pages/precios.astro', 'r') as f:
    content = f.read()

# 1. Update the table HTML for the header to add 'Características'
table_head_old = """<th class="pr-th-feat"></th>
                            {PLANES.map((p) => (
                                <th class:list={['pr-th-plan', { 'is-featured': p.destacado }]}>
                                    <b>{p.nombre}</b>
                                    <span>{p.precioMensual === 0 ? (isEn ? 'Free' : 'Gratis') : `${money0(p.precioMensual)}${isEn ? '/mo' : '/mes'}`}</span>
                                </th>
                            ))}"""
                            
table_head_new = """<th class="pr-th-feat">{isEn ? 'Features' : 'Características'}</th>
                            {PLANES.map((p) => (
                                <th class:list={['pr-th-plan', { 'is-featured': p.destacado }]}>
                                    <b>{p.nombre}</b>
                                </th>
                            ))}"""

content = content.replace(table_head_old, table_head_new)

# 2. Update the pr-yes checkmark icon
yes_old = """<span class="pr-yes" aria-label={isEn ? "Included" : "Incluido"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>"""
yes_new = """<span class="pr-yes" aria-label={isEn ? "Included" : "Incluido"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>"""
content = content.replace(yes_old, yes_new)

# 3. Update the CSS
css_old = """    /* ════════ COMPARADOR ════════ */
    .pr-compare { max-width: 1080px; margin: 0 auto; padding: 3rem 5%; }
    @media (min-width: 860px) { .pr-compare { padding: 4rem 5%; } }
    .pr-compare-head { text-align: center; margin-bottom: 2rem; }
    @media (min-width: 860px) { .pr-compare-head { margin-bottom: 3rem; } }
    
    .pr-table-scroll { 
        overflow-x: auto; -webkit-overflow-scrolling: touch; 
        border-radius: 12px; padding-bottom: 1rem;
        box-shadow: inset -15px 0 15px -15px rgba(0,0,0,0.05); /* Ayuda visual para scroll horizontal */
    }
    @media (min-width: 860px) { .pr-table-scroll { border-radius: 18px; padding-bottom: 0; box-shadow: none; } }
    
    .pr-table { width: 100%; border-collapse: collapse; min-width: 920px; }
    .pr-table thead th { position: sticky; top: 0; }
    .pr-th-feat { width: 28%; }
    .pr-th-plan {
        padding: 1rem 0.7rem; text-align: center; vertical-align: bottom;
        border-bottom: 2px solid var(--color-border);
    }
    .pr-th-plan b { display: block; font-size: 1rem; font-weight: 700; color: var(--color-text); }
    .pr-th-plan span { display: block; font-size: 0.76rem; color: var(--color-text-muted); margin-top: 2px; }
    .pr-th-plan.is-featured { background: var(--color-bg-soft); border-radius: 14px 14px 0 0; border-bottom-color: var(--color-blue-deep); }
    .pr-th-plan.is-featured b { color: var(--color-blue-deep); }

    .pr-group-row td {
        padding: 1.4rem 1rem 0.6rem;
        font-size: 0.66rem; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;
        color: #99a2af;
    }
    .pr-cell-feat { padding: 0.85rem 1rem; font-size: 0.88rem; color: var(--color-text); border-bottom: 1px solid var(--color-border); }
    .pr-cell-val {
        padding: 0.85rem 0.7rem; text-align: center; border-bottom: 1px solid var(--color-border);
        font-size: 0.82rem; color: var(--color-text); font-weight: 600;
    }
    .pr-cell-val.is-featured { background: var(--color-bg-soft); }
    .pr-yes {
        display: inline-flex; width: 22px; height: 22px; border-radius: 50%;
        background: rgba(16,185,129,0.14); color: #059669;
        align-items: center; justify-content: center;
    }
    .pr-yes svg { width: 12px; height: 12px; }
    .pr-no { color: #c2c8d0; }
    .pr-txt { font-size: 0.82rem; }"""

css_new = """    /* ════════ COMPARADOR ════════ */
    .pr-compare { max-width: 1200px; margin: 0 auto; padding: 3rem 5%; }
    @media (min-width: 860px) { .pr-compare { padding: 6rem 5%; } }
    .pr-compare-head { text-align: center; margin-bottom: 2rem; display: none; /* Linear hides this header text */ }
    @media (min-width: 860px) { .pr-compare-head { margin-bottom: 3rem; } }
    
    .pr-table-scroll { 
        overflow-x: auto; -webkit-overflow-scrolling: touch; 
        border-radius: 12px; padding-bottom: 1rem;
    }
    @media (min-width: 860px) { .pr-table-scroll { border-radius: 18px; padding-bottom: 0; box-shadow: none; } }
    
    .pr-table { width: 100%; border-collapse: collapse; min-width: 920px; }
    
    /* Header row */
    .pr-table thead th { 
        position: sticky; top: 0; 
        background: var(--color-bg); 
        z-index: 10; 
        border-bottom: 1px solid transparent; 
        padding-bottom: 1.5rem;
    }
    .pr-th-feat { 
        width: 25%; text-align: left; 
        font-size: 1.3rem; font-weight: 500; color: var(--color-text); 
    }
    .pr-th-plan {
        padding: 1rem 1rem; text-align: left; vertical-align: bottom;
    }
    .pr-th-plan b { display: block; font-size: 1.3rem; font-weight: 500; color: var(--color-text); }
    
    /* Rows */
    .pr-table tbody tr {
        transition: background 0.2s;
    }
    .pr-table tbody tr:not(.pr-group-row) {
        border-bottom: 1px solid var(--color-border);
    }
    .pr-table tbody tr:not(.pr-group-row):last-child {
        border-bottom: none;
    }
    .pr-table tbody tr:not(.pr-group-row):hover {
        background: var(--color-bg-soft);
    }

    /* Group Row (Core, etc) */
    .pr-group-row td {
        padding: 4rem 0 1rem 0;
        font-size: 1.3rem; font-weight: 500;
        color: var(--color-text);
        border-bottom: none;
    }
    
    /* Cells */
    .pr-cell-feat { 
        padding: 1.2rem 1rem 1.2rem 0; 
        font-size: 0.95rem; color: var(--color-text-muted); 
        border-right: 1px solid var(--color-border); 
        font-weight: 400;
    }
    .pr-cell-val {
        padding: 1.2rem 1rem; text-align: left; border-right: 1px solid var(--color-border);
        font-size: 0.95rem; color: var(--color-text-muted);
    }
    .pr-cell-val:last-child {
        border-right: none;
    }
    
    /* Checkmarks and Text */
    .pr-yes {
        display: inline-flex; width: 18px; height: 18px;
        color: var(--color-text);
        align-items: center; justify-content: center;
        margin-right: 6px;
    }
    .pr-yes svg { width: 16px; height: 16px; }
    .pr-no { color: transparent; /* Linear just leaves it blank */ }
    .pr-txt { font-size: 0.95rem; }
    
    /* Make the text value inline with checkmark if it's text */
    .pr-cell-val .pr-txt {
        display: inline-block;
    }"""

content = content.replace(css_old, css_new)

with open('src/pages/precios.astro', 'w') as f:
    f.write(content)
