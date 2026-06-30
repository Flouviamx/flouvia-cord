import re

with open('src/pages/precios.astro', 'r') as f:
    content = f.read()

# 1. Update the checkmark logic and styling
table_cells_old = """                                        {([r.free, r.starter, r.pro, r.scale, r.developer] as const).map((v, idx) => (
                                            <td class:list={['pr-cell-val', { 'is-featured': idx === 2 }]}>
                                                {v === true ? (
                                                    <span class="pr-yes" aria-label={isEn ? "Included" : "Incluido"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
                                                ) : v === false ? (
                                                    <span class="pr-no" aria-label={isEn ? "Not included" : "No incluido"}>—</span>
                                                ) : (
                                                    <span class="pr-txt">{v}</span>
                                                )}
                                            </td>
                                        ))}"""

table_cells_new = """                                        {([r.free, r.starter, r.pro, r.scale, r.developer] as const).map((v, idx) => {
                                            const isText = typeof v === 'string';
                                            const isIncluded = v === true || (isText && v !== 'Tope duro' && v !== 'Hard limit' && !String(v).includes('$'));
                                            return (
                                            <td class:list={['pr-cell-val', { 'is-featured': idx === 2 }]}>
                                                <div class="pr-cell-content">
                                                    {isIncluded && (
                                                        <span class="pr-yes" aria-label={isEn ? "Included" : "Incluido"}>
                                                            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M7 14A7 7 0 1 0 7 0a7 7 0 0 0 0 14Zm-2.3-4.8L2.2 6.7l1.4-1.4 1.1 1.1 3.7-3.7 1.4 1.4-5.1 5.1Z"/></svg>
                                                        </span>
                                                    )}
                                                    {v === false ? (
                                                        <span class="pr-no" aria-label={isEn ? "Not included" : "No incluido"}></span>
                                                    ) : isText ? (
                                                        <span class="pr-txt">{v}</span>
                                                    ) : null}
                                                </div>
                                            </td>
                                        )})}"""

content = content.replace(table_cells_old, table_cells_new)

# 2. Update CSS
css_old = """    /* ════════ COMPARADOR ════════ */
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

css_new = """    /* ════════ COMPARADOR TOP-TIER (ESTILO LINEAR) ════════ */
    .pr-compare { max-width: 1140px; margin: 0 auto; padding: 4rem 5% 8rem; }
    @media (min-width: 860px) { .pr-compare { padding: 8rem 5% 10rem; } }
    .pr-compare-head { display: none; }
    
    .pr-table-scroll { 
        overflow-x: auto; -webkit-overflow-scrolling: touch; 
        padding-bottom: 2rem;
    }
    
    .pr-table { 
        width: 100%; border-collapse: collapse; min-width: 920px; 
        table-layout: fixed;
    }
    
    /* Header row (Sticky + Frosted Glass) */
    .pr-table thead th { 
        position: sticky; top: 0; 
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        z-index: 10; 
        padding: 1.5rem 1rem 1.5rem 0;
        border-bottom: 1px solid rgba(0,0,0,0.06);
    }
    @media (prefers-color-scheme: dark) {
        /* Ajuste por si el usuario cambia el SO, aunque estemos en modo claro forzado, aseguramos el diseño */
        :root[data-theme="light"] .pr-table thead th {
            background: rgba(255, 255, 255, 0.85);
        }
    }
    
    .pr-th-feat { 
        width: 32%; text-align: left; 
        font-size: 1.4rem; font-weight: 500; color: var(--color-text); 
        letter-spacing: -0.02em;
    }
    .pr-th-plan {
        text-align: left; vertical-align: bottom;
        padding-left: 2rem;
    }
    .pr-th-plan b { 
        display: block; font-size: 1.4rem; font-weight: 500; 
        color: var(--color-text); letter-spacing: -0.02em; 
    }
    
    /* Rows & Hover */
    .pr-table tbody tr {
        transition: background 0.15s ease;
    }
    .pr-table tbody tr:not(.pr-group-row):hover {
        background: rgba(0,0,0,0.025);
    }
    
    /* Subtle horizontal borders inside sections */
    .pr-table tbody tr:not(.pr-group-row) td {
        border-bottom: 1px solid rgba(0,0,0,0.04);
    }
    .pr-table tbody tr:not(.pr-group-row):last-child td {
        border-bottom: none;
    }

    /* Group Row (Core, etc) */
    .pr-group-row td {
        padding: 5rem 0 1.5rem 0;
        font-size: 1.45rem; font-weight: 500;
        color: var(--color-text);
        letter-spacing: -0.02em;
        border-bottom: none !important;
    }
    
    /* Cells */
    .pr-cell-feat { 
        padding: 1.1rem 1rem 1.1rem 0; 
        font-size: 0.95rem; color: var(--color-text-muted); 
        font-weight: 400;
        border-right: 1px solid rgba(0,0,0,0.06);
        transition: color 0.15s;
    }
    .pr-table tbody tr:not(.pr-group-row):hover .pr-cell-feat {
        color: var(--color-text);
    }
    
    .pr-cell-val {
        padding: 1.1rem 0 1.1rem 2rem; 
        text-align: left; 
        border-right: 1px solid rgba(0,0,0,0.06);
    }
    .pr-cell-val:last-child {
        border-right: none;
    }
    
    .pr-cell-content {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    /* Checkmarks and Text */
    .pr-yes {
        display: inline-flex; flex-shrink: 0;
        color: var(--color-text);
        opacity: 0.9;
    }
    .pr-no { display: none; }
    .pr-txt { 
        font-size: 0.92rem; 
        color: var(--color-text-muted); 
        line-height: 1.3;
        font-weight: 400;
    }"""

content = content.replace(css_old, css_new)

with open('src/pages/precios.astro', 'w') as f:
    f.write(content)
