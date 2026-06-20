import re

with open('/Users/andrevalleortega/Desktop/flouvia-cord/src/components/producto/BlockMockup.astro', 'r') as f:
    content = f.read()

# Replace the style block
style_start = content.find('<style>')
if style_start != -1:
    content = content[:style_start]

new_style = """<style>
    /* Contenedor principal */
    .bm-wrap {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        perspective: 1200px;
        padding: 3rem 0; 
        min-width: 0;
    }

    .bm-glow {
        position: absolute;
        width: 250px;
        height: 250px;
        background: radial-gradient(circle, rgba(14,165,233,0.15) 0%, rgba(99,102,241,0.1) 40%, transparent 70%);
        filter: blur(45px);
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 0;
        animation: bm-pulse-glow 4s ease-in-out infinite;
    }

    .bm-stage {
        position: relative;
        width: 100%;
        max-width: 340px; /* Fixed from 280px to allow inner cards to breathe */
        margin: 0 auto;
        z-index: 1;
        transform-style: preserve-3d;
    }

    .bm-floating {
        position: absolute;
        z-index: 10;
        box-shadow: 0 25px 50px -12px rgba(4,11,20,0.8);
        border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .bm-card {
        background: linear-gradient(135deg, rgba(30,41,59,0.85), rgba(15,23,42,0.95));
        border-radius: 16px;
        padding: 20px;
        color: #f8fafc;
        box-shadow: 0 30px 60px -12px rgba(4,11,20,0.85), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.5);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(255,255,255,0.05);
        width: 100%;
    }

    .bm-row { display: flex; justify-content: space-between; margin-bottom: 12px; gap: 12px; }
    .bm-row:last-child { margin-bottom: 0; }
    .bm-row-align-center { align-items: center; }
    .bm-col { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
    .bm-col-right { display: flex; flex-direction: column; gap: 4px; text-align: right; flex: 1; min-width: 0; }
    
    .bm-card span { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.4); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bm-card b { font-size: 0.85rem; color: rgba(255,255,255,0.9); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bm-card i { font-size: 0.75rem; color: rgba(255,255,255,0.5); font-style: normal; }
    .bm-strike { text-decoration: line-through; color: rgba(255,255,255,0.3) !important; }

    .bm-row-edit {
        background: rgba(16,185,129,0.1);
        padding: 12px;
        border-radius: 12px;
        margin: -4px;
        border: 1px solid rgba(16,185,129,0.2);
    }
    
    .bm-search {
        background: rgba(30,41,59,0.8);
        border: 1px solid rgba(255,255,255,0.05);
        padding: 12px 16px; border-radius: 12px; display: flex; align-items: center; gap: 10px;
        color: rgba(255,255,255,0.5); font-size: 0.8rem;
    }
    .bm-search svg { width: 16px; height: 16px; }
    
    .bm-dropdown { padding: 8px; display: flex; flex-direction: column; gap: 4px; }
    .bm-drop-item { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 10px; }
    .bm-drop-selected { background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.3); }
    .bm-avatar { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800; flex-shrink: 0; color: #fff; }
    
    .bm-bg-blue { background: #3b82f6; }
    .bm-bg-gray { background: #4b5563; }
    .bm-bg-green { background: #10b981; }
    .bm-bg-yellow { background: #f59e0b; }
    
    .bm-pill {
        background: rgba(30,41,59,0.95); padding: 6px 12px; border-radius: 20px;
        font-size: 0.7rem; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 6px;
    }
    .bm-pill-blue { background: rgba(59,130,246,0.15); border-color: rgba(59,130,246,0.3); color: #60a5fa; }
    .bm-pill-red { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); color: #f87171; }
    .bm-dot { width: 6px; height: 6px; border-radius: 50%; }

    .bm-timeline { display: flex; flex-direction: column; gap: 16px; background: rgba(17,24,39,0.85); padding: 20px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); }
    .bm-tl-item { display: flex; gap: 16px; position: relative; opacity: 0.5; }
    .bm-tl-item:not(:last-child)::after { content: ''; position: absolute; top: 16px; left: 5px; width: 2px; height: 100%; background: rgba(255,255,255,0.1); }
    .bm-tl-content b { display: block; font-size: 0.85rem; color: #fff; }
    .bm-tl-content i { font-size: 0.75rem; }

    .bm-board { display: flex; gap: 12px; }
    .bm-board-col { flex: 1; background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); }
    .bm-col-head { font-size: 0.7rem; font-weight: 600; color: rgba(255,255,255,0.6); display: flex; align-items: center; gap: 6px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .bm-board-card { background: rgba(17,24,39,0.9); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); font-size: 0.75rem; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px rgba(0,0,0,0.2); }
    .bm-card-green { border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.05); }

    .bm-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: bm-spin 1s linear infinite; }
    
    .bm-security { display: flex; align-items: center; gap: 16px; padding: 20px; }
    .bm-sec-icon { width: 48px; height: 48px; border-radius: 12px; background: rgba(16,185,129,0.1); color: #10b981; display: flex; align-items: center; justify-content: center; }
    
    .bm-blue { color: #38bdf8; }
    .bm-green { color: #10b981; }
    .bm-gray { color: #94a3b8; }
    .bm-dark { color: #cbd5e1; }

    .bm-chip-green { background: rgba(16,185,129,0.15); color: #10b981; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; border: 1px solid rgba(16,185,129,0.2); }
    .bm-chip-blue { background: rgba(56,189,248,0.15); color: #38bdf8; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; border: 1px solid rgba(56,189,248,0.2); }
    .bm-chip-gray { background: rgba(148,163,184,0.15); color: #cbd5e1; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    
    .bm-cfdi-foot { margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.7rem; display: flex; gap: 8px; }
    .bm-cfdi-foot b { color: rgba(255,255,255,0.8); font-family: monospace; letter-spacing: 0.5px; }

    .bm-cli-head { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
    .bm-cli-stats { display: flex; gap: 12px; }
    .bm-cli-stats > div { flex: 1; background: rgba(255,255,255,0.04); padding: 10px; border-radius: 8px; min-width: 0; }
    .bm-cli-stats b { display: block; font-size: 0.9rem; margin-top: 4px; color: #60a5fa; }
    
    .bm-credit-card { padding: 20px; }
    .bm-cred-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
    .bm-cred-amount { font-size: 0.9rem; color: rgba(255,255,255,0.9); font-weight: 600; }
    .bm-cred-bar-bg { height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; margin-bottom: 12px; }
    .bm-cred-bar-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #f59e0b); border-radius: 4px; animation: bm-fill-bar 2s ease-out infinite alternate; }
    .bm-cred-foot { display: flex; justify-content: space-between; font-size: 0.75rem; }
    .bm-alert-text { color: #f59e0b; font-weight: 600; }

    .bm-rel-card { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
    .bm-rel-row { display: flex; gap: 16px; align-items: center; }
    .bm-rel-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
    .bm-rel-icon svg { width: 20px; height: 20px; }
    .bm-rel-text b { font-size: 0.9rem; display: block; margin-bottom: 4px; }
    .bm-rel-line { height: 1px; background: rgba(255,255,255,0.1); margin-left: 56px; }

    .bm-drop-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .bm-drop-info b { font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bm-check { color: #38bdf8; font-weight: bold; }
    
    .bm-totals-card { padding: 20px; }
    .bm-t-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; color: rgba(255,255,255,0.6); }
    .bm-t-row b { color: rgba(255,255,255,0.9); }
    .bm-t-div { height: 1px; background: rgba(255,255,255,0.1); margin: 12px 0; }
    .bm-t-final { font-size: 1rem; color: #fff; }
    .bm-t-final b { font-size: 1.2rem; color: #fff; }

    .bm-chat { display: flex; flex-direction: column; gap: 12px; padding: 16px; background: rgba(15,23,42,0.95); color: #fff; border-radius: 16px; }
    .bm-chat-bubble { background: rgba(30,41,59,0.9); padding: 12px; border-radius: 12px 12px 12px 0; font-size: 0.8rem; border: 1px solid rgba(255,255,255,0.05); }
    .bm-chat-link { display: flex; gap: 10px; background: rgba(15,23,42,0.95); border-left: 3px solid #38bdf8; border-radius: 6px 12px 12px 6px; padding: 8px; border: 1px solid rgba(255,255,255,0.05); }
    .bm-chat-link-img { width: 40px; height: 40px; background: rgba(255,255,255,0.1); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: rgba(255,255,255,0.8); }
    .bm-chat-link-text { display: flex; flex-direction: column; min-width: 0; }
    .bm-chat-link-text b { font-size: 0.8rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bm-chat-link-text i { font-size: 0.7rem; color: rgba(255,255,255,0.6); }
    .bm-chat-link-text span { font-size: 0.65rem; color: rgba(255,255,255,0.4); margin-top: 4px; }
    
    .bm-cursor { width: 32px; height: 32px; color: #fff; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3)); animation: bm-float-fast 2s infinite alternate; }
    
    .bm-brand-head { display: flex; align-items: center; gap: 12px; }
    .bm-brand-line { height: 1px; background: rgba(255,255,255,0.1); margin: 16px 0; }
    .bm-brand-title { font-size: 0.9rem; }
    .bm-color-picker { display: flex; gap: 6px; background: rgba(17,24,39,0.9); padding: 8px; border-radius: 20px; }
    .bm-swatch { width: 24px; height: 24px; border-radius: 50%; }
    
    .bm-approve-card { text-align: center; padding: 24px 16px; }
    .bm-approve-total { margin-bottom: 24px; }
    .bm-approve-total span { display: block; margin-bottom: 8px; }
    .bm-approve-total b { font-size: 1.8rem; }
    .bm-btn-approve { background: #fff; color: #0f172a; padding: 12px; border-radius: 10px; font-weight: 700; font-size: 0.9rem; margin-bottom: 12px; }
    .bm-btn-reject { color: rgba(255,255,255,0.6); font-size: 0.85rem; font-weight: 600; }
    .bm-toast-success { display: flex; align-items: center; gap: 12px; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); padding: 12px 16px; border-radius: 12px; backdrop-filter: blur(12px); }
    .bm-check-circle { width: 28px; height: 28px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; }
    .bm-toast-success b { font-size: 0.85rem; display: block; color: #fff; }
    .bm-toast-success i { font-size: 0.7rem; color: rgba(255,255,255,0.7); }

    .bm-notif { display: flex; align-items: center; gap: 16px; padding: 16px; }
    .bm-notif-icon { width: 40px; height: 40px; border-radius: 10px; background: rgba(56,189,248,0.1); display: flex; align-items: center; justify-content: center; }
    .bm-dot-pulse { width: 12px; height: 12px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 0 4px rgba(56,189,248,0.3); animation: bm-pulse-ring 2s infinite; }
    .bm-notif-text { min-width: 0; flex: 1; }
    .bm-notif-text b { font-size: 0.9rem; display: block; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bm-notif-text i { font-size: 0.75rem; color: rgba(255,255,255,0.6); }
    .bm-tl-active { opacity: 1; }
    .bm-tl-dot { width: 12px; height: 12px; border-radius: 50%; margin-top: 4px; z-index: 2; position: relative; }
    
    .bm-col-head b { color: rgba(255,255,255,0.9); margin-left: auto; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 10px; }
    .bm-board-ghost { height: 38px; border: 1px dashed rgba(255,255,255,0.1); border-radius: 8px; }

    .bm-sec-icon svg { width: 24px; height: 24px; }
    .bm-sec-info b { font-size: 0.9rem; display: block; margin-bottom: 4px; }
    .bm-sec-info i { font-size: 0.7rem; color: rgba(255,255,255,0.6); }
    .bm-sec-status { font-size: 0.7rem; font-weight: 700; color: #10b981; background: rgba(16,185,129,0.15); padding: 4px 10px; border-radius: 12px; margin-left: auto; }
    .bm-badge-cfdi { font-size: 0.7rem; font-weight: 700; background: rgba(16,185,129,0.15); color: #10b981; padding: 4px 8px; border-radius: 6px; display: flex; align-items: center; gap: 4px; }
    .bm-cli-info b { font-size: 0.95rem; display: block; }

    /* Video-like infinite animations */
    @keyframes bm-spin { to { transform: rotate(360deg); } }
    @keyframes bm-pulse-glow {
        0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
        50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
    }
    @keyframes bm-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
    }
    @keyframes bm-float-fast {
        0%, 100% { transform: translateY(0) translateX(0); }
        50% { transform: translateY(-6px) translateX(4px); }
    }
    @keyframes bm-pulse-ring {
        0% { box-shadow: 0 0 0 0 rgba(56,189,248,0.7); }
        70% { box-shadow: 0 0 0 10px rgba(56,189,248,0); }
        100% { box-shadow: 0 0 0 0 rgba(56,189,248,0); }
    }
    @keyframes bm-fill-bar {
        0% { width: 60%; }
        100% { width: 85%; }
    }

    /* Assign animations to elements */
    .bm-floating { animation: bm-float 4s ease-in-out infinite; }
    .bm-floating:nth-child(even) { animation: bm-float 5s ease-in-out infinite reverse; }

</style>
"""

# Now we also need to inject `class="bm-floating"` into any floating tags to make sure they float.
content = content.replace('class="bm-pill', 'class="bm-pill bm-floating')
# Wait, they are already bm-floating.
# Let's ensure the html is untouched, just the style block is fully replaced.
new_content = content + new_style

with open('/Users/andrevalleortega/Desktop/flouvia-cord/src/components/producto/BlockMockup.astro', 'w') as f:
    f.write(new_content)
