/**
 * Pure In-Memory Static Script Impact Analyzer
 *
 * Performs client-side AST-informed regex and lexical analysis of PowerShell,
 * batch, and command scripts to detect potential system mutations, target paths,
 * services, registry entries, and scheduled tasks prior to execution.
 *
 * Zero Host Side Effects: Performs NO Tauri IPC commands, NO process execution,
 * and NO filesystem or registry modifications.
 */

export type ImpactActionType =
  | 'create'
  | 'modify'
  | 'delete'
  | 'stop'
  | 'start'
  | 'restart'
  | 'disable'
  | 'enable'
  | 'read';

export type ImpactCategory =
  | 'registry'
  | 'service'
  | 'scheduled_task'
  | 'filesystem'
  | 'network'
  | 'process';

export interface ImpactItem {
  id: string;
  category: ImpactCategory;
  action: ImpactActionType;
  target: string;
  detail?: string;
  lineNumber?: number;
  rawLine?: string;
  isCritical?: boolean;
}

export interface ImpactSummary {
  totalItems: number;
  registryCount: number;
  servicesCount: number;
  tasksCount: number;
  filesystemCount: number;
  networkCount: number;
  processCount: number;
  criticalCount: number;
}

export interface ScriptImpactAnalysis {
  riskLevel: 'safe' | 'elevated' | 'critical';
  requiresAdmin: boolean;
  hasDryRunSupport: boolean;
  items: ImpactItem[];
  summary: ImpactSummary;
  warnings: string[];
}

export interface ScriptManifestLike {
  requiresAdmin?: boolean;
  riskLevel?: 'safe' | 'elevated' | 'critical';
}

const CRITICAL_SERVICES = new Set([
  'wuauserv',
  'bits',
  'cryptsvc',
  'windefend',
  'lanmanserver',
  'rpcss',
  'dcomlaunch',
  'trustedinstaller',
  'mpssvc',
  'samss',
  'lsass',
]);

const CRITICAL_PATHS = [
  'c:\\windows',
  'system32',
  'catroot2',
  'softwaredistribution',
  'system volume information',
  'bootmgr',
  'boot',
];

/**
 * Case-insensitive Map implementation for PowerShell variable and environment tracking
 */
export class CaseInsensitiveMap<V> extends Map<string, V> {
  override get(key: string): V | undefined {
    return super.get(typeof key === 'string' ? key.toLowerCase() : key);
  }

  override set(key: string, value: V): this {
    return super.set(typeof key === 'string' ? key.toLowerCase() : key, value);
  }

  override has(key: string): boolean {
    return super.has(typeof key === 'string' ? key.toLowerCase() : key);
  }

  override delete(key: string): boolean {
    return super.delete(typeof key === 'string' ? key.toLowerCase() : key);
  }
}

/**
 * Recursively expands embedded variable references in string values (up to max depth of 5)
 */
function expandVarString(str: string, vars: Map<string, string | string[]>, depth = 0): string {
  if (depth > 5) return str;
  return str.replace(/\$([a-zA-Z0-9_:]+)/g, (fullMatch, vn) => {
    const val = vars.get(vn);
    if (typeof val === 'string') {
      return expandVarString(val, vars, depth + 1);
    }
    return fullMatch;
  });
}

/**
 * Helper to extract named parameters from a PowerShell command line
 */
function extractNamedParam(line: string, param: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)-${param}\\s+(?:"([^"]*)"|'([^']*)'|([^\\s;]+))`, 'i');
  const m = re.exec(line);
  if (m) return m[1] ?? m[2] ?? m[3];
  return undefined;
}

/**
 * Helper to extract path, name, and value for registry / filesystem cmdlets
 */
function extractCmdletPathAndName(
  line: string,
  cmdlet: string
): { path?: string; name?: string; value?: string } {
  let path = extractNamedParam(line, 'Path');
  if (!path) {
    const posMatch = new RegExp(`\\b${cmdlet}\\s+(?:"([^"]+)"|'([^']+)'|([^\\s\\-;][^\\s;]*))`, 'i').exec(line);
    if (posMatch) {
      path = posMatch[1] || posMatch[2] || posMatch[3];
    }
  }
  const name = extractNamedParam(line, 'Name');
  const valMatch = /(?:^|\s)-Value\s+(?:"([^"]*)"|'([^']*)'|([^\s;\r\n]+))/i.exec(line);
  const value = valMatch ? (valMatch[1] ?? valMatch[2] ?? valMatch[3] ?? '').trim() : undefined;
  return { path, name, value };
}

