const fs = require('fs');
const path = require('path');

const sourceDirs = ['JS', 'CSS', 'Images', 'Data'];
const sourceFiles = ['index.html', 'map.html', '_redirects'];

const wwwDir = path.join(__dirname, 'www');

// Create www directory if it doesn't exist
if (!fs.existsSync(wwwDir)) {
  fs.mkdirSync(wwwDir, { recursive: true });
}

// Copy directories
sourceDirs.forEach(dir => {
  const sourcePath = path.join(__dirname, dir);
  const destPath = path.join(wwwDir, dir);
  
  if (fs.existsSync(sourcePath)) {
    // Remove destination if exists
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { recursive: true, force: true });
    }
    
    // Copy directory recursively
    copyRecursiveSync(sourcePath, destPath);
    console.log(`✓ Copied ${dir}/`);
  } else {
    console.log(`⚠ ${dir}/ not found, skipping`);
  }
});

// Copy HTML files
sourceFiles.forEach(file => {
  const sourcePath = path.join(__dirname, file);
  const destPath = path.join(wwwDir, file);
  
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`✓ Copied ${file}`);
  } else {
    console.log(`⚠ ${file} not found, skipping`);
  }
});

console.log('\n✅ All files copied to www/ directory');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

