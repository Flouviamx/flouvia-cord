const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

function processFiles() {
  const docsDir = path.join(__dirname, '..', 'src', 'content', 'docs');
  
  walkDir(docsDir, (filePath) => {
    if (filePath.endsWith('.md')) {
      let content = fs.readFileSync(filePath, 'utf8');
      let changed = false;
      
      const blocks = content.split('\n\n');
      const newBlocks = blocks.map(block => {
        if (!block.startsWith('> ')) return block;
        
        const lines = block.split('\n');
        // Ensure all lines start with >
        if (!lines.every(line => line.startsWith('>'))) return block;
        
        const cleanText = lines.map(line => line.replace(/^>\s?/, '')).join('\n');
        
        const lowerText = cleanText.toLowerCase();
        let type = '';
        if (lowerText.startsWith('**nota:**') || lowerText.startsWith('nota:') || lowerText.startsWith('tip:')) {
          type = 'info';
        } else if (lowerText.startsWith('**importante:**') || lowerText.startsWith('importante:') || lowerText.startsWith('**advertencia:**') || lowerText.startsWith('advertencia:')) {
          type = 'warning';
        } else if (lowerText.startsWith('**éxito:**') || lowerText.startsWith('éxito:') || lowerText.startsWith('**exito:**') || lowerText.startsWith('exito:')) {
          type = 'success';
        }
        
        if (type) {
          changed = true;
          return `<Callout type="${type}">\n${cleanText}\n</Callout>`;
        }
        
        return block;
      });
      
      const finalContent = newBlocks.join('\n\n');
      
      const newPath = filePath.replace(/\.md$/, '.mdx');
      fs.writeFileSync(newPath, finalContent, 'utf8');
      
      if (newPath !== filePath) {
         fs.unlinkSync(filePath);
      }
      console.log(`Migrated: ${newPath}`);
    }
  });
}

processFiles();
