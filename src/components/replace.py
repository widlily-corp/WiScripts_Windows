import os
import re

def replace_in_file(filepath, replacements, add_import=True, add_hook=True):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if add_import and "useTranslation" not in content:
        content = re.sub(r"(import React.*?;\n)", r"\1import { useTranslation } from 'react-i18next';\n", content)
    
    if add_hook:
        content = re.sub(r"(export function \w+\(\) \{\n)", r"\1  const { t } = useTranslation();\n", content)
        
    for old, new in replacements:
        content = content.replace(old, new)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Updated {filepath}")

# Dashboard replacements
dash_file = r'c:\Users\Widlily\Documents\projects\WiScripts_Windows\src\components\Dashboard.tsx'
dash_repl = [
    ("System Optimization Readiness", "{t('dashboard.systemOptimizationReadiness')}"),
    ("Windows build {systemInfo?.osBuild || '22631'} detected.{' '}\n            {selectedCount} optimizations currently queued.", "{t('dashboard.statusDesc', { build: systemInfo?.osBuild || '22631', count: selectedCount })}"),
    ("Apply Recommended Presets", "{t('dashboard.applyRecommendedPresets')}"),
    ("Real-Time System Telemetry & Hardware Probe", "{t('dashboard.realTimeTelemetry')}"),
    ("{isPollingActive ? 'Live Polling' : 'Paused'}", "{isPollingActive ? t('dashboard.livePolling') : t('dashboard.paused')}"),
    ("Interval:", "{t('dashboard.interval')}"),
    ("1 sec", "{t('dashboard.sec1')}"),
    ("2 sec", "{t('dashboard.sec2')}"),
    ("5 sec", "{t('dashboard.sec5')}"),
    ("10 sec", "{t('dashboard.sec10')}"),
    ("<span>Pause</span>", "<span>{t('dashboard.pause')}</span>"),
    ("<span>Resume</span>", "<span>{t('dashboard.resume')}</span>"),
    ('title="Poll Now"', 'title={t(\'dashboard.pollNow\')}'),
    ("CPU Usage", "{t('dashboard.cpuUsage')}"),
    ("RAM Usage", "{t('dashboard.ramUsage')}"),
    ("Disk Read Rate", "{t('dashboard.diskReadRate')}"),
    ("Network RX", "{t('dashboard.networkRx')}"),
    ('title="CPU Core Package Sensor"', 'title={t(\'dashboard.cpuSensor\')}'),
    ('sensorSource="ACPI / sysinfo Multi-Tier Pipeline"', 'sensorSource={t(\'dashboard.cpuSensorSource\')}'),
    ('title="GPU Hardware Thermal Sensor"', 'title={t(\'dashboard.gpuSensor\')}'),
    ('sensorSource="NVIDIA SMI / Open Hardware Sensor"', 'sensorSource={t(\'dashboard.gpuSensorSource\')}'),
    ("Operating System", "{t('dashboard.operatingSystem')}"),
    ("Build {systemInfo?.osBuild || '22631.3880'} ({systemInfo?.osVersion || '23H2'})", "{t('dashboard.build', { build: systemInfo?.osBuild || '22631.3880', version: systemInfo?.osVersion || '23H2' })}"),
    ("Telemetry Service", "{t('dashboard.telemetryService')}"),
    ("DiagTrack service active", "{t('dashboard.diagTrackActive')}"),
    ("Core Optimization Catalog Preview", "{t('dashboard.coreOptimizationCatalog')}"),
    ("Telemetry removal, bloatware cleanup, privacy hardening, and service optimization", "{t('dashboard.coreOptimizationDesc')}"),
    ("View All Rules ({optimizations.length}) &rarr;", "{t('dashboard.viewAllRules', { count: optimizations.length })}"),
    (">{cat}<", ">{t(`dashboard.categories.${cat}`)}<"),
    ("active</span>", "{t('dashboard.active')}</span>"),
    ("<span className=\"font-mono text-[10px] text-text-muted uppercase px-2 py-0.5 rounded-[4px] bg-surface-subtle border border-border-subtle shrink-0\">\n                {item.category}\n              </span>", "<span className=\"font-mono text-[10px] text-text-muted uppercase px-2 py-0.5 rounded-[4px] bg-surface-subtle border border-border-subtle shrink-0\">\n                {t(`dashboard.categories.${item.category}`)}\n              </span>")
]
replace_in_file(dash_file, dash_repl)

