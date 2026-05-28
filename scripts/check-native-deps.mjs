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

// Alpine-based Docker builds need these native optional packages available at
// the workspace root. They are intentionally centralized here instead of being
// declared inside individual workspace packages.
const allowedRootOptionalDependencies = new Set([
  '@rollup/rollup-linux-x64-musl',
  'lightningcss-linux-x64-musl'
]);

const repoRoot = process.cwd();
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

walk(repoRoot);

const violations = [];

for (const file of packageJsonFiles) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const isRootPackageJson = path.resolve(file) === path.join(repoRoot, 'package.json');

  for (const sectionName of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const deps = json[sectionName] || {};

    for (const depName of Object.keys(deps)) {
      const matchesNativeFamily = bannedPatterns.some(pattern => depName.includes(pattern));
      const matchesPlatform = platformMarkers.some(marker => depName.includes(marker));
      const isApprovedRootOptionalDependency =
        isRootPackageJson &&
        sectionName === 'optionalDependencies' &&
        allowedRootOptionalDependencies.has(depName);

      if (matchesNativeFamily && matchesPlatform && !isApprovedRootOptionalDependency) {
        violations.push(`${file}: ${sectionName} -> ${depName}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\nDirect platform-native package declarations are not allowed.');
  console.error('Keep approved native optional packages centralized in the root package.json only.\n');

  for (const violation of violations) {
    console.error(` - ${violation}`);
  }

  process.exit(1);
}

console.log('Native dependency hygiene check passed.');
