<#
.SYNOPSIS
    Configures Local Network Sharing and Folder Permissions.
#>

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Configuring network shares requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

Write-Host "Starting local network setup..." -ForegroundColor Cyan

$EveryoneID = New-Object System.Security.Principal.SecurityIdentifier("S-1-1-0")
$EveryoneName = $EveryoneID.Translate([System.Security.Principal.NTAccount]).Value

Write-Host "Configuring LanmanWorkstation guest auth..." -ForegroundColor Cyan
$GuestAcc = Get-CimInstance Win32_UserAccount -Filter "LocalAccount=True AND SID LIKE '%-501'" -ErrorAction SilentlyContinue
if ($GuestAcc) {
    net user $($GuestAcc.Name) /active:yes 2>$null | Out-Null
}
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" -Name "AllowInsecureGuestAuth" -Value 1 -Force -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\Lsa" -Name "everyoneincludesanonymous" -Value 1 -Force -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\Lsa" -Name "restrictanonymous" -Value 0 -Force -ErrorAction SilentlyContinue

$networks = Get-NetConnectionProfile -ErrorAction SilentlyContinue
foreach ($net in $networks) {
    if ($net.NetworkCategory -eq 'Public') {
        Set-NetConnectionProfile -InterfaceIndex $net.InterfaceIndex -NetworkCategory Private -ErrorAction SilentlyContinue
    }
}

Write-Host "Configuring firewall rules for file sharing..." -ForegroundColor Cyan
Enable-NetFirewallRule -Group "@FirewallAPI.dll,-28502" -ErrorAction SilentlyContinue | Out-Null
Enable-NetFirewallRule -Group "@FirewallAPI.dll,-28533" -ErrorAction SilentlyContinue | Out-Null

$services = @('fdPHost', 'FDResPub', 'LanmanWorkstation', 'LanmanServer')
foreach ($service in $services) {
    Set-Service -Name $service -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service -Name $service -ErrorAction SilentlyContinue
}

$sharePath = "C:\LocalShare"
if (-not (Test-Path $sharePath)) {
    New-Item -ItemType Directory -Path $sharePath -Force -ErrorAction SilentlyContinue | Out-Null
}

Write-Host "Creating network share at C:\LocalShare..." -ForegroundColor Cyan
Remove-SmbShare -Name "LocalShare" -Force -ErrorAction SilentlyContinue
New-SmbShare -Name "LocalShare" -Path $sharePath -FullAccess $EveryoneName -Description "Shared Folder" -ErrorAction SilentlyContinue | Out-Null

$acl = Get-Acl $sharePath -ErrorAction SilentlyContinue
if ($acl) {
    $permission = $EveryoneName, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow"
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $permission
    $acl.SetAccessRule($accessRule)
    Set-Acl -Path $sharePath -AclObject $acl -ErrorAction SilentlyContinue
}

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "Network Share Setup Completed Successfully!" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Cyan

if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    Read-Host "Press Enter to exit..."
}
