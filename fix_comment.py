import re

file_path = 'src/pages/soluciones/startups.astro'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('<!-- ── STARTUP USE CASES ── -->', '')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done removing HTML comment")
