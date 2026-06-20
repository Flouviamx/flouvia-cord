import re

with open('/Users/andrevalleortega/Desktop/flouvia-cord/src/components/producto/BlockMockup.astro', 'r') as f:
    content = f.read()

# 1. Remove 'editorial' class from all elements
content = re.sub(r'\beditorial\b', '', content)
# Fix double spaces left by removal
content = content.replace('class=" "', '')
content = content.replace(' class=""', '')
content = content.replace('  ', ' ')

# 2. Bump CSS font sizes and contrast
# .bm-card span
content = content.replace('font-size: 0.65rem;', 'font-size: 0.75rem;')
content = content.replace('color: rgba(255,255,255,0.4);', 'color: rgba(255,255,255,0.7);')
# .bm-card b
content = content.replace('font-size: 0.85rem;', 'font-size: 0.95rem;')
content = content.replace('color: rgba(255,255,255,0.9);', 'color: #fff;')
# .bm-card i
content = content.replace('font-size: 0.75rem;', 'font-size: 0.8rem;')
content = content.replace('color: rgba(255,255,255,0.5);', 'color: rgba(255,255,255,0.75);')

# .bm-search
content = content.replace('font-size: 0.8rem;', 'font-size: 0.9rem;')

# .bm-drop-info b
content = content.replace('font-size: 0.8rem;', 'font-size: 0.9rem;')

# pills and chips contrast
content = content.replace('background: rgba(59,130,246,0.15); border-color: rgba(59,130,246,0.3); color: #60a5fa;', 'background: rgba(59,130,246,0.25); border-color: rgba(59,130,246,0.4); color: #fff;')
content = content.replace('background: rgba(56,189,248,0.15); color: #38bdf8;', 'background: rgba(56,189,248,0.2); color: #bae6fd;')
content = content.replace('background: rgba(148,163,184,0.15); color: #cbd5e1;', 'background: rgba(148,163,184,0.2); color: #f1f5f9;')
content = content.replace('background: rgba(16,185,129,0.15); color: #10b981;', 'background: rgba(16,185,129,0.2); color: #a7f3d0;')
content = content.replace('background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.3);', 'background: rgba(56,189,248,0.2); border: 1px solid rgba(56,189,248,0.4);')

# specific sizes
content = content.replace('.bm-col-head { font-size: 0.7rem;', '.bm-col-head { font-size: 0.8rem;')
content = content.replace('font-size: 11px;', 'font-size: 12px;')
content = content.replace('.bm-cfdi-foot { margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.7rem;', '.bm-cfdi-foot { margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.8rem;')
content = content.replace('.bm-cli-stats b { display: block; font-size: 0.9rem;', '.bm-cli-stats b { display: block; font-size: 1rem;')

with open('/Users/andrevalleortega/Desktop/flouvia-cord/src/components/producto/BlockMockup.astro', 'w') as f:
    f.write(content)
