import fs from 'fs';
import path from 'path';

const batchFile = process.argv[2];
if (!batchFile) {
  console.error("Please provide the batch JSON file path.");
  process.exit(1);
}

const dir = path.join(process.cwd(), 'src/content/support');
const contentMap = JSON.parse(fs.readFileSync(batchFile, 'utf-8'));

for (const [filename, newBody] of Object.entries(contentMap)) {
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${filename}, file not found.`);
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const frontmatterMatch = content.match(/^---([\s\S]*?)---/);
  if (!frontmatterMatch) {
    console.log(`Skipping ${filename}, no frontmatter found.`);
    continue;
  }
  
  const frontmatter = frontmatterMatch[1];
  const fullFile = `---${frontmatter}---\n\n${newBody}\n`;
  
  fs.writeFileSync(filePath, fullFile);
}

console.log(`Successfully applied ${Object.keys(contentMap).length} rewrites from ${batchFile}`);
