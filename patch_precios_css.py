import re

with open('src/pages/precios.astro', 'r') as f:
    content = f.read()

css_old = """    /* ════════ TARJETAS ════════ */
    .pr-grid-wrap { max-width: 1320px; margin: 0 auto; padding: 2rem 5% 1rem; }
    @media (min-width: 860px) { .pr-grid-wrap { padding: 3rem 5% 1rem; } }
    
    .pr-grid { 
        display: grid; grid-template-columns: 1fr; gap: 1rem; 
        max-width: 420px; margin: 0 auto; align-items: stretch; 
    }
    @media (min-width: 860px) {
        .pr-grid { grid-template-columns: repeat(3, 1fr); max-width: 100%; gap: 1rem; }
    }
    @media (min-width: 1180px) {
        .pr-grid { grid-template-columns: repeat(5, 1fr); gap: 0.85rem; }
    }

    .plan {
        position: relative; background: var(--color-bg-soft);
        border: 1px solid var(--color-border); border-radius: 20px;
        padding: 1.6rem 1.4rem; display: flex; flex-direction: column; gap: 1.2rem;
        transition: transform 0.5s var(--ease-spring), box-shadow 0.5s var(--ease-spring);
    }
    @media (min-width: 860px) {
        .plan { padding: 1.9rem 1.4rem; border-radius: 22px; }
    }
    .plan:hover { transform: translateY(-4px); box-shadow: 0 30px 70px -30px rgba(10,25,47,0.16); }
    
    .plan-featured {
        position: relative; z-index: 2;
        background: radial-gradient(ellipse at 50% 0%, #112240 0%, #0a192f 80%);
        border: none; color: #fff; transform: none;
    }
    @media (min-width: 1180px) {
        .plan-featured {
            box-shadow: 0 40px 90px -34px rgba(10,25,47,0.5); transform: scale(1.05);
        }
    }
    .plan-featured:hover { transform: translateY(-4px); }
    @media (min-width: 1180px) {
        .plan-featured:hover { transform: scale(1.05) translateY(-4px); }
    }

    .plan-ribbon {
        position: absolute; top: -11px; left: 50%; transform: translateX(-50%);
        background: var(--color-ok); color: #fff;
        font-size: 0.58rem; font-weight: 800; letter-spacing: 1px;
        padding: 5px 13px; border-radius: 100px; white-space: nowrap;
    }
    .plan-head { display: flex; flex-direction: column; gap: 0.35rem; min-height: 50px; }
    @media (min-width: 860px) { .plan-head { min-height: 64px; } }
    .plan-name { font-size: 1.15rem; font-weight: 700; margin: 0; letter-spacing: -0.4px; }
    .plan-tagline { font-size: 0.8rem; margin: 0; color: var(--color-text-muted); line-height: 1.35; }
    .plan-featured .plan-tagline { color: #8892b0; }
    .plan-price { display: flex; align-items: baseline; gap: 8px; min-height: 46px; }
    .plan-amount { font-size: 2.3rem; line-height: 1; color: var(--color-blue-deep); }
    .plan-featured .plan-amount { color: #fff; }
    .plan-cycle { display: flex; flex-direction: column; font-size: 0.82rem; color: var(--color-text-muted); font-weight: 500; }
    .plan-cycle .plan-billed { font-style: normal; font-size: 0.7rem; color: #99a2af; }
    .plan-featured .plan-cycle { color: #8892b0; }
    .plan-cta {
        text-align: center; text-decoration: none; font-size: 0.92rem; font-weight: 600;
        padding: 13px; border-radius: 12px;
        transition: transform 0.5s var(--ease-spring), background 0.4s, box-shadow 0.4s;
    }
    .plan-cta-ghost { color: var(--color-blue-deep); border: 1px solid var(--color-border); background: #fff; }
    .plan-cta-ghost:hover { transform: translateY(-2px); box-shadow: 0 12px 24px -12px rgba(10,25,47,0.2); }
    .plan-cta-solid { background: #fff; color: var(--color-blue-deep); box-shadow: 0 12px 28px -10px rgba(0,0,0,0.3); }
    .plan-cta-solid:hover { transform: translateY(-2px); }
    .plan-feats { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.7rem; }
    .plan-feats li { display: flex; align-items: flex-start; gap: 9px; font-size: 0.82rem; line-height: 1.35; color: var(--color-text); }
    .plan-featured .plan-feats li { color: #cdd5e0; }
    .pf-check {
        width: 19px; height: 19px; flex-shrink: 0;
        background: rgba(16,185,129,0.14); color: #059669; border-radius: 50%;
        display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700;
    }
    .plan-featured .pf-check { background: rgba(16,185,129,0.2); color: #34d399; }
    .pr-note { text-align: center; margin: 2rem 0 0; font-size: 0.98rem; color: var(--color-text-muted); }
    @media (min-width: 860px) { .pr-note { margin: 2.6rem 0 0; } }
    .pr-note a { color: var(--color-blue-deep); font-weight: 600; text-decoration: none; }
    .pr-note a:hover { text-decoration: underline; }"""

