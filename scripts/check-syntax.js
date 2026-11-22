// Cek sintaks semua file JS server/scripts/tests/public tanpa dependency: node scripts/check-syntax.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === 'node_modules' || f.name.startsWith('.')) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
let bad = 0;
for (const file of walk(root)) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (e) { bad++; console.error('SYNTAX ERROR', path.relative(root, file), '\n', String(e.stderr).split('\n').slice(0, 4).join('\n')); }
}
if (bad) process.exit(1);
console.log('Semua file JS lolos cek sintaks');
