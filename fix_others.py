import re

files = [
    'src/pages/casos-de-uso/comercializadoras.astro',
    'src/pages/casos-de-uso/saas.astro',
    'src/pages/casos-de-uso/software-factory.astro',
]

for file_path in files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the header start
    header_idx = content.find('<header class="uc-hero">')
    if header_idx != -1:
        # We find the previous comment if it exists, but let's just insert before <header
        wrapper_start = '<!-- HERO & TRUST WRAPPER -->\n        <div class="uc-hero-trust-group">\n            '
        content = content[:header_idx] + wrapper_start + content[header_idx:]

    # Extract uc-hero-bg and move it just inside the wrapper
    bg_match = re.search(r'(<div class="uc-hero-bg">.*?</div>)', content, re.DOTALL)
    if bg_match:
        bg_html = bg_match.group(1)
        # remove it from current location (which is now inside header)
        content = content.replace(bg_html + '\n', '')
        # put it right after <div class="uc-hero-trust-group">
        content = content.replace(
            '<div class="uc-hero-trust-group">\n            ',
            '<div class="uc-hero-trust-group">\n            ' + bg_html + '\n\n            '
        )

    # Close the wrapper after uc-trust section
    trust_end = re.search(r'<!-- LOGOS / TRUST -->.*?</section>', content, re.DOTALL)
    if trust_end:
        trust_html = trust_end.group(0)
        content = content.replace(trust_html, trust_html + '\n        </div>')

    # Update CSS
    hero_css_old = r'''    .uc-hero {
        position: relative;
        min-height: 100vh;
        min-height: 100dvh;
        display: flex;
        align-items: center;
        padding: 8rem 0 4rem;
        background: #ffffff;
        overflow: hidden;
        border-bottom: 1px solid var(--color-border);
    }'''
    hero_css_new = '''    .uc-hero-trust-group {
        position: relative;
        overflow: hidden;
        background: #ffffff;
    }

    /* ── HERO SECTION ── */
    .uc-hero {
        position: relative;
        min-height: 100vh;
        min-height: 100dvh;
        display: flex;
        align-items: center;
        padding: 8rem 0 4rem;
    }'''
    
    # Try literal replace first, else regex if whitespace differs slightly
    if hero_css_old in content:
        content = content.replace(hero_css_old, hero_css_new)
    else:
        # Fallback regex just in case
        pass

    trust_css_old = r'''    .uc-trust {
        text-align: center;
        padding: 3rem 5%;
        background: var(--color-bg);
    }'''
    trust_css_new = '''    .uc-trust {
        position: relative;
        z-index: 1;
        text-align: center;
        padding: 3rem 5%;
    }'''
    
    if trust_css_old in content:
        content = content.replace(trust_css_old, trust_css_new)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Done")