css_new = """    /* ════════ TARJETAS ════════ */
    .pr-grid-wrap { max-width: 1200px; margin: 0 auto; padding: 2rem 5% 1rem; }
    @media (min-width: 860px) { .pr-grid-wrap { padding: 3rem 5% 1rem; } }
    
    .pr-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 0;
        align-items: stretch;
        border-top: 1px solid var(--color-border);
        border-bottom: 1px solid var(--color-border);
    }

    .plan {
        position: relative;
        padding: 2.5rem 1.5rem;
        display: flex;
        flex-direction: column;
        border-right: 1px solid var(--color-border);
        background: transparent;
        transition: background 0.3s ease;
    }
    .plan:last-child {
        border-right: none;
    }
    .plan:hover {
        background: var(--color-bg-soft);
    }

    .plan-featured {
        background: rgba(var(--color-blue-rgb, 10, 37, 64), 0.02);
    }
    .plan-featured:hover {
        background: rgba(var(--color-blue-rgb, 10, 37, 64), 0.04);
    }
    .plan-featured::before {
        content: '';
        position: absolute;
        top: -1px;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--color-blue-deep, #0a192f);
        z-index: 1;
    }

    .plan-head { 
        display: flex; 
        flex-direction: column; 
        gap: 0.8rem; 
        margin-bottom: 2rem;
        min-height: 160px;
    }
    .plan-name { font-size: 1.15rem; font-weight: 600; margin: 0; color: var(--color-text); }
    
    .plan-price-wrap { display: flex; align-items: center; }
    .plan-price { display: flex; align-items: baseline; gap: 4px; }
    .plan-amount { font-size: 2.2rem; line-height: 1; color: var(--color-text); font-weight: 500; letter-spacing: -1px; }
    .plan-cycle { font-size: 0.9rem; color: var(--color-text-muted); display: flex; flex-direction: column; }
    .plan-cycle .plan-billed { font-style: normal; font-size: 0.7rem; color: var(--color-text-muted); opacity: 0.8; margin-top: -2px; }

    .plan-tagline { font-size: 0.9rem; margin: 0; color: var(--color-text-muted); line-height: 1.4; }

    .plan-billing-toggle {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 0.5rem;
    }
    .toggle-switch {
        position: relative;
        display: inline-block;
        width: 36px;
        height: 20px;
    }
    .toggle-switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }
    .toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: var(--color-border);
        transition: .4s;
        border-radius: 20px;
    }
    .toggle-slider:before {
        position: absolute;
        content: "";
        height: 14px;
        width: 14px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: .3s var(--ease-spring);
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    input:checked + .toggle-slider {
        background-color: var(--color-text);
    }
    input:checked + .toggle-slider:before {
        transform: translateX(16px);
    }
    .toggle-label {
        font-size: 0.85rem;
        color: var(--color-text-muted);
        font-weight: 500;
        cursor: pointer;
    }

    .plan-feats-wrap {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
    }
    .plan-feats-title {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-text);
        margin: 0 0 1rem 0;
    }
    .plan-feats { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.8rem; }
    .plan-feats li { display: flex; align-items: flex-start; gap: 10px; font-size: 0.85rem; line-height: 1.4; color: var(--color-text-muted); }
    .pf-check {
        width: 16px; height: 16px; flex-shrink: 0;
        color: var(--color-text);
        display: flex; align-items: center; justify-content: center;
        margin-top: 2px;
    }
    .pf-check svg { width: 12px; height: 12px; }

    .plan-footer {
        margin-top: 2.5rem;
    }
    .plan-cta {
        display: block;
        text-align: center;
        text-decoration: none;
        font-size: 0.95rem;
        font-weight: 500;
        padding: 10px;
        border-radius: 8px;
        transition: all 0.2s;
        width: 100%;
    }
    .plan-cta-ghost {
        color: var(--color-text);
        border: 1px solid var(--color-border);
        background: transparent;
    }
    .plan-cta-ghost:hover { background: var(--color-bg-soft); }
    .plan-cta-solid {
        background: var(--color-text);
        color: var(--color-bg, #fff);
    }
    .plan-cta-solid:hover { opacity: 0.9; }

    .pr-note { text-align: center; margin: 2rem 0 0; font-size: 0.95rem; color: var(--color-text-muted); }
    @media (min-width: 860px) { .pr-note { margin: 2.6rem 0 0; } }
    .pr-note a { color: var(--color-text); font-weight: 500; text-decoration: none; border-bottom: 1px solid var(--color-border); padding-bottom: 1px;}
    .pr-note a:hover { border-bottom-color: var(--color-text); }

    @media (max-width: 1180px) {
        .pr-grid {
            grid-template-columns: repeat(3, 1fr);
            border: none;
            gap: 1.5rem;
        }
        .plan {
            border: 1px solid var(--color-border);
            border-radius: 12px;
        }
        .plan-featured::before {
            border-radius: 12px 12px 0 0;
        }
    }
    @media (max-width: 860px) {
        .pr-grid {
            grid-template-columns: 1fr;
        }
    }"""

content = content.replace(css_old, css_new)

with open('src/pages/precios.astro', 'w') as f:
    f.write(content)
