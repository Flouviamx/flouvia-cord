const fs = require('fs');
const path = './src/layouts/DocsLayout.astro';
let content = fs.readFileSync(path, 'utf8');

// 1. Add isOverviewPage logic
content = content.replace(
  "const getUrl = (path: string) => lang === 'en' ? `/en${path}` : path;",
  "const getUrl = (path: string) => lang === 'en' ? `/en${path}` : path;\n\nconst isOverviewPage = Astro.url.pathname.endsWith('/resumen') || Astro.url.pathname.endsWith('/resumen/') || Astro.url.pathname === '/docs' || Astro.url.pathname === '/docs/' || Astro.url.pathname === '/en/docs' || Astro.url.pathname === '/en/docs/';"
);

// 2. Condition ToC rendering
content = content.replace(
  "{headings && headings.length > 0 && (",
  "{headings && headings.length > 0 && !isOverviewPage && ("
);

// 3. Rename my added .content-container to .main-content-column
content = content.replace(
  '<div class="docs-content-area">\n          <div class="content-container">',
  '<div class="docs-content-area">\n          <div class="main-content-column">\n            <div class="content-container">'
);
content = content.replace(
  '          </div>\n          {headings && headings.length > 0 && !isOverviewPage && (',
  '            </div>\n          </div>\n          {headings && headings.length > 0 && !isOverviewPage && ('
);

// 4. Update my added CSS to target .main-content-column
content = content.replace(
  /\.content-container \{\n    flex: 1;\n    min-width: 0;\n    max-width: 800px;\n    padding: 32px 48px;\n  \}/,
  `.main-content-column {
    flex: 1;
    min-width: 0;
    max-width: 800px;
    padding: 64px 48px 120px;
  }`
);

// 5. Remove padding from .docs-main to avoid double padding
content = content.replace(
  /\.docs-main \{\n    flex: 1;\n    padding: 64px 48px 120px;\n    min-width: 0;\n  \}/,
  `.docs-main {
    flex: 1;
    min-width: 0;
  }`
);

content = content.replace(
  /\.docs-main \{\n      padding: 40px 24px 80px;\n    \}/g,
  `.main-content-column {
      padding: 40px 24px 80px;
    }`
);

// 6. Add body to Fuse keys
content = content.replace(
  "{ name: 'title', weight: 0.7 },\n          { name: 'description', weight: 0.3 }",
  "{ name: 'title', weight: 0.7 },\n          { name: 'description', weight: 0.3 },\n          { name: 'body', weight: 0.5 }"
);

fs.writeFileSync(path, content);
console.log('Fixed DocsLayout.');
