const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const publicRoot = path.join(projectRoot, 'public');
const staticDirs = ['CSS', 'JS', 'assets'];

fs.mkdirSync(publicRoot, { recursive: true });

for (const dir of staticDirs) {
  const source = path.join(projectRoot, dir);
  const destination = path.join(publicRoot, dir);
  if (!fs.existsSync(source)) continue;
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
}

console.log('Prepared Vercel public static assets.');