# OptimizationView replacements
opt_file = r'c:\Users\Widlily\Documents\projects\WiScripts_Windows\src\components\OptimizationView.tsx'
opt_repl = [
    ("System Optimization & Debloat Engine", "{t('optimization.title')}"),
    ("Sophia-Script inspired rule catalog. Granular telemetry removal, bloatware cleanup, and system service hardening.", "{t('optimization.desc')}"),
    ("Total Catalog", "{t('optimization.totalCatalog')}"),
    ("Selected", "{t('optimization.selected')}"),
    ("{isExecuting ? 'Executing Optimizations...' : `Execute Selected (${selectedCount})`}", "{isExecuting ? t('optimization.executing') : t('optimization.executeSelected', { count: selectedCount })}"),
    ("title={!isElevated && !dryRunMode ? 'Administrator privileges required for live execution' : ''}", "title={!isElevated && !dryRunMode ? t('optimization.adminRequired') : ''}"),
    ("Presets:", "{t('optimization.presets')}"),
    ("Recommended (", "{t('optimization.recommended')} ("),
    ("Telemetry-Only (", "{t('optimization.telemetryOnly')} ("),
    ("Full Debloat (", "{t('optimization.fullDebloat')} ("),
    ("Clear Selection", "{t('optimization.clearSelection')}"),
    ('placeholder="Search rules, commands..."', 'placeholder={t(\'optimization.searchPlaceholder\')}'),
    ("No optimization rules match your filter", "{t('optimization.noRulesMatch')}"),
    ("Try adjusting your search keyword or selected category tab.", "{t('optimization.adjustSearch')}"),
    ("High Risk", "{t('optimization.highRisk')}"),
    ("Medium Risk", "{t('optimization.mediumRisk')}"),
    ("Low Risk", "{t('optimization.lowRisk')}"),
    ("{item.isReversible ? 'Reversible' : 'Non-Reversible'}", "{item.isReversible ? t('optimization.reversible') : t('optimization.nonReversible')}"),
    ("{isExpanded ? 'Hide Undo' : 'Inspect Undo'}", "{isExpanded ? t('optimization.hideUndo') : t('optimization.inspectUndo')}"),
    ("Undo PowerShell Script:", "{t('optimization.undoCommand')}"),
    ("aria-label={`Select rule ${item.title}`}", "aria-label={t('optimization.selectRule', { title: item.title })}"),
    ("title: `Execute ${selectedCount} Selected Optimization Rules`", "title: t('optimization.safetyModalTitle', { count: selectedCount })"),
    ("description: `Targeting Windows telemetry, services, and debloat configurations. Dry-run safety mode is currently ${\n        dryRunMode ? 'ACTIVE' : 'DISABLED'\n      }.`", "description: t('optimization.safetyModalDesc', { mode: dryRunMode ? t('optimization.active') : t('optimization.disabled') })"),
    ("title: 'Optimizations Failed'", "title: t('optimization.toastFailedTitle')"),
    ("message: errMsg,", "message: t('optimization.toastFailedMsg', { msg: errMsg }),"),
    ("title: 'Optimizations Applied'", "title: t('optimization.toastSuccessTitle')"),
    ("message: `Successfully executed ${selectedCount} optimization rules.`", "message: t('optimization.toastSuccessMsg', { count: selectedCount })"),
    ("<span>{cat.label}</span>", "<span>{t(`optimization.categories.${cat.id}`)}</span>"),
    ("{item.category}", "{t(`optimization.categories.${item.category}`)}")
]
replace_in_file(opt_file, opt_repl)

