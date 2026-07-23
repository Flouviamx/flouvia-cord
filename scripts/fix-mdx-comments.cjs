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
      
      // Replace HTML comments with JSX comments
      // <!-- comment --> to {/* comment */}
      const newContent = content.replace(/<!--([\s\S]*?)-->/g, '{/*$1*/}');
      
      if (newContent !== content) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`Fixed comments in: ${filePath}`);
      }
    }
  });
}

processFiles();
