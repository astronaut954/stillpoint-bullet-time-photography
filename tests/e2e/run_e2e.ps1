# Teste que junta o Stillpoint e o Lightroom Classic de verdade (Windows). Ver tests/e2e/run_e2e.sh.
#   powershell -ExecutionPolicy Bypass -File tests\e2e\run_e2e.ps1
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$App = Join-Path $Root "build\windows-x64\Release\Stillpoint.exe"
$Base = Join-Path $Root "build\self-test-project"
$Report = Join-Path $Base "e2e-report.txt"
if (-not (Test-Path $App)) { Write-Host "Stillpoint is not built yet ($App)."; exit 2 }
if (Get-Process -Name Stillpoint -ErrorAction SilentlyContinue) { Write-Host "Close Stillpoint first, then run this again."; exit 2 }
if (Get-Process -Name Lightroom -ErrorAction SilentlyContinue) {
    Write-Host "Quit Lightroom Classic (File > Exit). Waiting for it to close..."
    for ($i = 0; $i -lt 120 -and (Get-Process -Name Lightroom -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Seconds 1 }
    if (Get-Process -Name Lightroom -ErrorAction SilentlyContinue) { Write-Host "Lightroom Classic is still open."; exit 2 }
}
New-Item -ItemType Directory -Force -Path $Base | Out-Null
Remove-Item $Report -ErrorAction SilentlyContinue
$env:STILLPOINT_FAKE_CAMERAS = "4"
$env:STILLPOINT_E2E = $Report
$env:STILLPOINT_E2E_SCRIPT = Join-Path $Root "tests\e2e\e2e.js"
$env:STILLPOINT_E2E_PROJECT = Join-Path $Base "Stillpoint Self-Test"
$proc = Start-Process -FilePath $App -PassThru
Write-Host "Test running: Stillpoint and Lightroom Classic open by themselves. Do not click in them (about 5 minutes)."
$shown = 0
$done = $false
for ($i = 0; $i -lt 1500 -and -not $done; $i++) {
    if (Test-Path $Report) {
        $lines = @(Get-Content $Report -Encoding UTF8)
        if ($lines.Count -gt $shown) { $lines[$shown..($lines.Count - 1)] | Where-Object { $_ -ne "END" } | ForEach-Object { Write-Host $_ }; $shown = $lines.Count }
        if ($lines -contains "END") { $done = $true }
    }
    if (-not $done -and $proc.HasExited) { Write-Host "Stillpoint closed before the end of the test."; break }
    Start-Sleep -Seconds 1
}
if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
Remove-Item Env:STILLPOINT_E2E, Env:STILLPOINT_E2E_SCRIPT, Env:STILLPOINT_E2E_PROJECT -ErrorAction SilentlyContinue
if (-not $done) { Write-Host "The test did not finish."; exit 2 }
Write-Host "Lightroom Classic stays open on the test catalog: you can quit it."
if (Select-String -Path $Report -Pattern " 0 failed" -Quiet) { exit 0 } else { exit 1 }
