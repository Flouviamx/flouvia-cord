import re

file_path = 'src/pages/soluciones/startups.astro'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Modify the structure
old_hero = '''        {solucion.slug === 'startups' ? (
            <header class="startup-hero">
                <div class="startup-hero-bg">
                    <QuantizedWaveBg client:only="react" />
                </div>
                
                <div class="startup-hero-content stripe-container">'''

new_hero = '''        {solucion.slug === 'startups' ? (
            <div class="startup-hero-trust-group">
                <div class="startup-hero-bg">
                    <QuantizedWaveBg client:only="react" />
                </div>
                
                <header class="startup-hero">
                
                <div class="startup-hero-content stripe-container">'''
content = content.replace(old_hero, new_hero)

# At the end of the `empresas` branch we have `)}`
# And then the STARTUP USE CASES section. We will move the use cases section INTO the `startups` branch.
# Wait! If we move it, the `empresas` branch will have its own end tag.
# Original structure:
#         {solucion.slug === 'startups' ? (
#               ... startups ...
#         ) : (
#               ... empresas ...
#         )}
#         <!-- ── STARTUP USE CASES ── -->
#         {solucion.useCases && (
#             <section class="startup-use-cases-section reveal">
#                  ...
#             </section>
#         )}

old_structure = '''        <!-- ── STARTUP USE CASES ── -->
        {solucion.useCases && (
            <section class="startup-use-cases-section reveal">'''

# I will replace `</header>\n        ) : (` with `</header>\n        <!-- ── STARTUP USE CASES ── -->\n        {solucion.useCases && (\n            <section class="startup-use-cases-section reveal">`
# No, wait. I can just do this:

import sys

idx_end_startups = content.find('</header>\n        ) : (')
if idx_end_startups == -1:
    print("Could not find end of startups branch")
    sys.exit(1)

idx_end_empresas = content.find('</header>\n        )}')
if idx_end_empresas == -1:
    print("Could not find end of empresas branch")
    sys.exit(1)

# Let's extract the USE CASES block completely.
start_uc = content.find('        <!-- ── STARTUP USE CASES ── -->')
end_uc = content.find('        <!-- ── STARTUP INTEGRATION TABS (Apple Style) ── -->')

if start_uc != -1 and end_uc != -1:
    use_cases_block = content[start_uc:end_uc]
    # Remove from original location
    content = content[:start_uc] + content[end_uc:]
    
    # Insert it right before `) : (`
    insert_pos = content.find('        ) : (\n            <header class="stripe-hero">')
    
    if insert_pos != -1:
        # we also need to close the `startup-hero-trust-group` div after the use cases.
        content = content[:insert_pos] + use_cases_block + '            </div>\n' + content[insert_pos:]


# CSS fixes
group_css = '''    .startup-hero-trust-group {
        position: relative;
        overflow: hidden;
        background: #f6f9fc;
    }

    .startup-hero {'''
content = content.replace('    .startup-hero {', group_css, 1)

content = re.sub(r'(\.startup-hero\s*\{[^}]*?)(\s*overflow:\s*hidden;)', r'\1', content)
content = re.sub(r'(\.startup-hero\s*\{[^}]*?)(\s*background:\s*#f6f9fc;\s*/\*\s*Stripe\s+light\s+bg\s*\*/)', r'\1', content)
content = re.sub(r'(\.startup-hero-bg\s*\{[^}]*?)(\s*background:\s*#f6f9fc;\s*/\*\s*fallback\s+mientras\s+carga\s+el\s+shader\s*\*/)', r'\1', content)

content = re.sub(r'(\.startup-use-cases-section\s*\{[^}]*?)(\s*background:\s*#f6f9fc;)', r'\1\n        position: relative;\n        z-index: 1;', content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done startups.astro restructuring")
