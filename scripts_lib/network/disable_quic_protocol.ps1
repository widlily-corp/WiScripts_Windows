Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "      Disable QUIC Protocol by Antigravity" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

$ChromePath = "HKLM:\SOFTWARE\Policies\Google\Chrome"
$EdgePath = "HKLM:\SOFTWARE\Policies\Microsoft\Edge"

if (!(Test-Path $ChromePath)) { New-Item -Path $ChromePath -Force | Out-Null }
if (!(Test-Path $EdgePath)) { New-Item -Path $EdgePath -Force | Out-Null }

Write-Host "Disabling QUIC in Google Chrome..."
New-ItemProperty -Path $ChromePath -Name "QuicAllowed" -PropertyType DWord -Value 0 -Force | Out-Null

Write-Host "Disabling QUIC in Microsoft Edge..."
New-ItemProperty -Path $EdgePath -Name "QuicAllowed" -PropertyType DWord -Value 0 -Force | Out-Null

Write-Host "=============================================" -ForegroundColor Green
Write-Host "QUIC Protocol Successfully Disabled!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

Read-Host "Press Enter to exit..."
