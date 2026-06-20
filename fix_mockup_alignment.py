import re

with open('/Users/andrevalleortega/Desktop/flouvia-cord/src/components/producto/BlockMockup.astro', 'r') as f:
    content = f.read()

# 1. Fix .bm-btn-approve centering
content = content.replace('.bm-btn-approve { background: #fff;', '.bm-btn-approve { display: flex; align-items: center; justify-content: center; background: #fff;')
content = content.replace('.bm-btn-reject { color: rgba(255,255,255,0.6);', '.bm-btn-reject { display: flex; align-items: center; justify-content: center; cursor: pointer; color: rgba(255,255,255,0.6);')

# 2. Add .bm-drop-price to fix dropdown alignment
if '.bm-drop-price' not in content:
    content = content.replace('.bm-check {', '.bm-drop-price { font-size: 0.95rem; font-weight: 700; color: #fff; margin-left: auto; }\n  .bm-check {')

# 3. Fix the cursor color so it is visible on white background
content = content.replace('class="bm-cursor-icon"><polygon', 'class="bm-cursor-icon" fill="currentColor" stroke="#fff"><polygon')
content = content.replace('.bm-cursor { width: 32px; height: 32px; color: #fff;', '.bm-cursor { width: 32px; height: 32px; color: #111827;')

# 4. Fix .bm-t-final alignment
content = content.replace('.bm-t-final { font-size: 1rem; color: #fff; }', '.bm-t-final { font-size: 1rem; color: #fff; align-items: center; }')

# 5. Fix badge alignment
content = content.replace('.bm-badge-cfdi {', '.bm-badge-cfdi { justify-content: center;')

# 6. Dropdown text fixes
content = content.replace('.bm-drop-info { flex: 1;', '.bm-drop-info { flex: 1; justify-content: center;')

with open('/Users/andrevalleortega/Desktop/flouvia-cord/src/components/producto/BlockMockup.astro', 'w') as f:
    f.write(content)
