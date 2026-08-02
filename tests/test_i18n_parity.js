const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../src/i18n/locales/en.json');
const ruPath = path.join(__dirname, '../src/i18n/locales/ru.json');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const ru = JSON.parse(fs.readFileSync(ruPath, 'utf8'));

function flattenKeys(obj, prefix = '') {
  let keys = {};
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      const propKey = prefix ? `${prefix}.${k}` : k;
      if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
        Object.assign(keys, flattenKeys(obj[k], propKey));
      } else {
        keys[propKey] = obj[k];
      }
    }
  }
  return keys;
}

const enFlat = flattenKeys(en);
const ruFlat = flattenKeys(ru);

const enKeys = Object.keys(enFlat);
const ruKeys = Object.keys(ruFlat);

const missingInRu = enKeys.filter(k => !(k in ruFlat));
const missingInEn = ruKeys.filter(k => !(k in enFlat));

console.log(`Total EN keys: ${enKeys.length}`);
console.log(`Total RU keys: ${ruKeys.length}`);

let failed = false;

if (missingInRu.length > 0) {
  console.error('FAIL: Keys present in en.json but missing in ru.json:', missingInRu);
  failed = true;
} else {
  console.log('PASS: All en.json keys exist in ru.json.');
}

if (missingInEn.length > 0) {
  console.error('FAIL: Keys present in ru.json but missing in en.json:', missingInEn);
  failed = true;
} else {
  console.log('PASS: All ru.json keys exist in en.json.');
}

function getParams(str) {
  if (typeof str !== 'string') return [];
  const matches = str.match(/\{\{\s*(\w+)\s*\}\}/g) || [];
  return Array.from(new Set(matches.map(m => m.replace(/[\{\}\s]/g, '')))).sort();
}

let paramMismatches = [];

for (const k of enKeys) {
  if (k in ruFlat) {
    const enParams = getParams(enFlat[k]);
    const ruParams = getParams(ruFlat[k]);
    if (JSON.stringify(enParams) !== JSON.stringify(ruParams)) {
      paramMismatches.push({
        key: k,
        enParams,
        ruParams,
        enVal: enFlat[k],
        ruVal: ruFlat[k]
      });
    }
  }
}

if (paramMismatches.length > 0) {
  console.error('FAIL: Parameter mismatches found:', paramMismatches);
  failed = true;
} else {
  console.log('PASS: No missing or mismatched interpolation parameters in translations.');
}

if (failed) {
  process.exit(1);
} else {
  console.log('SUCCESS: i18n parity & interpolation verification passed!');
  process.exit(0);
}