# PackageManagerView replacements
pkg_file = r'c:\Users\Widlily\Documents\projects\WiScripts_Windows\src\components\PackageManagerView.tsx'
pkg_repl = [
    ("Package & Bloatware Manager", "{t('packageManager.title')}"),
    ("Search and manage WinGet packages or clean preinstalled UWP AppX bloatware.", "{t('packageManager.desc')}"),
    ("<span>WinGet Packages</span>", "<span>{t('packageManager.wingetPackages')}</span>"),
    ("<span>UWP App Debloater</span>", "<span>{t('packageManager.uwpDebloater')}</span>"),
    ('placeholder="Search packages by name or ID (e.g. 7zip, Git.Git, vscode)..."', 'placeholder={t(\'packageManager.searchPlaceholder\')}'),
    ("<span>Search</span>", "<span>{t('packageManager.search')}</span>"),
    ("Quick Searches:", "{t('packageManager.quickSearches')}"),
    ("Package Search Results ({wingetPackages.length})", "{t('packageManager.searchResults', { count: wingetPackages.length })}"),
    ("Dry-Run Active", "{t('packageManager.dryRunActive')}"),
    ("Executing WinGet package search query...", "{t('packageManager.executingSearch')}"),
    ("No WinGet packages returned. Enter a search term above or click a quick preset to begin.", "{t('packageManager.noPackages')}"),
    ("<th>Name</th>", "<th>{t('packageManager.colName')}</th>"),
    ("<th>Package ID</th>", "<th>{t('packageManager.colPackageId')}</th>"),
    ("<th>Version</th>", "<th>{t('packageManager.colVersion')}</th>"),
    ("<th>Source</th>", "<th>{t('packageManager.colSource')}</th>"),
    ("<th>Actions</th>", "<th>{t('packageManager.colActions')}</th>"),
    (">Name<", ">{t('packageManager.colName')}<"),
    (">Package ID<", ">{t('packageManager.colPackageId')}<"),
    (">Version<", ">{t('packageManager.colVersion')}<"),
    (">Source<", ">{t('packageManager.colSource')}<"),
    (">Actions<", ">{t('packageManager.colActions')}<"),
    ("<span>Install</span>", "<span>{t('packageManager.install')}</span>"),
    ("<span>Upgrade</span>", "<span>{t('packageManager.upgrade')}</span>"),
    ('placeholder="Filter UWP packages (e.g. Xbox, Bing, YourPhone)..."', 'placeholder={t(\'packageManager.filterUwpPlaceholder\')}'),
    ("<span>Hide Framework Packages</span>", "<span>{t('packageManager.hideFrameworks')}</span>"),
    ("<span>Refresh List</span>", "<span>{t('packageManager.refreshList')}</span>"),
    ("Installed AppX Packages ({filteredUwpApps.length} shown of {uwpApps.length})", "{t('packageManager.installedAppX', { count: filteredUwpApps.length, total: uwpApps.length })}"),
    ("Scanning system for installed UWP AppX packages...", "{t('packageManager.scanningUwp')}"),
    ("No UWP packages match current filter criteria.", "{t('packageManager.noUwpMatch')}"),
    (">Application Name<", ">{t('packageManager.colAppName')}<"),
    (">Package Full Name<", ">{t('packageManager.colPackageFullName')}<"),
    (">Publisher ID<", ">{t('packageManager.colPublisherId')}<"),
    (">Action<", ">{t('packageManager.colActions')}<"),
    ("<span>Uninstall</span>", "<span>{t('packageManager.uninstall')}</span>")
]
replace_in_file(pkg_file, pkg_repl)

