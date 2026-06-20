import re

with open('/Users/andrevalleortega/Desktop/flouvia-cord/src/components/producto/BlockMockup.astro', 'r') as f:
    content = f.read()

missing_css = """
    .bm-drop-info { flex: 1; display: flex; flex-direction: column; }
    .bm-drop-info b { font-size: 0.8rem; }
    .bm-check { color: #38bdf8; font-weight: bold; }
    .bm-totals-card { padding: 20px; }
    .bm-t-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; color: rgba(255,255,255,0.6); }
    .bm-t-row b { color: rgba(255,255,255,0.9); }
    .bm-t-div { height: 1px; background: rgba(255,255,255,0.1); margin: 12px 0; }
    .bm-t-final { font-size: 1rem; color: #fff; }
    .bm-t-final b { font-size: 1.2rem; color: #fff; }

    /* Componentes Link Público */
    .bm-chat { display: flex; flex-direction: column; gap: 12px; padding: 16px; background: #e5e7eb; color: #111827; }
    .bm-chat-bubble { background: #fff; padding: 12px; border-radius: 12px 12px 12px 0; font-size: 0.8rem; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    .bm-chat-link { display: flex; gap: 10px; background: #f3f4f6; border-left: 3px solid #38bdf8; border-radius: 6px 12px 12px 6px; }
    .bm-chat-link-img { width: 40px; height: 40px; background: #cbd5e1; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #475569; }
    .bm-chat-link-text { display: flex; flex-direction: column; }
    .bm-chat-link-text b { font-size: 0.8rem; color: #111827; }
    .bm-chat-link-text i { font-size: 0.7rem; color: #4b5563; }
    .bm-chat-link-text span { font-size: 0.65rem; color: #6b7280; margin-top: 4px; }
    .bm-cursor { width: 32px; height: 32px; color: #fff; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3)); }
    
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
    .bm-toast-success { display: flex; align-items: center; gap: 12px; background: rgba(16,185,129,0.15); border-color: rgba(16,185,129,0.3); padding: 12px 16px; border-radius: 12px; backdrop-filter: blur(12px); }
    .bm-check-circle { width: 28px; height: 28px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; }
    .bm-toast-success b { font-size: 0.85rem; display: block; color: #fff; }
    .bm-toast-success i { font-size: 0.7rem; color: rgba(255,255,255,0.7); }

    /* Componentes Seguimiento */
    .bm-notif { display: flex; align-items: center; gap: 16px; padding: 16px; }
    .bm-notif-icon { width: 40px; height: 40px; border-radius: 10px; background: rgba(56,189,248,0.1); display: flex; align-items: center; justify-content: center; }
    .bm-dot-pulse { width: 12px; height: 12px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 0 4px rgba(56,189,248,0.3); }
    .bm-notif-text b { font-size: 0.9rem; display: block; margin-bottom: 4px; }
    .bm-notif-text i { font-size: 0.75rem; }
    .bm-tl-active { opacity: 1; }
    .bm-tl-dot { width: 12px; height: 12px; border-radius: 50%; margin-top: 4px; z-index: 2; position: relative; }
    
    .bm-col-head b { color: rgba(255,255,255,0.9); margin-left: auto; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 10px; }
    .bm-board-ghost { height: 38px; border: 1px dashed rgba(255,255,255,0.1); border-radius: 8px; }

    .bm-sec-icon svg { width: 24px; height: 24px; }
    .bm-sec-info b { font-size: 0.9rem; display: block; margin-bottom: 4px; }
    .bm-sec-info i { font-size: 0.7rem; }
    .bm-sec-status { font-size: 0.7rem; font-weight: 700; color: #10b981; background: rgba(16,185,129,0.15); padding: 4px 10px; border-radius: 12px; margin-left: auto; }
    .bm-badge-cfdi { font-size: 0.7rem; font-weight: 700; background: rgba(16,185,129,0.15); color: #10b981; padding: 4px 8px; border-radius: 6px; display: flex; align-items: center; gap: 4px; }
    .bm-cli-info b { font-size: 0.95rem; display: block; }
"""

new_content = content.replace('</style>', missing_css + '\n</style>')

with open('/Users/andrevalleortega/Desktop/flouvia-cord/src/components/producto/BlockMockup.astro', 'w') as f:
    f.write(new_content)
