import re

files = [
    'src/pages/casos-de-uso/comercializadoras.astro',
    'src/pages/casos-de-uso/saas.astro',
    'src/pages/casos-de-uso/software-factory.astro',
]

for file_path in files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # insert .uc-hero-trust-group CSS
    group_css = '''    .uc-hero-trust-group {
        position: relative;
        overflow: hidden;
        background: #ffffff;
    }

    .uc-hero {'''
    
    if '.uc-hero-trust-group' not in content:
        content = content.replace('    .uc-hero {', group_css, 1)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Done")
