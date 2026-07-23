const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../');

function readFile(relPath) {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf8');
}

const files = {
  app: readFile('src/App.tsx'),
  store: readFile('src/store/useAppStore.ts'),
  nav: readFile('src/components/Navigation.tsx'),
  opt: readFile('src/components/OptimizationView.tsx'),
  odt: readFile('src/components/OdtView.tsx'),
  mas: readFile('src/components/MasView.tsx'),
  modal: readFile('src/components/SafetyConfirmationModal.tsx'),
};

const results = [];

function check(testName, condition, details) {
  results.push({ testName, pass: Boolean(condition), details });
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${testName} - ${details}`);
}

// 1. Check Store
check('Store defines isExecuting', files.store.includes('isExecuting: boolean;'), 'useAppStore interface contains isExecuting');
check('Store defines setIsExecuting', files.store.includes('setIsExecuting: (executing: boolean) => void;'), 'useAppStore interface contains setIsExecuting');
check('Store initializes isExecuting to false', files.store.includes('isExecuting: false,'), 'useAppStore initializes isExecuting to false');

// 2. Check OptimizationView onConfirmAction
const optConfirmActionMatch = (files.opt.indexOf('setIsExecuting(true)') < files.opt.indexOf('execute_optimizations') &&
   files.opt.indexOf('execute_optimizations') < files.opt.indexOf('setIsExecuting(false)'));

check('OptimizationView onConfirmAction handler shield', optConfirmActionMatch, 'setIsExecuting(true) called before invoke, setIsExecuting(false) in finally block');

// 3. Check OdtView onConfirmAction
const odtConfirmActionMatch = (files.odt.indexOf('setIsExecuting(true)') < files.odt.indexOf('execute_odt_install') &&
   files.odt.indexOf('execute_odt_install') < files.odt.indexOf('setIsExecuting(false)'));

check('OdtView onConfirmAction handler shield', odtConfirmActionMatch, 'setIsExecuting(true) called before invoke, setIsExecuting(false) in finally block');

// 4. Check MasView onConfirmAction
const masConfirmActionMatch = (files.mas.indexOf('setIsExecuting(true)') < files.mas.indexOf('execute_activation') &&
   files.mas.indexOf('execute_activation') < files.mas.indexOf('setIsExecuting(false)'));

check('MasView onConfirmAction handler shield', masConfirmActionMatch, 'setIsExecuting(true) called before invoke, setIsExecuting(false) in finally block');

// 5. Check Navigation tabs disabled when isExecuting
check('Navigation disables tab buttons when isExecuting', files.nav.includes('disabled={isExecuting}'), 'Navigation tab buttons have disabled={isExecuting}');

// 6. Check OptimizationView buttons disabled when isExecuting
check('OptimizationView Execute button disabled when isExecuting', files.opt.includes('disabled={selectedCount === 0 || isExecuting}'), 'Execute button checks isExecuting');
check('OptimizationView Presets disabled when isExecuting', (files.opt.match(/disabled=\{isExecuting\}/g) || []).length >= 4, 'Presets buttons have disabled={isExecuting}');

// 7. Check OdtView buttons disabled when isExecuting
check('OdtView Deploy button disabled when isExecuting', files.odt.includes('disabled={isExecuting}'), 'Deploy button has disabled={isExecuting}');

// 8. Check MasView buttons disabled when isExecuting
check('MasView Activate button disabled when isExecuting', files.mas.includes('disabled={isExecuting}'), 'Activate button has disabled={isExecuting}');

const failed = results.filter(r => !r.pass);
if (failed.length > 0) {
  console.error(`FAILED ${failed.length} checks.`);
  process.exit(1);
} else {
  console.log(`ALL ${results.length} CHECKS PASSED.`);
}