/**
 * Helper to extract service target and startup type
 */
function extractServiceTarget(
  line: string,
  cmdlet: string
): { target?: string; startupType?: string } {
  let target = extractNamedParam(line, 'Name');
  if (!target) {
    const posMatch = new RegExp(`\\b${cmdlet}\\s+(?:"([^"]+)"|'([^']+)'|([^\\s\\-;][^\\s;]*))`, 'i').exec(line);
    if (posMatch) {
      target = posMatch[1] || posMatch[2] || posMatch[3];
    }
  }
  const startupType = extractNamedParam(line, 'StartupType');
  return { target, startupType };
}

/**
 * Helper to extract scheduled task target
 */
function extractTaskTarget(line: string, cmdlet: string): string | undefined {
  let target = extractNamedParam(line, 'TaskName');
  if (!target) {
    const posMatch = new RegExp(`\\b${cmdlet}\\s+(?:"([^"]+)"|'([^']+)'|([^\\s\\-;][^\\s;]*))`, 'i').exec(line);
    if (posMatch) {
      target = posMatch[1] || posMatch[2] || posMatch[3];
    }
  }
  return target;
}

/**
 * Strips block comments while preserving newlines for accurate line numbering
 */
function stripBlockComments(str: string): string {
  if (!str.includes('<#')) return str;
  return str.replace(/<#[\s\S]*?#>/g, match =>
    match.includes('\n') ? '\n'.repeat((match.match(/\n/g) || []).length) : ' '
  );
}

/**
 * Resolves variable assignments, environment variables, loops, and Join-Path expressions
 */
