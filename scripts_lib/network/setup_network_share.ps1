param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "Configuring network shares requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Local Network Sharing & Discovery Setup" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$EveryoneID = New-Object System.Security.Principal.SecurityIdentifier("S-1-1-0")
$EveryoneName = $EveryoneID.Translate([System.Security.Principal.NTAccount]).Value

Write-Host "Configuring LanmanWorkstation guest authentication..."
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

Enable-NetFirewallRule -Group "@FirewallAPI.dll,-28502" -ErrorAction SilentlyContinue | Out-Null
Enable-NetFirewallRule -Group "@FirewallAPI.dll,-28533" -ErrorAction SilentlyContinue | Out-Null

$services = @('fdPHost', 'FDResPub', 'LanmanWorkstation', 'LanmanServer')
foreach ($svc in $services) {
    Set-Service -Name $svc -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service -Name $svc -ErrorAction SilentlyContinue
}

$sharePath = "C:\LocalShare"
if (-not (Test-Path $sharePath)) {
    New-Item -ItemType Directory -Path $sharePath -Force -ErrorAction SilentlyContinue | Out-Null
}

Remove-SmbShare -Name "LocalShare" -Force -ErrorAction SilentlyContinue
New-SmbShare -Name "LocalShare" -Path $sharePath -FullAccess $EveryoneName -Description "Shared Folder" -ErrorAction SilentlyContinue | Out-Null

$acl = Get-Acl $sharePath -ErrorAction SilentlyContinue
if ($acl) {
    $permission = $EveryoneName, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow"
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $permission
    $acl.SetAccessRule($accessRule)
    Set-Acl -Path $sharePath -AclObject $acl -ErrorAction SilentlyContinue
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Local network sharing folder created at C:\LocalShare." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
