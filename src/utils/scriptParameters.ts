import type { ScriptParameter, ScriptParameterValue } from '../types';

export const VALID_PS_PARAM_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validates a PowerShell parameter identifier to prevent script injection.
 */
export function assertValidParamName(name: string): void {
  if (!VALID_PS_PARAM_NAME.test(name)) {
    throw new Error(`Invalid PowerShell parameter name: "${name}"`);
  }
}

/**
 * Builds default form values for a script's parameter metadata.
 */
export function buildInitialParameterValues(
  parameters?: ScriptParameter[]
): Record<string, ScriptParameterValue> {
  const initialValues: Record<string, ScriptParameterValue> = {};
  if (!parameters) {
    return initialValues;
  }

  for (const param of parameters) {
    if (param.default !== undefined && param.default !== null) {
      initialValues[param.name] = param.default as ScriptParameterValue;
    } else if (param.type === 'boolean') {
      initialValues[param.name] = false;
    } else if (param.type === 'number') {
      initialValues[param.name] = 0;
    } else {
      initialValues[param.name] = '';
    }
  }
  return initialValues;
}

/**
 * Masks PowerShell comments (`#...`, `<#...#>`) and string literals (`'...'`, `"..."`)
 * with spaces of identical length (preserving newlines) so index positions map 1:1 to `code`.
 */
function maskPowerShellCommentsAndStrings(code: string): string {
  const chars = new Array<string>(code.length);
  let i = 0;

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    // Block comment <# ... #>
    if (ch === '<' && next === '#') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < code.length) {
        if (code[i] === '#' && code[i + 1] === '>') {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
          break;
        }
        chars[i] = code[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }

    // Line comment # ...
    if (ch === '#') {
      while (i < code.length && code[i] !== '\n' && code[i] !== '\r') {
        chars[i] = ' ';
        i++;
      }
      continue;
    }

    // Single-quoted literal '...'
    if (ch === "'") {
      chars[i] = ' ';
      i++;
      while (i < code.length) {
        if (code[i] === "'" && code[i + 1] === "'") {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
          continue;
        }
        const c = code[i];
        chars[i] = c === '\n' ? '\n' : ' ';
        i++;
        if (c === "'") {
          break;
        }
      }
      continue;
    }

    // Double-quoted literal "..."
    if (ch === '"') {
      chars[i] = ' ';
      i++;
      while (i < code.length) {
        if (code[i] === '`' && i + 1 < code.length) {
          chars[i] = ' ';
          chars[i + 1] = code[i + 1] === '\n' ? '\n' : ' ';
          i += 2;
          continue;
        }
        const c = code[i];
        chars[i] = c === '\n' ? '\n' : ' ';
        i++;
        if (c === '"') {
          break;
        }
      }
      continue;
    }

    chars[i] = ch;
    i++;
  }

  return chars.join('');
}

/**
 * Finds the index of the opening `(` of the top-level `param(...)` block in `masked`
 * (at `{}` brace depth 0), ignoring comments and strings.
 */
function findTopLevelParamOpenParen(masked: string): number {
  let braceDepth = 0;

  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === '{') {
      braceDepth++;
      continue;
    }
    if (ch === '}') {
      if (braceDepth > 0) braceDepth--;
      continue;
    }
    if (braceDepth !== 0) {
      continue;
    }

    // Check for keyword `param` at token boundary followed by optional whitespace and `(`
    if (
      (ch === 'p' || ch === 'P') &&
      masked.slice(i, i + 5).toLowerCase() === 'param'
    ) {
      const prevChar = i > 0 ? masked[i - 1] : '';
      const isPrevBoundary = i === 0 || /[\s;)]/.test(prevChar);
      if (!isPrevBoundary) {
        continue;
      }

      let j = i + 5;
      while (j < masked.length && /\s/.test(masked[j])) {
        j++;
      }
      if (masked[j] === '(') {
        return j;
      }
    }
  }

  return -1;
}

/**
 * Extracts the top-level `param(...)` header block from a PowerShell script,
 * including any preceding comments (`<# ... #>`, `#`) or attributes (`[CmdletBinding()]`),
 * skipping comments/strings when locating `param(` and tracking nested parentheses.
 */
export function extractParamBlockHeader(code: string): string | null {
  const clean = code.replace(/^\uFEFF/, '');
  const masked = maskPowerShellCommentsAndStrings(clean);
  const openParenIndex = findTopLevelParamOpenParen(masked);
  if (openParenIndex === -1) {
    return null;
  }

  let depth = 1;
  for (let i = openParenIndex + 1; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return clean.substring(0, i + 1).trim();
      }
    }
  }

  return null;
}

/**
 * Synthesizes a clean PowerShell `param(...)` block for scripts that lack one,
 * ensuring root AST ParamBlock preservation.
 */
export function synthesizeParamBlock(parameters: ScriptParameter[]): string {
  const paramDecls = parameters.map((p) => {
    assertValidParamName(p.name);
    if (p.type === 'boolean') {
      return `  [switch]$${p.name}`;
    }
    if (p.type === 'number') {
      return `  [double]$${p.name}`;
    }
    return `  [string]$${p.name}`;
  });
  return `param(\n${paramDecls.join(',\n')}\n)`;
}

/**
 * Wraps a PowerShell script with validated parameter bindings while preserving root `param(...)`.
 */
export function formatScriptWithParameters(
  rawContent: string,
  parameters: ScriptParameter[],
  values: Record<string, ScriptParameterValue>
): string {
  if (!parameters || parameters.length === 0 || !values) {
    return rawContent;
  }

  // Strip UTF-8 BOM if present at start
  const cleanContent = rawContent.replace(/^\uFEFF/, '').trim();

  // Build PowerShell CLI arguments with strict identifier validation and literal escaping
  const args: string[] = [];
  for (const param of parameters) {
    assertValidParamName(param.name);

    const val = values[param.name];
    if (val === undefined || val === null || val === '') {
      continue;
    }

    if (param.type === 'boolean') {
      const boolToken = Boolean(val) ? '$true' : '$false';
      args.push(`-${param.name}:${boolToken}`);
    } else if (param.type === 'number') {
      const numVal = Number(val);
      if (!Number.isNaN(numVal) && Number.isFinite(numVal)) {
        args.push(`-${param.name} ${numVal}`);
      }
    } else {
      // Escape single quotes for PowerShell single-quoted literal: ' -> ''
      const strVal = String(val).replace(/'/g, "''");
      args.push(`-${param.name} '${strVal}'`);
    }
  }

  if (args.length === 0) {
    return cleanContent;
  }

  // Preserve root AST ParamBlock to ensure PowerShell 5.1/7 AST compliance
  const existingHeader = extractParamBlockHeader(cleanContent);
  const rootParamBlock = existingHeader || synthesizeParamBlock(parameters);

  return `${rootParamBlock}\n\n& {\n${cleanContent}\n} ${args.join(' ')}\n`;
}