export function parsePowerShellVariables(code: string): Map<string, string | string[]> {
  const vars = new CaseInsensitiveMap<string | string[]>();

  // Standard environment variable fallbacks
  vars.set('env:windir', 'C:\\Windows');
  vars.set('env:SystemRoot', 'C:\\Windows');
  vars.set('env:LOCALAPPDATA', '%LOCALAPPDATA%');
  vars.set('env:APPDATA', '%APPDATA%');
  vars.set('env:ProgramData', 'C:\\ProgramData');
  vars.set('env:TEMP', '%TEMP%');
  vars.set('env:SystemDrive', 'C:');

  const clean = stripBlockComments(code.replace(/^\uFEFF/, ''));
  const lines = clean.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Join-Path: $var = Join-Path -Path $base -ChildPath "sub"
    if (trimmed.includes('Join-Path')) {
      const joinMatch = /^\$([a-zA-Z0-9_]+)\s*=\s*Join-Path\s+(?:-Path\s+)?([^\s]+)\s+(?:-ChildPath\s+)?["']([^"']+)["']/i.exec(trimmed);
      if (joinMatch) {
        const varName = joinMatch[1];
        const basePathRaw = joinMatch[2].replace(/["']/g, '');
        const child = joinMatch[3];
        let base = basePathRaw;
        if (base.startsWith('$')) {
          const resolvedBase = vars.get(base.substring(1));
          if (typeof resolvedBase === 'string') {
            base = resolvedBase;
          }
        }
        vars.set(varName, `${base}\\${child}`.replace(/\\\\/g, '\\'));
        continue;
      }
    }

    // Single string assignment: $var = "..." or '...'
    const strMatch = /^\$([a-zA-Z0-9_]+)\s*=\s*["']([^"']+)["']/i.exec(trimmed);
    if (strMatch) {
      vars.set(strMatch[1], strMatch[2]);
      continue;
    }

    // Array assignment: $var = @("item1", "item2", ...)
    const arrMatch = /^\$([a-zA-Z0-9_]+)\s*=\s*@\(\s*([^)]*)\s*\)/i.exec(trimmed);
    if (arrMatch) {
      const items = Array.from(arrMatch[2].matchAll(/["']([^"']+)["']/g)).map(m => m[1]);
      if (items.length > 0) {
        vars.set(arrMatch[1], items);
      }
      continue;
    }
  }

  // Handle multiline array declarations: $var = @(\n "item1",\n "item2"\n)
  if (clean.includes('@(')) {
    const multilineArrRegex = /\$([a-zA-Z0-9_]+)\s*=\s*@\(\s*([\s\S]*?)\s*\)/g;
    let multiMatch: RegExpExecArray | null;
    while ((multiMatch = multilineArrRegex.exec(clean)) !== null) {
      const varName = multiMatch[1];
      if (!vars.has(varName)) {
        const content = multiMatch[2];
        const items = Array.from(content.matchAll(/["']([^"']+)["']/g)).map(m => m[1]);
        if (items.length > 0) {
          vars.set(varName, items);
        }
      }
    }
  }

  // Loop variable binding: foreach ($item in $collection)
  if (/foreach/i.test(clean)) {
    const foreachRegex = /foreach\s*\(\s*\$([a-zA-Z0-9_]+)\s+in\s+\$([a-zA-Z0-9_]+)\s*\)/gi;
    let feMatch: RegExpExecArray | null;
    while ((feMatch = foreachRegex.exec(clean)) !== null) {
      const loopVar = feMatch[1];
      const arrName = feMatch[2];
      const arrVal = vars.get(arrName);
      if (arrVal) {
        vars.set(loopVar, arrVal);
      }
    }

    // Loop variable binding inline array: foreach ($item in @(...))
    const foreachInlineRegex = /foreach\s*\(\s*\$([a-zA-Z0-9_]+)\s+in\s+@\(\s*([\s\S]*?)\s*\)\s*\)/gi;
    let feiMatch: RegExpExecArray | null;
    while ((feiMatch = foreachInlineRegex.exec(clean)) !== null) {
      const loopVar = feiMatch[1];
      const items = Array.from(feiMatch[2].matchAll(/["']([^"']+)["']/g)).map(m => m[1]);
      if (items.length > 0) {
        vars.set(loopVar, items);
      }
    }
  }

  // Split-Path: $leafVar = Split-Path -Path $sourceVar -Leaf
  if (/Split-Path/i.test(clean)) {
    const splitPathRegex = /\$([a-zA-Z0-9_]+)\s*=\s*Split-Path\s+(?:-Path\s+)?\$([a-zA-Z0-9_]+)(?:\s+-(Leaf|Parent))?/gi;
    let spMatch: RegExpExecArray | null;
    while ((spMatch = splitPathRegex.exec(clean)) !== null) {
      const targetVar = spMatch[1];
      const srcVar = spMatch[2];
      const mode = (spMatch[3] || 'Parent').toLowerCase();
      const srcVal = vars.get(srcVar);
      if (srcVal) {
        const transform = (p: string) => {
          if (mode === 'leaf') {
            return p.split(/[\\/]/).filter(Boolean).pop() || p;
          } else {
            const parts = p.split(/[\\/]/).filter(Boolean);
            parts.pop();
            return parts.join('\\');
          }
        };
        if (Array.isArray(srcVal)) {
          vars.set(targetVar, srcVal.map(transform));
        } else {
          vars.set(targetVar, transform(srcVal));
        }
      }
    }
  }

  return vars;
}

/**
 * Resolves a raw target argument, supporting variables with suffixes / wildcards (e.g. "$dir\*")
 */
