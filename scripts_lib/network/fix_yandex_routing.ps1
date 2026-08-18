Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "      Yandex Browser Fix by Antigravity" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

Write-Host "Closing Yandex Browser completely..."
Stop-Process -Name "browser" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Disabling broken QUIC protocol for Yandex Browser..."
$YandexPath = "HKLM:\SOFTWARE\Policies\Yandex\Browser"
if (!(Test-Path $YandexPath)) { New-Item -Path $YandexPath -Force | Out-Null }
New-ItemProperty -Path $YandexPath -Name "QuicAllowed" -PropertyType DWord -Value 0 -Force | Out-Null

Write-Host "=============================================" -ForegroundColor Green
Write-Host "Fix applied! Now starting browser..." -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

Start-Process "C:\Program Files\Yandex\YandexBrowser\Application\browser.exe" -ArgumentList "https://ya.ru"
