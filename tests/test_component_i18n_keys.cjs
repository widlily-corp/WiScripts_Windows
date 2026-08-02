const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../src/i18n/locales/en.json');
const ruPath = path.join(__dirname, '../src/i18n/locales/ru.json');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const ru = JSON.parse(fs.readFileSync(ruPath, 'utf8'));

function flattenKeys(obj, prefix = '') {
  let keys = new Set();
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      const propKey = prefix ? `${prefix}.${k}` : k;
      if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
        const sub = flattenKeys(obj[k], propKey);
        sub.forEach(x => keys.add(x));
      } else {
        keys.add(propKey);
      }
    }
  }
  return keys;
}

const enKeys = flattenKeys(en);
const ruKeys = flattenKeys(ru);

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== '__tests__') {
        getAllFiles(fullPath, arrayOfFiles);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

const srcDir = path.join(__dirname, '../src');
const files = getAllFiles(srcDir);

const keyRegex = /\bt\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g;

let missingKeysInEn = [];
let missingKeysInRu = [];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = keyRegex.exec(content)) !== null) {
    const key = match[1];
    // Ignore dynamic variables or prefixes if any (the regex only matches literal strings)
    if (!enKeys.has(key)) {
      missingKeysInEn.push({ file: path.relative(srcDir, file), key });
    }
    if (!ruKeys.has(key)) {
      missingKeysInRu.push({ file: path.relative(srcDir, file), key });
    }
  }
});

console.log('=== COMPONENT TRANSLATION KEY AUDIT ===');
console.log(`Scanned ${files.length} source files.`);

if (missingKeysInEn.length > 0) {
  console.error('Keys used in components but MISSING in en.json:');
  missingKeysInEn.forEach(item => console.error(`  ${item.file}: "${item.key}"`));
} else {
  console.log('PASS: All literal t() keys used in components exist in en.json.');
}

if (missingKeysInRu.length > 0) {
  console.error('Keys used in components but MISSING in ru.json:');
  missingKeysInRu.forEach(item => console.error(`  ${item.file}: "${item.key}"`));
} else {
  console.log('PASS: All literal t() keys used in components exist in ru.json.');
}

if (missingKeysInEn.length > 0 || missingKeysInRu.length > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
