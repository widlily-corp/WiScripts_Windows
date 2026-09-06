/**
 * Structured Script Execution Log Exporter
 *
 * Generates structured, timestamped plain-text (.log) artifacts containing
 * execution metadata (ID, script name, duration, elevation, status, exit code)
 * and terminal stream outputs, and triggers browser downloads.
 */

import type { ScriptExecutionRecord } from '../store/slices/scriptRunnerSlice';

export interface LogExportMetadata {
  scriptName: string;
  scriptId?: string;
  scriptType: string;
  status: string;
  durationMs: number;
  elevated: boolean;
  isDryRun: boolean;
  exitCode: number;
  timestamp: string;
  totalLines: number;
}

/**
 * Formats a ScriptExecutionRecord into a standardized ASCII-bordered log text.
 */
export function generateStructuredLogText(record: ScriptExecutionRecord): string {
  const durationSec = (record.durationMs / 1000).toFixed(2);
  const border = '='.repeat(80);
  const divider = '-'.repeat(80);

  const headerLines = [
    border,
    ` WiScripts Windows — Script Execution Output Log`,
    border,
    ` Script Name : ${record.scriptName}`,
    record.scriptId ? ` Script ID   : ${record.scriptId}` : null,
    ` Script Type : ${record.scriptType.toUpperCase()}`,
    ` Timestamp   : ${record.timestamp}`,
    ` Duration    : ${durationSec}s (${record.durationMs} ms)`,
    ` Status      : ${record.status.toUpperCase()}`,
    ` Exit Code   : ${record.exitCode}`,
    ` Privilege   : ${record.elevated ? 'Elevated (Administrator / UAC)' : 'Standard User'}`,
    ` Mode        : ${record.isDryRun ? 'DRY-RUN (Simulated)' : 'LIVE EXECUTION'}`,
    ` Total Lines : ${record.logLines.length}`,
    divider,
    ` OUTPUT LOG STREAM:`,
    divider,
  ].filter(Boolean);

  const logBody =
    record.logLines.length > 0
      ? record.logLines
          .map((l) => `[${l.timestamp}] [${l.stream.toUpperCase()}] ${l.line}`)
          .join('\r\n')
      : '[NO OUTPUT LOG LINES CAPTURED]';

  const footer = [
    '\r\n' + divider,
    ` END OF EXECUTION LOG — STATUS: ${record.status.toUpperCase()} (EXIT CODE: ${record.exitCode})`,
    border,
  ].join('\r\n');

  return `${headerLines.join('\r\n')}\r\n${logBody}${footer}\r\n`;
}

/**
 * Triggers a client-side file download of the structured log file.
 */
export function downloadScriptLogFile(record: ScriptExecutionRecord): void {
  const logContent = generateStructuredLogText(record);
  const safeName = (record.scriptName || 'custom_script')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .toLowerCase();
  const dateStr = new Date(record.timestamp)
    .toISOString()
    .replace(/[:.]/g, '-');
  const filename = `${safeName}_${dateStr}.log`;

  const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
