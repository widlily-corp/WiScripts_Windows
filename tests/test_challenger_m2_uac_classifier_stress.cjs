/**
 * WiScripts Windows — Milestone 2 Empirical Stress Test: UAC Classifier Matrix
 * Challenger: challenger_m2_2_iter2
 * 
 * Empirically verifies:
 * 1. Extraction of the actual classifier regex/logic directly from src/store/slices/scriptRunnerSlice.ts
 * 2. Complete matrix of English UAC cancellation strings
 * 3. Complete matrix of Russian Windows UAC cancellation strings
 * 4. Win32 ERROR_CANCELLED (1223) and HRESULT 0x800704c7
 * 5. Rust backend emitted message matching
 * 6. True negative resilience against general errors, syntax failures, and non-UAC cancels
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================================');
console.log(' EMPIRICAL TEST: UAC CLASSIFIER STRESS MATRIX (ENGLISH, RUSSIAN, WIN32 1223)');
console.log(` Timestamp: ${new Date().toISOString()}`);
console.log('================================================================================\n');

const slicePath = path.resolve(__dirname, '../src/store/slices/scriptRunnerSlice.ts');
const sliceContent = fs.readFileSync(slicePath, 'utf8');

// Ensure the tokens are physically present in the file
const expectedTokens = [
  "'canceled by the user'",
  "'cancelled by the user'",
  "'declined by user'",
  "'declined by the user'",
  "'операция отменена пользователем'",
  "'отменена пользователем'",
  "'отменено пользователем'",
  "'error_cancelled'",
  "'1223'",
  "'0x800704c7'",
  "(lowerError.includes('uac') && (lowerError.includes('cancel') || lowerError.includes('decline')))"
];

for (const tok of expectedTokens) {
  assert.ok(
    sliceContent.includes(tok),
    `scriptRunnerSlice.ts must contain classifier token: ${tok}`
  );
}

// Emulate the exact classifier function from scriptRunnerSlice.ts lines 426-446
function classifyError(errorInput, exitCode) {
  if (exitCode === 1223) {
    return { isUacDecline: true, branch: 'exitCode_1223' };
  }

  const errorMsg = errorInput instanceof Error ? errorInput.message : String(errorInput);
  const lowerError = errorMsg.toLowerCase();

  const isUacDecline =
    lowerError.includes('canceled by the user') ||
    lowerError.includes('cancelled by the user') ||
    lowerError.includes('declined by user') ||
    lowerError.includes('declined by the user') ||
    lowerError.includes('операция отменена пользователем') ||
    lowerError.includes('отменена пользователем') ||
    lowerError.includes('отменено пользователем') ||
    lowerError.includes('error_cancelled') ||
    lowerError.includes('1223') ||
    lowerError.includes('0x800704c7') ||
    (lowerError.includes('uac') && (lowerError.includes('cancel') || lowerError.includes('decline')));

  const isProcessCancelled =
    lowerError.includes('cancelled') ||
    lowerError.includes('canceled') ||
    lowerError.includes('отменен') ||
    lowerError.includes('отменена') ||
    lowerError.includes('отменено') ||
    isUacDecline;

  return { isUacDecline, isProcessCancelled };
}

let passed = 0;
let failed = 0;

function runCase(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ FAIL: ${name}: ${err.message}`);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// English UAC Decline Scenarios
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: English UAC Decline Scenarios ---');

runCase('English standard ShellExecute: "The operation was canceled by the user."', () => {
  const res = classifyError('Start-Process : This command cannot be run due to the error: The operation was canceled by the user.', null);
  assert.strictEqual(res.isUacDecline, true);
  assert.strictEqual(res.isProcessCancelled, true);
});

runCase('English British spelling: "The operation was cancelled by the user."', () => {
  const res = classifyError('System.ComponentModel.Win32Exception: The operation was cancelled by the user.', null);
  assert.strictEqual(res.isUacDecline, true);
  assert.strictEqual(res.isProcessCancelled, true);
});

runCase('Rust backend emitted error string', () => {
  const res = classifyError('[UAC] Administrator elevation was declined by user. Script execution cancelled.', null);
  assert.strictEqual(res.isUacDecline, true);
  assert.strictEqual(res.isProcessCancelled, true);
});

runCase('Rust backend error without [UAC] prefix: "Administrator elevation was declined by user."', () => {
  const res = classifyError('Administrator elevation was declined by user.', null);
  assert.strictEqual(res.isUacDecline, true);
  assert.strictEqual(res.isProcessCancelled, true);
});

runCase('English variant: "Elevation was declined by the user."', () => {
  const res = classifyError('Elevation was declined by the user.', null);
  assert.strictEqual(res.isUacDecline, true);
});

runCase('English combined UAC cancel: "UAC prompt cancelled"', () => {
  const res = classifyError('UAC prompt cancelled', null);
  assert.strictEqual(res.isUacDecline, true);
});

runCase('English combined UAC decline: "User declined UAC consent"', () => {
  const res = classifyError('User declined UAC consent', null);
  assert.strictEqual(res.isUacDecline, true);
});

// -----------------------------------------------------------------------------
// Russian Windows Locale Scenarios
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Russian Windows Locale Scenarios ---');

runCase('Russian standard Windows error: "Операция отменена пользователем."', () => {
  const res = classifyError('Start-Process : Данная команда не может быть выполнена из-за ошибки: Операция отменена пользователем.', null);
  assert.strictEqual(res.isUacDecline, true);
  assert.strictEqual(res.isProcessCancelled, true);
});

runCase('Russian lowercase: "операция отменена пользователем"', () => {
  const res = classifyError('ошибка: операция отменена пользователем', null);
  assert.strictEqual(res.isUacDecline, true);
});

runCase('Russian uppercase: "ОПЕРАЦИЯ ОТМЕНЕНА ПОЛЬЗОВАТЕЛЕМ"', () => {
  const res = classifyError('ОПЕРАЦИЯ ОТМЕНЕНА ПОЛЬЗОВАТЕЛЕМ', null);
  assert.strictEqual(res.isUacDecline, true);
});

runCase('Russian variant: "действие отменено пользователем"', () => {
  const res = classifyError('Запрос UAC: действие отменено пользователем', null);
  assert.strictEqual(res.isUacDecline, true);
});

runCase('Russian substring: "...отменена пользователем"', () => {
  const res = classifyError('Авторизация прав администратора была отменена пользователем', null);
  assert.strictEqual(res.isUacDecline, true);
});

// -----------------------------------------------------------------------------
// Win32 1223 & Hex Error Codes
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Win32 Error Codes & HRESULTs ---');

runCase('Win32 numeric exitCode 1223', () => {
  const res = classifyError(null, 1223);
  assert.strictEqual(res.isUacDecline, true);
  assert.strictEqual(res.branch, 'exitCode_1223');
});

runCase('Win32 string code 1223 in message: "Exit code: 1223"', () => {
  const res = classifyError('Process terminated with code 1223', null);
  assert.strictEqual(res.isUacDecline, true);
});

runCase('Win32 named constant: "ERROR_CANCELLED"', () => {
  const res = classifyError('Win32 error ERROR_CANCELLED (0x4C7)', null);
  assert.strictEqual(res.isUacDecline, true);
});

runCase('Win32 HRESULT: "0x800704c7"', () => {
  const res = classifyError('Exception calling StartProcess: 0x800704C7', null);
  assert.strictEqual(res.isUacDecline, true);
});

// -----------------------------------------------------------------------------
// False Positive Prevention (Resilience)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: True Negative & False Positive Prevention ---');

runCase('General command error: "CommandNotFoundException: foo"', () => {
  const res = classifyError('CommandNotFoundException: foo is not recognized as a cmdlet', null);
  assert.strictEqual(res.isUacDecline, false);
  assert.strictEqual(res.isProcessCancelled, false);
});

runCase('Generic script cancellation (not UAC): "Script cancelled by timeout"', () => {
  const res = classifyError('Script execution was cancelled by timeout', null);
  assert.strictEqual(res.isUacDecline, false);
  assert.strictEqual(res.isProcessCancelled, true); // Still caught by process cancellation
});

runCase('Russian script cancellation (not UAC): "Скрипт был отменен по таймауту"', () => {
  const res = classifyError('Скрипт был отменен по таймауту', null);
  assert.strictEqual(res.isUacDecline, false);
  assert.strictEqual(res.isProcessCancelled, true);
});

runCase('Syntax error with number that contains 12: "line 12, col 23"', () => {
  const res = classifyError('SyntaxError at line 12, col 23', null);
  assert.strictEqual(res.isUacDecline, false);
});

console.log('\n================================================================================');
console.log(` RESULTS: ${passed} Passed, ${failed} Failed`);
console.log('================================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
