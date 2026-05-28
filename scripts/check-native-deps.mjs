import fs from 'node:fs';
import path from 'node:path';

const bannedPatterns = [
  '@rollup/rollup-',
  '@tailwindcss/oxide-',
  'lightningcss-'
];

const platformMarkers = [
  'darwin',
  'linux',
  'win32',
  'musl',
  'gnu',
  'arm64',
  'x64'
];

const packageJsonFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name === 'package.json') {
      packageJsonFiles.push(fullPath);
    }
  }
}

walk(process.cwd());

const violations = [];

for (const file of packageJsonFiles) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));

  for (const sectionName of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const deps = json[sectionName] || {};

    for (const depName of Object.keys(deps)) {
      const matchesNativeFamily = bannedPatterns.some(pattern => depName.includes(pattern));
      const matchesPlatform = platformMarkers.some(marker => depName.includes(marker));

      if (matchesNativeFamily && matchesPlatform) {
        violations.push(`${file}: ${sectionName} -> ${depName}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\nDirect platform-native package declarations are not allowed.');
  console.error('These packages must be resolved transitively per-platform by pnpm.\n');

  for (const violation of violations) {
    console.error(` - ${violation}`);
  }

  process.exit(1);
}

console.log('Native dependency hygiene check passed.');
