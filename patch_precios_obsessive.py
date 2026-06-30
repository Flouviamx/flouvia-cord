import re

with open('src/pages/precios.astro', 'r') as f:
    content = f.read()

# I will rewrite the entire CSS block for the table from scratch to be absolutely pixel-perfect to Linear's light mode equivalent.
css_old_pattern = r'/\* ════════ COMPARADOR TOP-TIER.*?/\* ════════ FAQ'
css_new = """/* ════════ COMPARADOR TOP-TIER (ESTILO LINEAR) ════════ */
    .pr-compare { 
        max-width: 1100px; margin: 0 auto; padding: 4rem 5% 8rem; 
        font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    @media (min-width: 860px) { .pr-compare { padding: 6rem 5% 10rem; } }
    .pr-compare-head { display: none; }
    
    .pr-table-scroll { 
        overflow-x: auto; 
        -webkit-overflow-scrolling: touch; 
        padding-bottom: 2rem;
    }
    
    .pr-table { 
        width: 100%; 
        border-collapse: separate; 
        border-spacing: 0;
        min-width: 920px; 
        table-layout: fixed;
    }
    
    /* Sticky Header */
    .pr-table thead th { 
        position: sticky; top: 0; 
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        z-index: 10; 
        padding: 1.2rem 1.5rem 1.8rem 1.5rem;
        border-bottom: 1px solid rgba(0,0,0,0.08);
    }
    
    .pr-th-feat { 
        width: 26%; text-align: left; 
        font-size: 1.35rem; font-weight: 600; color: var(--color-text); 
        letter-spacing: -0.015em;
        padding-left: 0 !important;
    }
    .pr-th-plan {
        text-align: left; vertical-align: bottom;
    }
    .pr-th-plan b { 
        display: block; font-size: 1.35rem; font-weight: 600; 
        color: var(--color-text); letter-spacing: -0.015em; 
    }
    
    /* Rows & Hover */
    .pr-table tbody tr {
        transition: background-color 0.2s ease;
    }
    .pr-table tbody tr:not(.pr-group-row):hover {
        background-color: rgba(0,0,0,0.02);
    }
    
    /* Horizontal borders */
    .pr-table tbody tr:not(.pr-group-row) td {
        border-bottom: 1px solid rgba(0,0,0,0.04);
    }
    .pr-table tbody tr:not(.pr-group-row):last-child td {
        border-bottom: none;
    }

    /* Group Row (Core, etc) */
    .pr-group-row td {
        padding: 4.5rem 0 1.2rem 0;
        font-size: 1.35rem; font-weight: 600;
        color: var(--color-text);
        letter-spacing: -0.015em;
        border-bottom: none !important;
    }
    
    /* Feature Name Cell */
    .pr-cell-feat { 
        padding: 1.1rem 1.5rem 1.1rem 0; 
        font-size: 0.9rem; 
        color: rgba(0,0,0,0.55); /* Muted slate color like Linear */
        font-weight: 500;
        border-right: 1px solid rgba(0,0,0,0.05); /* Faint vertical divider */
        transition: color 0.2s ease;
    }
    .pr-table tbody tr:not(.pr-group-row):hover .pr-cell-feat {
        color: rgba(0,0,0,0.85);
    }
    
    /* Value Cell */
    .pr-cell-val {
        padding: 1.1rem 1.5rem; 
        text-align: left; 
        border-right: 1px solid rgba(0,0,0,0.05);
    }
    .pr-cell-val:last-child {
        border-right: none;
    }
    
    .pr-cell-content {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    /* Checkmarks and Text */
    .pr-yes {
        display: inline-flex; flex-shrink: 0;
        color: var(--color-text);
    }
    .pr-no { display: none; }
    .pr-txt { 
        font-size: 0.9rem; 
        color: rgba(0,0,0,0.65); 
        line-height: 1.4;
        font-weight: 500;
    }

    /* ════════ FAQ"""

content = re.sub(css_old_pattern, css_new, content, flags=re.DOTALL)

with open('src/pages/precios.astro', 'w') as f:
    f.write(content)
