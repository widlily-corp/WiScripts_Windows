param(
    [string]$ScriptsRoot = "$PSScriptRoot/../../scripts_lib",
    [switch]$VerboseOutput
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " WiScripts Windows - Static PowerShell AST and Integrity Validator" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Target Directory : $ScriptsRoot"
Write-Host " Verification Mode: Static AST (Zero Host Execution)"
Write-Host " Date             : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

$resolvedRoot = Resolve-Path $ScriptsRoot -ErrorAction SilentlyContinue
if (-not $resolvedRoot -or -not (Test-Path $resolvedRoot)) {
    Write-Error "Scripts root directory not found: $ScriptsRoot"
    exit 1
}

$ps1Files = Get-ChildItem -Path $resolvedRoot -Recurse -Filter "*.ps1" | Sort-Object FullName
if ($ps1Files.Count -eq 0) {
    Write-Error "No .ps1 files found in $resolvedRoot"
    exit 1
}

Write-Host "Found $($ps1Files.Count) PowerShell scripts to validate.`n" -ForegroundColor Yellow

$totalChecks = 0
$totalPassed = 0
$totalFailed = 0
$failures = @()

foreach ($file in $ps1Files) {
    $relPath = $file.FullName.Substring($resolvedRoot.Path.Length).TrimStart('\', '/')
    Write-Host "[$relPath]" -ForegroundColor White

    $rawBytes = [System.IO.File]::ReadAllBytes($file.FullName)
    $utf8Text = [System.Text.Encoding]::UTF8.GetString($rawBytes)

    # 1. PowerShell AST Syntax Parsing
    $totalChecks++
    $astErrors = $null
    $tokens = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$astErrors)
    
    if ($astErrors -and $astErrors.Count -gt 0) {
        $totalFailed++
        $errMsgs = ($astErrors | ForEach-Object { "$($_.Message) at line $($_.Extent.StartLineNumber)" }) -join "; "
        Write-Host "  [FAIL] AST Syntax Parsing: $errMsgs" -ForegroundColor Red
        $failures += "[$relPath] AST Syntax Error: $errMsgs"
    } else {
        $totalPassed++
        Write-Host "  [PASS] AST Syntax Parsing: 0 syntax errors" -ForegroundColor Green
    }

    # 2. param() placement verification
    $totalChecks++
    $cleanText = $utf8Text
    if ($cleanText.Length -ge 1 -and [int][char]$cleanText[0] -eq 0xFEFF) {
        $cleanText = $cleanText.Substring(1)
    }
    $trimmedText = $cleanText.TrimStart()
    $hasParamFirst = $trimmedText.StartsWith("param(") -or $trimmedText.StartsWith("param (") -or $trimmedText.StartsWith("param`r`n") -or $trimmedText.StartsWith("param`n") -or $trimmedText.StartsWith("<#")

    $paramBlockAst = $ast.ParamBlock
    $hasValidAstParam = $true
    if ($paramBlockAst) {
        $paramStartLine = $paramBlockAst.Extent.StartLineNumber
        if ($paramStartLine -gt 30) {
            $hasValidAstParam = $false
        }
    }

    if ($hasParamFirst -and $hasValidAstParam) {
        $totalPassed++
        Write-Host "  [PASS] param() Placement: Valid placement at script entry" -ForegroundColor Green
    } else {
        $totalFailed++
        Write-Host "  [FAIL] param() Placement: Script does not start cleanly with param() block" -ForegroundColor Red
        $failures += "[$relPath] param() block is not the first statement"
    }

    # 3. ASCII-only <# ... #> block comments check (PowerShell 5.1 CP1251 bug prevention)
    $totalChecks++
    $blockCommentRegex = [regex]'<#([\s\S]*?)#>'
    $matches = $blockCommentRegex.Matches($utf8Text)
    $hasNonAsciiInBlock = $false
    $nonAsciiSamples = @()

    foreach ($m in $matches) {
        $commentContent = $m.Groups[1].Value
        for ($i = 0; $i -lt $commentContent.Length; $i++) {
            $code = [int][char]$commentContent[$i]
            if ($code -gt 127) {
                $hasNonAsciiInBlock = $true
                $nonAsciiSamples += "$([char]$code) (0x$($code.ToString('X2')))"
                if ($nonAsciiSamples.Count -ge 5) { break }
            }
        }
        if ($hasNonAsciiInBlock) { break }
    }

    if (-not $hasNonAsciiInBlock) {
        $totalPassed++
        Write-Host "  [PASS] Block Comments Encoding: 100% ASCII (CP1251 safe)" -ForegroundColor Green
    } else {
        $totalFailed++
        $samplesStr = $nonAsciiSamples -join ", "
        Write-Host "  [FAIL] Block Comments Encoding: Non-ASCII characters detected in block comments: $samplesStr" -ForegroundColor Red
        $failures += "[$relPath] Non-ASCII character in block comments: $samplesStr"
    }

    # 4. UTF-8 BOM check for non-ASCII literals
    $totalChecks++
    $hasNonAsciiOverall = $false
    for ($i = 0; $i -lt $utf8Text.Length; $i++) {
        if ([int][char]$utf8Text[$i] -gt 127) {
            $hasNonAsciiOverall = $true
            break
        }
    }
    $hasBom = ($rawBytes.Length -ge 3 -and $rawBytes[0] -eq 0xEF -and $rawBytes[1] -eq 0xBB -and $rawBytes[2] -eq 0xBF)

    if ($hasNonAsciiOverall) {
        if ($hasBom) {
            $totalPassed++
            Write-Host "  [PASS] UTF-8 BOM: Present for non-ASCII literals" -ForegroundColor Green
        } else {
            $totalFailed++
            Write-Host "  [FAIL] UTF-8 BOM: Script contains non-ASCII characters but lacks UTF-8 BOM" -ForegroundColor Red
            $failures += "[$relPath] Missing UTF-8 BOM with non-ASCII content"
        }
    } else {
        $totalPassed++
        Write-Host "  [PASS] UTF-8 BOM: Script is pure ASCII (BOM optional)" -ForegroundColor Green
    }

    # 5. Interactive blocking cmdlets check
    $totalChecks++
    $blockingCmdlets = @('Read-Host', 'pause', 'System.Console]::ReadKey', '$host.UI.ReadLine')
    $hasBlocking = $false
    $blockingFound = @()
    foreach ($cmdlet in $blockingCmdlets) {
        if ($utf8Text -match [regex]::Escape($cmdlet)) {
            $hasBlocking = $true
            $blockingFound += $cmdlet
        }
    }
    if (-not $hasBlocking) {
        $totalPassed++
        Write-Host "  [PASS] Execution Safety: Zero interactive blocking prompts" -ForegroundColor Green
    } else {
        $totalFailed++
        $foundStr = $blockingFound -join ", "
        Write-Host "  [FAIL] Execution Safety: Interactive blocking call detected: $foundStr" -ForegroundColor Red
        $failures += "[$relPath] Interactive prompt detected: $foundStr"
    }

    Write-Host ""
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " STATIC AST VALIDATION SUMMARY" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Total Scripts Checked: $($ps1Files.Count)"
Write-Host " Total Assertions     : $totalChecks"
Write-Host " Passed Assertions    : $totalPassed"
Write-Host " Failed Assertions    : $totalFailed"
Write-Host "================================================================" -ForegroundColor Cyan

if ($totalFailed -gt 0) {
    Write-Host "`nFAILURES DETECTED:" -ForegroundColor Red
    foreach ($fail in $failures) {
        Write-Host "  - $fail" -ForegroundColor Red
    }
    exit 1
} else {
    Write-Host "`nSUCCESS: All $($ps1Files.Count) scripts passed static AST and encoding analysis with zero errors!" -ForegroundColor Green
    exit 0
}
