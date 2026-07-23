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
    if (filePath.endsWith('.mdx')) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Regex to match contiguous blockquotes, even with empty lines inside the blockquote
      // We look for blocks of text where lines start with `>` or `> `
      // A blockquote is separated by double newlines from normal text.
      const blocks = content.split('\n\n');
      let changed = false;
      
      const newBlocks = blocks.map(block => {
        // If the block is a blockquote block
        if (block.trim().startsWith('>')) {
          // Remove `>` or `> ` from start of lines
          const cleanText = block.split('\n').map(line => {
            if (line.startsWith('> ')) return line.substring(2);
            if (line.startsWith('>')) return line.substring(1);
            return line;
          }).join('\n');
          
          const lower = cleanText.toLowerCase();
          let type = 'info'; // default fallback
          
          if (
            lower.includes('importante') || lower.includes('important') ||
            lower.includes('advertencia') || lower.includes('warning') ||
            lower.includes('caution') || lower.includes('precaución') ||
            lower.includes('ojo')
          ) {
            type = 'warning';
          } else if (
            lower.includes('éxito') || lower.includes('exito') || lower.includes('success') || lower.includes('felicidades')
          ) {
            type = 'success';
          }
          
          changed = true;
          return `<Callout type="${type}">\n${cleanText}\n</Callout>`;
        }
        return block;
      });
      
      if (changed) {
        fs.writeFileSync(filePath, newBlocks.join('\n\n'), 'utf8');
        console.log(`Updated blockquotes in: ${filePath}`);
      }
    }
  });
}

processFiles();