function resolveTarget(val: string, vars: Map<string, string | string[]>): string[] {
  if (!val) return [];
  const clean = val.replace(/["']/g, '').trim();
  const match = /^\$([a-zA-Z0-9_:]+)(.*)$/.exec(clean);
  if (match) {
    const varName = match[1];
    const suffix = match[2];
    const lookup = vars.get(varName);
    if (Array.isArray(lookup)) {
      return lookup.map(item => `${item}${suffix}`);
    }
    if (typeof lookup === 'string') {
      const expanded = expandVarString(lookup, vars);
      return [`${expanded}${suffix}`];
    }
  }
  const expanded = expandVarString(clean, vars);
  return [expanded];
}

function isCriticalRegistry(regPath: string): boolean {
  const lower = regPath.toLowerCase();
  return (
    lower.includes('hklm:\\sam') ||
    lower.includes('hklm:\\security') ||
    lower.includes('windows defender') ||
    lower.includes('currentcontrolset\\control\\lsa')
  );
}

function deduplicateImpactItems(items: ImpactItem[]): ImpactItem[] {
  const seen = new Set<string>();
  const out: ImpactItem[] = [];
  for (const it of items) {
    const key = `${it.category}:${it.action}:${it.target.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}

/**
 * Main Pure Static Analyzer
 */
export function analyzeScriptImpact(
  content: string,
  manifest?: ScriptManifestLike
): ScriptImpactAnalysis {
  if (!content || !content.trim()) {
    return {
      riskLevel: 'safe',
      requiresAdmin: false,
      hasDryRunSupport: false,
      items: [],
      summary: {
        totalItems: 0,
        registryCount: 0,
        servicesCount: 0,
        tasksCount: 0,
        filesystemCount: 0,
        networkCount: 0,
        processCount: 0,
        criticalCount: 0,
      },
      warnings: [],
    };
  }

  const clean = content.replace(/^\uFEFF/, '');
  const cleanWithoutBlockComments = stripBlockComments(clean);
  const lines = cleanWithoutBlockComments.split(/\r?\n/);
  const vars = parsePowerShellVariables(cleanWithoutBlockComments);
  const items: ImpactItem[] = [];
  const warnings: string[] = [];

  // Elevation markers detection
  const requiresAdminMarker =
    cleanWithoutBlockComments.includes('[Security.Principal.WindowsPrincipal]') ||
    /#Requires\s+-RunAsAdministrator/i.test(cleanWithoutBlockComments) ||
    /\$isAdmin\b/i.test(cleanWithoutBlockComments) ||
    /Start-Process\s+.*-Verb\s+RunAs/i.test(cleanWithoutBlockComments) ||
    Boolean(manifest?.requiresAdmin);

  // Dry-Run support detection
  const hasDryRunSupport =
    /\[switch\]\$DryRun/i.test(cleanWithoutBlockComments) ||
    /\$DryRun\b/i.test(cleanWithoutBlockComments) ||
    /\[CmdletBinding\(SupportsShouldProcess/i.test(cleanWithoutBlockComments) ||
    /-WhatIf\b/i.test(cleanWithoutBlockComments);

  // Parse Hashtables in scripts (Key and Name in any order, single or multiline)
  if (cleanWithoutBlockComments.includes('@{')) {
    const hashtableBlockRegex = /@\{([^{}]+)\}/g;
    let hbMatch: RegExpExecArray | null;
    while ((hbMatch = hashtableBlockRegex.exec(cleanWithoutBlockComments)) !== null) {
      const body = hbMatch[1];
      const keyMatch = /\bKey\s*=\s*["']([^"']+)["']/i.exec(body);
      const nameMatch = /\bName\s*=\s*["']([^"']+)["']/i.exec(body);
      if (keyMatch && nameMatch) {
        const key = keyMatch[1];
        const name = nameMatch[1];
        const valMatch = /\bValue\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\r\n]+))/i.exec(body);
        const val = valMatch ? (valMatch[1] ?? valMatch[2] ?? valMatch[3] ?? '').trim() : '';
        const fullTarget = `${key}\\${name}`;
        items.push({
          id: `reg-hash-${key}-${name}`,
          category: 'registry',
          action: 'modify',
          target: fullTarget,
          detail: val ? `Value: ${val}` : 'Set policy registry key',
          rawLine: hbMatch[0],
          isCritical: isCriticalRegistry(key),
        });
      }
    }
  }

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    // Generic foreach loop binding during traversal
    if (/foreach/i.test(trimmed)) {
      const feMatch = /foreach\s*\(\s*\$([a-zA-Z0-9_]+)\s+in\s+\$([a-zA-Z0-9_]+)\s*\)/i.exec(trimmed);
      if (feMatch) {
        const loopVar = feMatch[1];
        const arrName = feMatch[2];
        const arrVal = vars.get(arrName);
        if (arrVal) {
          vars.set(loopVar, arrVal);
        }
      }

      const feInlineMatch = /foreach\s*\(\s*\$([a-zA-Z0-9_]+)\s+in\s+@\(\s*([^)]*)\s*\)\s*\)/i.exec(trimmed);
      if (feInlineMatch) {
        const loopVar = feInlineMatch[1];
        const inlineItems = Array.from(feInlineMatch[2].matchAll(/["']([^"']+)["']/g)).map(m => m[1]);
        if (inlineItems.length > 0) {
          vars.set(loopVar, inlineItems);
        }
      }
    }

    // Split-Path tracking during traversal
    if (/Split-Path/i.test(trimmed)) {
      const spMatch = /^\$([a-zA-Z0-9_]+)\s*=\s*Split-Path\s+(?:-Path\s+)?\$([a-zA-Z0-9_]+)(?:\s+-(Leaf|Parent))?/i.exec(trimmed);
      if (spMatch) {
        const targetVar = spMatch[1];
        const srcVar = spMatch[2];
        const mode = (spMatch[3] || 'Parent').toLowerCase();
        const srcVal = vars.get(srcVar);
        if (srcVal) {
          const transform = (p: string) => {
            if (mode === 'leaf') {
              return p.split(/[\\/]/).filter(Boolean).pop() || p;
            } else {
              const parts = p.split(/[\\/]/).filter(Boolean);
              parts.pop();
              return parts.join('\\');
            }
          };
          if (Array.isArray(srcVal)) {
            vars.set(targetVar, srcVal.map(transform));
          } else {
            vars.set(targetVar, transform(srcVal));
          }
        }
      }
    }

    // --- A. Windows Services ---
    // 1. Stop-Service
    if (/Stop-Service\b/i.test(trimmed)) {
      const { target: rawTarget } = extractServiceTarget(trimmed, 'Stop-Service');
      if (rawTarget) {
        const resolved = resolveTarget(rawTarget, vars);
        for (const target of resolved) {
          const isCrit = CRITICAL_SERVICES.has(target.toLowerCase());
          items.push({
            id: `svc-stop-${lineNum}-${target}`,
            category: 'service',
            action: 'stop',
            target,
            detail: 'Stop service process',
            lineNumber: lineNum,
            rawLine: trimmed,
            isCritical: isCrit,
          });
        }
      }
    }

    // 2. Start-Service / Restart-Service
    if (/(?:Start|Restart)-Service\b/i.test(trimmed)) {
      const isRestart = /Restart-Service\b/i.test(trimmed);
      const action: ImpactActionType = isRestart ? 'restart' : 'start';
      const cmdlet = isRestart ? 'Restart-Service' : 'Start-Service';
      const { target: rawTarget } = extractServiceTarget(trimmed, cmdlet);
      if (rawTarget) {
        const resolved = resolveTarget(rawTarget, vars);
        for (const target of resolved) {
          items.push({
            id: `svc-${action}-${lineNum}-${target}`,
            category: 'service',
            action,
            target,
            detail: `${action.charAt(0).toUpperCase() + action.slice(1)} service`,
            lineNumber: lineNum,
            rawLine: trimmed,
          });
        }
      }
    }

    // 3. Set-Service
    if (/Set-Service\b/i.test(trimmed)) {
      const { target: rawTarget, startupType: rawStartup } = extractServiceTarget(trimmed, 'Set-Service');
      if (rawTarget) {
        const resolved = resolveTarget(rawTarget, vars);
        const startupType = rawStartup || 'Modified';
        for (const target of resolved) {
          const isCrit = CRITICAL_SERVICES.has(target.toLowerCase()) && startupType.toLowerCase() === 'disabled';
          items.push({
            id: `svc-set-${lineNum}-${target}`,
            category: 'service',
            action: startupType.toLowerCase() === 'disabled' ? 'disable' : 'modify',
            target,
            detail: `StartupType: ${startupType}`,
            lineNumber: lineNum,
            rawLine: trimmed,
            isCritical: isCrit,
          });
        }
      }
    }

    // 4. CLI: sc.exe or net.exe commands
    if (/\bsc(?:\.exe)?\s/i.test(trimmed)) {
      const scMatch = /\bsc(?:\.exe)?\s+(stop|start|config)\s+(?:"([^"]+)"|'([^']+)'|([a-zA-Z0-9_\-\.\$]+))/i.exec(trimmed);
      if (scMatch) {
        const sub = scMatch[1].toLowerCase();
        const rawTarget = scMatch[2] || scMatch[3] || scMatch[4];
        const action: ImpactActionType = sub === 'stop' ? 'stop' : sub === 'start' ? 'start' : 'modify';
        const resolved = resolveTarget(rawTarget, vars);
        for (const target of resolved) {
          items.push({
            id: `svc-sc-${lineNum}-${target}`,
            category: 'service',
            action,
            target,
            detail: `sc.exe ${sub}`,
            lineNumber: lineNum,
            rawLine: trimmed,
            isCritical: CRITICAL_SERVICES.has(target.toLowerCase()),
          });
        }
      }
    }

    // --- B. Scheduled Tasks ---
    // 1. Disable-ScheduledTask
    if (/Disable-ScheduledTask\b/i.test(trimmed)) {
      const rawTarget = extractTaskTarget(trimmed, 'Disable-ScheduledTask');
      if (rawTarget) {
        const resolved = resolveTarget(rawTarget, vars);
        for (const target of resolved) {
          items.push({
            id: `task-dis-${lineNum}-${target}`,
            category: 'scheduled_task',
            action: 'disable',
            target,
            detail: 'Disable scheduled task trigger',
            lineNumber: lineNum,
            rawLine: trimmed,
          });
        }
      }
    }

    // 2. Enable-ScheduledTask
    if (/Enable-ScheduledTask\b/i.test(trimmed)) {
      const rawTarget = extractTaskTarget(trimmed, 'Enable-ScheduledTask');
      if (rawTarget) {
        const resolved = resolveTarget(rawTarget, vars);
        for (const target of resolved) {
          items.push({
            id: `task-en-${lineNum}-${target}`,
            category: 'scheduled_task',
            action: 'enable',
            target,
            detail: 'Enable scheduled task',
            lineNumber: lineNum,
            rawLine: trimmed,
          });
        }
      }
    }

    // 3. Register-ScheduledTask / Unregister-ScheduledTask
    if (/Unregister-ScheduledTask\b/i.test(trimmed)) {
      const rawTarget = extractTaskTarget(trimmed, 'Unregister-ScheduledTask');
      if (rawTarget) {
        const resolved = resolveTarget(rawTarget, vars);
        for (const target of resolved) {
          items.push({
            id: `task-unreg-${lineNum}-${target}`,
            category: 'scheduled_task',
            action: 'delete',
            target,
            detail: 'Unregister / Delete scheduled task',
            lineNumber: lineNum,
            rawLine: trimmed,
            isCritical: true,
          });
        }
      }
    }

    // --- C. Registry Mutations ---
    // 1. Set-ItemProperty
    if (/Set-ItemProperty\b/i.test(trimmed)) {
      const { path: rawPath, name: rawName, value: rawVal } = extractCmdletPathAndName(trimmed, 'Set-ItemProperty');
      if (rawPath) {
        const propName = rawName || '(Default)';
        const propVal = rawVal || '';
        const resolvedPaths = resolveTarget(rawPath, vars);
        for (const regPath of resolvedPaths) {
          const isCrit = isCriticalRegistry(regPath);
          items.push({
            id: `reg-set-${lineNum}-${regPath}-${propName}`,
            category: 'registry',
            action: 'modify',
            target: `${regPath}\\${propName}`,
            detail: propVal ? `Value: ${propVal}` : 'Modify registry property',
            lineNumber: lineNum,
            rawLine: trimmed,
            isCritical: isCrit,
          });
        }
      }
    }

    // 2. New-ItemProperty
    if (/New-ItemProperty\b/i.test(trimmed)) {
      const { path: rawPath, name: rawName, value: rawVal } = extractCmdletPathAndName(trimmed, 'New-ItemProperty');
      if (rawPath) {
        const propName = rawName || '';
        const propVal = rawVal || '';
        const resolvedPaths = resolveTarget(rawPath, vars);
        for (const regPath of resolvedPaths) {
          items.push({
            id: `reg-new-${lineNum}-${regPath}-${propName}`,
            category: 'registry',
            action: 'create',
            target: `${regPath}\\${propName}`,
            detail: propVal ? `Value: ${propVal}` : 'Create registry property',
            lineNumber: lineNum,
            rawLine: trimmed,
          });
        }
      }
    }

    // 3. Remove-ItemProperty
    if (/Remove-ItemProperty\b/i.test(trimmed)) {
      const { path: rawPath, name: rawName } = extractCmdletPathAndName(trimmed, 'Remove-ItemProperty');
      if (rawPath) {
        const propName = rawName || '';
        const resolvedPaths = resolveTarget(rawPath, vars);
        for (const regPath of resolvedPaths) {
          items.push({
            id: `reg-rem-${lineNum}-${regPath}-${propName}`,
            category: 'registry',
            action: 'delete',
            target: `${regPath}\\${propName}`,
            detail: 'Delete registry property',
            lineNumber: lineNum,
            rawLine: trimmed,
          });
        }
      }
    }

    // 4. New-Item / Remove-Item on Registry or Filesystem
    if (/(?:New|Remove)-Item\b/i.test(trimmed)) {
      const isNew = /New-Item\b/i.test(trimmed);
      const action: ImpactActionType = isNew ? 'create' : 'delete';
      const cmdlet = isNew ? 'New-Item' : 'Remove-Item';
      const { path: rawPath } = extractCmdletPathAndName(trimmed, cmdlet);
      if (rawPath) {
        const resolved = resolveTarget(rawPath, vars);
        for (const p of resolved) {
          const isReg = /^(?:HKLM|HKCU|HKCR|HKU|HKCC|Registry::)/i.test(p);
          if (isReg) {
            items.push({
              id: `reg-key-${action}-${lineNum}-${p}`,
              category: 'registry',
              action,
              target: p,
              detail: `${action === 'create' ? 'Create' : 'Delete'} registry key`,
              lineNumber: lineNum,
              rawLine: trimmed,
              isCritical: isCriticalRegistry(p),
            });
          } else {
            const isCrit = CRITICAL_PATHS.some(cp => p.toLowerCase().includes(cp));
            items.push({
              id: `fs-${action}-${lineNum}-${p}`,
              category: 'filesystem',
              action,
              target: p,
              detail: `${action === 'create' ? 'Create' : 'Delete'} filesystem item`,
              lineNumber: lineNum,
              rawLine: trimmed,
              isCritical: isCrit,
            });
          }
        }
      }
    }

    // 5. reg.exe add / delete
    if (/\breg(?:\.exe)?\s/i.test(trimmed)) {
      const regExeMatch = /reg(?:\.exe)?\s+(add|delete)\s+(?:"([^"]+)"|'([^']+)'|([^\s;]+))/i.exec(trimmed);
      if (regExeMatch) {
        const sub = regExeMatch[1].toLowerCase();
        const rawTarget = regExeMatch[2] || regExeMatch[3] || regExeMatch[4];
        const action: ImpactActionType = sub === 'add' ? 'modify' : 'delete';
        const resolved = resolveTarget(rawTarget, vars);
        for (const target of resolved) {
          items.push({
            id: `reg-exe-${lineNum}-${target}`,
            category: 'registry',
            action,
            target,
            detail: `reg.exe ${sub}`,
            lineNumber: lineNum,
            rawLine: trimmed,
            isCritical: isCriticalRegistry(target),
          });
        }
      }
    }

    // --- D. Filesystem Operations ---
    // [System.IO.File]::Delete or [System.IO.Directory]::Delete
    if (trimmed.includes('::Delete')) {
      const dotNetFileDelMatch = /\[System\.IO\.(?:File|Directory)\]::Delete\s*\(\s*([^)]+)\s*\)/i.exec(trimmed);
      if (dotNetFileDelMatch) {
        const rawTarget = dotNetFileDelMatch[1].replace(/["']/g, '');
        const resolved = resolveTarget(rawTarget, vars);
        for (const p of resolved) {
          items.push({
            id: `fs-dotnet-del-${lineNum}-${p}`,
            category: 'filesystem',
            action: 'delete',
            target: p,
            detail: '.NET File/Directory deletion',
            lineNumber: lineNum,
            rawLine: trimmed,
            isCritical: CRITICAL_PATHS.some(cp => p.toLowerCase().includes(cp)),
          });
        }
      }
    }

    // --- E. Network & QoS Policies ---
    // New/Set/Remove-NetQosPolicy
    if (/NetQosPolicy\b/i.test(trimmed)) {
      const qosMatch = /(?:New|Set|Remove)-NetQosPolicy\s+(?:-Name\s+)?(?:"([^"]+)"|'([^']+)'|([^\s;]+))/i.exec(trimmed);
      if (qosMatch) {
        const isRemove = /Remove-NetQosPolicy\b/i.test(trimmed);
        const isSet = /Set-NetQosPolicy\b/i.test(trimmed);
        const action: ImpactActionType = isRemove ? 'delete' : isSet ? 'modify' : 'create';
        const policyName = qosMatch[1] || qosMatch[2] || qosMatch[3];
        items.push({
          id: `net-qos-${lineNum}-${policyName}`,
          category: 'network',
          action,
          target: `NetQosPolicy: ${policyName}`,
          detail: 'DSCP QoS policy configuration',
          lineNumber: lineNum,
          rawLine: trimmed,
        });
      }
    }

    // Netsh network stack reset
    if (/netsh\s/i.test(trimmed)) {
      const netshMatch = /netsh\s+(winsock|int\s+ip)\s+reset/i.exec(trimmed);
      if (netshMatch) {
        items.push({
          id: `net-netsh-${lineNum}`,
          category: 'network',
          action: 'restart',
          target: `TCP/IP Stack: ${netshMatch[1]}`,
          detail: 'Reset network configuration stack',
          lineNumber: lineNum,
          rawLine: trimmed,
          isCritical: true,
        });
      }
    }

    // Adapter toggle
    if (/NetAdapter\b/i.test(trimmed)) {
      const adapterMatch = /(Disable|Enable)-NetAdapter\s+(?:-Name\s+)?(?:"([^"]+)"|'([^']+)'|([^\s;]+))/i.exec(trimmed);
      if (adapterMatch) {
        const action: ImpactActionType = adapterMatch[1].toLowerCase() === 'disable' ? 'disable' : 'enable';
        const target = adapterMatch[2] || adapterMatch[3] || adapterMatch[4];
        items.push({
          id: `net-adapter-${lineNum}-${target}`,
          category: 'network',
          action,
          target: `NetAdapter: ${target}`,
          detail: `${action} network adapter`,
          lineNumber: lineNum,
          rawLine: trimmed,
        });
      }
    }

    // --- F. Processes ---
    if (/Stop-Process\b/i.test(trimmed)) {
      const procStopMatch = /Stop-Process\s+.*?-Name\s+(?:"([^"]+)"|'([^']+)'|([^\s;]+))/i.exec(trimmed);
      if (procStopMatch) {
        const target = procStopMatch[1] || procStopMatch[2] || procStopMatch[3];
        items.push({
          id: `proc-stop-${lineNum}-${target}`,
          category: 'process',
          action: 'stop',
          target: target.endsWith('.exe') ? target : `${target}.exe`,
          detail: 'Terminate active process',
          lineNumber: lineNum,
          rawLine: trimmed,
        });
      }
    }
  });

  // Deduplicate items
  const uniqueItems = deduplicateImpactItems(items);

  // Compute summary
  const summary: ImpactSummary = {
    totalItems: uniqueItems.length,
    registryCount: uniqueItems.filter(i => i.category === 'registry').length,
    servicesCount: uniqueItems.filter(i => i.category === 'service').length,
    tasksCount: uniqueItems.filter(i => i.category === 'scheduled_task').length,
    filesystemCount: uniqueItems.filter(i => i.category === 'filesystem').length,
    networkCount: uniqueItems.filter(i => i.category === 'network').length,
    processCount: uniqueItems.filter(i => i.category === 'process').length,
    criticalCount: uniqueItems.filter(i => i.isCritical).length,
  };

  // Determine Overall Risk Level
  let calculatedRisk: 'safe' | 'elevated' | 'critical' = 'safe';
  if (manifest?.riskLevel === 'critical' || summary.criticalCount > 0) {
    calculatedRisk = 'critical';
  } else if (
    manifest?.riskLevel === 'elevated' ||
    requiresAdminMarker ||
    summary.totalItems > 0 ||
    summary.servicesCount > 0 ||
    summary.registryCount > 0
  ) {
    calculatedRisk = 'elevated';
  }

  const finalRequiresAdmin =
    requiresAdminMarker ||
    summary.servicesCount > 0 ||
    uniqueItems.some(i => i.target.toUpperCase().includes('HKLM:'));

  if (summary.criticalCount > 0) {
    warnings.push('Script modifies critical operating system components or security services.');
  }

  return {
    riskLevel: calculatedRisk,
    requiresAdmin: finalRequiresAdmin,
    hasDryRunSupport,
    items: uniqueItems,
    summary,
    warnings,
  };
}
