# Roda o autoteste do plugin do Stillpoint dentro do Lightroom Classic e mostra o relatório, sem clicar no menu.
# O Lightroom precisa estar (ou ser aberto) num catálogo com "Self-Test" no nome.
#   powershell -ExecutionPolicy Bypass -File tests\lightroom\run_selftest.ps1
$B = Join-Path $env:LOCALAPPDATA "Stillpoint\lightroom"
$Report = Join-Path $B "self-test-report.txt"
$Request = Join-Path $B "selftest-request.txt"
if (-not (Test-Path $B)) { Write-Host "Stillpoint has not been opened on this computer yet (there is no $B)."; exit 2 }
function Fresh {
    $alive = Join-Path $B "alive.txt"
    if (-not (Test-Path $alive)) { return $false }
    $lines = Get-Content $alive -ErrorAction SilentlyContinue
    $t = ($lines | Where-Object { $_ -like "time=*" } | Select-Object -First 1) -replace "^time=", ""
    $catalog = ($lines | Where-Object { $_ -like "catalog=*" } | Select-Object -First 1) -replace "^catalog=", ""
    if (-not $t) { return $false }
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    return (($now - [long]$t) -le 5) -and ($catalog -match "(?i)self-test")
}
if (-not (Fresh)) {
    $known = Join-Path $B "selftest-catalog.txt"
    $catalog = if (Test-Path $known) { (Get-Content $known -TotalCount 1) } else { "" }
    if ($catalog -and (Test-Path $catalog)) { Write-Host "Opening Lightroom Classic on $catalog ..."; Start-Process $catalog }
    else { Write-Host 'Open Lightroom Classic on the "Stillpoint Self-Test" catalog (File > Open Catalog...). Waiting for it...' }
    for ($i = 0; $i -lt 180 -and -not (Fresh); $i++) { Start-Sleep -Seconds 1 }
    if (-not (Fresh)) { Write-Host "Lightroom Classic is not answering on a Self-Test catalog. If it asked to relaunch, click Relaunch and run this again."; exit 2 }
}
Remove-Item $Report -ErrorAction SilentlyContinue
Set-Content -Path $Request -Value "" -NoNewline
Write-Host "Self-test running in Lightroom Classic (a few minutes)..."
for ($i = 1; $i -le 900 -and -not (Test-Path $Report); $i++) {
    if ($i -eq 20 -and (Test-Path $Request)) {
        Remove-Item $Request -ErrorAction SilentlyContinue
        Write-Host "The plugin did not pick up the request: it is an older plugin. Open Stillpoint once (it installs the new plugin), restart Lightroom Classic and run this again."
        exit 2
    }
    Start-Sleep -Seconds 1
}
if (-not (Test-Path $Report)) { Write-Host "No report after 15 minutes."; exit 2 }
Start-Sleep -Seconds 1
Get-Content $Report
if (Select-String -Path $Report -Pattern " 0 failed" -Quiet) { exit 0 } else { exit 1 }
