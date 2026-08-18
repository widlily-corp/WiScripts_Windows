# Local Network Setup Script (Universal ASCII version)
# RUN AS ADMINISTRATOR

Write-Host "Starting local network setup..." -ForegroundColor Cyan

# 0. Admin check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Please run this script as Administrator!" -ForegroundColor Red
    Read-Host "Press Enter to exit..."
    exit
}

# 1. Get localized name for Everyone (S-1-1-0)
$EveryoneID = New-Object System.Security.Principal.SecurityIdentifier("S-1-1-0")
$EveryoneName = $EveryoneID.Translate([System.Security.Principal.NTAccount]).Value

# 2. Enable Guest account and allow guest access without password
Write-Host "Disabling password protected sharing..." -ForegroundColor Cyan
$GuestAcc = Get-WmiObject Win32_UserAccount -Filter "LocalAccount=True AND SID LIKE '%-501'"
if ($GuestAcc) {
    net user $($GuestAcc.Name) /active:yes | Out-Null
}
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" -Name "AllowInsecureGuestAuth" -Value 1 -Force -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\Lsa" -Name "everyoneincludesanonymous" -Value 1 -Force -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\Lsa" -Name "restrictanonymous" -Value 0 -Force -ErrorAction SilentlyContinue

# 3. Network profile
$networks = Get-NetConnectionProfile
foreach ($net in $networks) {
    if ($net.NetworkCategory -eq 'Public') {
        Set-NetConnectionProfile -InterfaceIndex $net.InterfaceIndex -NetworkCategory Private
    }
}

# 4. Firewall settings using system identifiers (Language independent)
Write-Host "Configuring firewall rules..." -ForegroundColor Cyan
Enable-NetFirewallRule -Group "@FirewallAPI.dll,-28502" -ErrorAction SilentlyContinue | Out-Null
Enable-NetFirewallRule -Group "@FirewallAPI.dll,-28533" -ErrorAction SilentlyContinue | Out-Null

# 5. Services
$services = @('fdPHost', 'FDResPub', 'LanmanWorkstation', 'LanmanServer')
foreach ($service in $services) {
    Set-Service -Name $service -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service -Name $service -ErrorAction SilentlyContinue
}

# 6. Share creation
$sharePath = "C:\LocalShare"
if (-not (Test-Path $sharePath)) {
    New-Item -ItemType Directory -Path $sharePath | Out-Null
}

Write-Host "Creating network share at C:\LocalShare..." -ForegroundColor Cyan
Remove-SmbShare -Name "LocalShare" -Force -ErrorAction SilentlyContinue
New-SmbShare -Name "LocalShare" -Path $sharePath -FullAccess $EveryoneName -Description "Shared Folder" -ErrorAction SilentlyContinue | Out-Null

# 7. NTFS Permissions
$acl = Get-Acl $sharePath
$permission = $EveryoneName, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow"
$accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $permission
$acl.SetAccessRule($accessRule)
Set-Acl -Path $sharePath -AclObject $acl

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "Setup Completed SUCCESSFULLY!" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Cyan
Read-Host "Press Enter to exit..."
