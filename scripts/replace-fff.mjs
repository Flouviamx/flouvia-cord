import fs from 'fs';
import path from 'path';
import { globSync } from 'glob'; // Not installed maybe?

const files = [
  ...fs.readdirSync('./src/pages/app/ajustes').filter(f => f.endsWith('.astro')).map(f => `./src/pages/app/ajustes/${f}`),
  './src/pages/app/cotizaciones/nueva.astro',
  './src/pages/app/cotizaciones/[id]/editar.astro',
  './src/pages/app/checkout.astro'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    // We only want to replace background: #fff and background: #ffffff
    // We also might want to replace background-color: #fff
    const newContent = content
      .replace(/background:\s*#ffffff;/gi, 'background: var(--surface);')
      .replace(/background:\s*#fff;/gi, 'background: var(--surface);')
      .replace(/background-color:\s*#ffffff;/gi, 'background-color: var(--surface);')
      .replace(/background-color:\s*#fff;/gi, 'background-color: var(--surface);');
      
    if (content !== newContent) {
      fs.writeFileSync(file, newContent);
      console.log(`Updated ${file}`);
    }
  }
}