# SystemCleaner replacements
clean_file = r'c:\Users\Widlily\Documents\projects\WiScripts_Windows\src\components\SystemCleaner.tsx'
clean_repl = [
    ("System Cleaner & Cache Optimizer", "{t('systemCleaner.title')}"),
    ("Scan and purge Windows temporary files, system logs, update downloads, and browser caches.", "{t('systemCleaner.desc')}"),
    ("{isScanning ? 'Scanning...' : 'Scan System Junk'}", "{isScanning ? t('systemCleaner.scanning') : t('systemCleaner.scanSystemJunk')}"),
    ("{isCleaning\n                  ? 'Cleaning...'\n                  : `Clean Selected (${selectedCatIds.size})`}", "{isCleaning ? t('systemCleaner.cleaning') : t('systemCleaner.cleanSelected', { count: selectedCatIds.size })}"),
    ("Total Junk Detected", "{t('systemCleaner.totalJunkDetected')}"),
    ("Files Count", "{t('systemCleaner.filesCount')}"),
    ("Selected for Cleanup", "{t('systemCleaner.selectedForCleanup')}"),
    ("{formatBytes(totalSelectedBytes)} ({totalSelectedFiles} files)", "{formatBytes(totalSelectedBytes)} ({totalSelectedFiles} {t('systemCleaner.files')})"),
    ("Category Breakdown ({scanResult.categories.length})", "{t('systemCleaner.categoryBreakdown', { count: scanResult.categories.length })}"),
    (">Select All<", ">{t('systemCleaner.selectAll')}<"),
    (">Deselect All<", ">{t('systemCleaner.deselectAll')}<"),
    ("{cat.fileCount} files", "{cat.fileCount} {t('systemCleaner.files')}"),
    ("Target Paths", "{t('systemCleaner.targetPaths')}"),
    ("No system junk scan results yet", "{t('systemCleaner.noScanResults')}"),
    ("Click &quot;Scan System Junk&quot; to calculate total temporary file usage across Windows %TEMP%, update caches, and browser directories.", "{t('systemCleaner.noScanDesc')}"),
    ("<span>Start Scan</span>", "<span>{t('systemCleaner.startScan')}</span>"),
    ("Confirm System Junk Cleanup", "{t('systemCleaner.confirmTitle')}"),
    ("This action will purge temporary files from disk.", "{t('systemCleaner.confirmDesc')}"),
    ("Selected Categories:", "{t('systemCleaner.confirmSelectedCat')}"),
    ("Total Space to Free:", "{t('systemCleaner.confirmSpaceToFree')}"),
    ("Total Files Affected:", "{t('systemCleaner.confirmFilesAffected')}"),
    ("Safety Dry-Run Mode is ACTIVE. Execution will be simulated without deleting actual files.", "{t('systemCleaner.safetyDryRunMsg')}"),
    ("Cancel", "{t('systemCleaner.cancel')}"),
    ("Proceed Cleanup", "{t('systemCleaner.proceedCleanup')}"),
    ("title: 'Dry-Run Cleanup Completed',", "title: t('systemCleaner.dryRunTitle'),"),
    ("message: `Simulated cleanup of ${formatBytes(totalSelectedBytes)} across ${totalSelectedFiles} files.`", "message: t('systemCleaner.dryRunMsg', { bytes: formatBytes(totalSelectedBytes), files: totalSelectedFiles })"),
    ("title: 'System Cleanup Completed',", "title: t('systemCleaner.successTitle'),"),
    ("message: `Freed ${formatBytes(res.bytesFreed)} across ${res.filesRemoved} files (${res.skippedFilesCount} locked files skipped).`", "message: t('systemCleaner.successMsg', { bytes: formatBytes(res.bytesFreed), files: res.filesRemoved, skipped: res.skippedFilesCount })"),
    ("title: 'Cleanup Error',", "title: t('systemCleaner.errorTitle'),"),
    ("title: 'Scan Error',", "title: t('systemCleaner.scanErrorTitle'),")
]
replace_in_file(clean_file, clean_repl)
