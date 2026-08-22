const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== CHALLENGER 1: Milestone 3 Version Verification ===');

// 1. package.json
const pkgPath = path.resolve('package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
console.log('[1] package.json version:', pkg.version);
assert.strictEqual(pkg.version, '1.4.0', 'package.json must be 1.4.0');

// 2. package-lock.json
const pkgLockPath = path.resolve('package-lock.json');
const pkgLock = JSON.parse(fs.readFileSync(pkgLockPath, 'utf8'));
console.log('[2] package-lock.json root version:', pkgLock.version);
console.log('[2b] package-lock.json packages[""] version:', pkgLock.packages[''].version);
assert.strictEqual(pkgLock.version, '1.4.0', 'package-lock.json root version must be 1.4.0');
assert.strictEqual(pkgLock.packages[''].version, '1.4.0', 'package-lock.json packages[""] version must be 1.4.0');

// 3. src-tauri/Cargo.toml
const cargoTomlPath = path.resolve('src-tauri/Cargo.toml');
const cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
const cargoTomlMatch = cargoToml.match(/name\s*=\s*"wiscripts_windows"[\s\S]*?version\s*=\s*"([^"]+)"/);
console.log('[3] Cargo.toml version:', cargoTomlMatch ? cargoTomlMatch[1] : 'NOT FOUND');
assert(cargoTomlMatch, 'Cargo.toml version match must exist');
assert.strictEqual(cargoTomlMatch[1], '1.4.0', 'Cargo.toml version must be 1.4.0');

// 4. src-tauri/Cargo.lock
const cargoLockPath = path.resolve('src-tauri/Cargo.lock');
const cargoLock = fs.readFileSync(cargoLockPath, 'utf8');
const cargoLockMatch = cargoLock.match(/name\s*=\s*"wiscripts_windows"\s*\nversion\s*=\s*"([^"]+)"/);
console.log('[4] Cargo.lock wiscripts_windows version:', cargoLockMatch ? cargoLockMatch[1] : 'NOT FOUND');
assert(cargoLockMatch, 'Cargo.lock version match must exist');
assert.strictEqual(cargoLockMatch[1], '1.4.0', 'Cargo.lock version must be 1.4.0');

// 5. src-tauri/tauri.conf.json (Tauri v2 top-level version field)
const tauriConfPath = path.resolve('src-tauri/tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
console.log('[5] tauri.conf.json version:', tauriConf.version);
assert.strictEqual(tauriConf.version, '1.4.0', 'tauri.conf.json version must be 1.4.0');

// 6. src/store/slices/updaterSlice.ts
const updaterSlicePath = path.resolve('src/store/slices/updaterSlice.ts');
const updaterSlice = fs.readFileSync(updaterSlicePath, 'utf8');
const updaterMatch = updaterSlice.match(/appVersion:\s*['"]([^'"]+)['"]/);
console.log('[6] updaterSlice appVersion:', updaterMatch ? updaterMatch[1] : 'NOT FOUND');
assert(updaterMatch, 'updaterSlice appVersion match must exist');
assert.strictEqual(updaterMatch[1], '1.4.0', 'updaterSlice appVersion must be 1.4.0');

// 7. Check for any leftover stale 1.3.0 references in active source code (excluding tests / git history / release notes of prior versions)
const sourceDirs = ['src', 'src-tauri/src'];
function scanDir(dir) {
  const files = fs.readdirSync(dir);
  const hits = [];
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      hits.push(...scanDir(full));
    } else if (/\.(ts|tsx|rs|json)$/.test(f)) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('1.3.0')) {
        hits.push({ file: full, matches: content.split('\n').filter(l => l.includes('1.3.0')) });
      }
    }
  }
  return hits;
}

const staleHits = [];
for (const d of sourceDirs) {
  staleHits.push(...scanDir(path.resolve(d)));
}

console.log('[7] Scanning source code for stale "1.3.0" strings...');
if (staleHits.length > 0) {
  console.log('Stale hits found:', JSON.stringify(staleHits, null, 2));
  process.exit(1);
} else {
  console.log('No stale "1.3.0" references found in active src/ or src-tauri/src/ trees!');
}

console.log('\n>>> ALL 7 VERSION VERIFICATION CHECKS PASSED EMPIRICALLY! <<<');
