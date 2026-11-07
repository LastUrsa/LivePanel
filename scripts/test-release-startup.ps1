param(
    [Parameter(Mandatory = $true)] [string]$Version,
    [string]$Executable = 'build/bin/LivePanel.exe'
)

$ErrorActionPreference = 'Stop'
$executablePath = (Resolve-Path -LiteralPath $Executable).Path
$smokeRoot = Join-Path $env:TEMP ('LivePanel-release-smoke-' + [Guid]::NewGuid().ToString('N'))
$logDirectory = Join-Path $smokeRoot 'logs'
$overrides = @{
    LIVEPANEL_CONFIG_PATH = (Join-Path $smokeRoot 'config.json')
    LIVEPANEL_LOG_DIR = $logDirectory
    WEBVIEW2_USER_DATA_FOLDER = (Join-Path $smokeRoot 'webview2')
    LIVEPANEL_TIDEREADER_OVERLAY_URL = 'http://127.0.0.1:1/overlay'
}
# Explicit missing executables prevent auto-start; isolated endpoints prevent
# discovery of any installed companion. This smoke never posts or applies state.
foreach ($app in @('STREAMSIGNAL', 'TIDEREADER', 'TUBERSWITCH')) {
    $overrides["LIVEPANEL_${app}_EXECUTABLE"] = Join-Path $smokeRoot "$app-not-installed.exe"
    $overrides["LIVEPANEL_${app}_ENDPOINT"] = 'http://127.0.0.1:1'
}
$previous = @{}
$process = $null
try {
    New-Item -ItemType Directory -Path $smokeRoot -Force | Out-Null
    foreach ($name in $overrides.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $overrides[$name], 'Process')
    }
    $process = Start-Process -FilePath $executablePath -PassThru
    $deadline = (Get-Date).AddSeconds(30)
    $windowReady = $false
    while ((Get-Date) -lt $deadline) {
        $process.Refresh()
        if ($process.HasExited) { throw 'LivePanel exited during startup.' }
        if ($process.MainWindowHandle -ne 0) { $windowReady = $true; break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $windowReady) { throw 'LivePanel did not create its main window.' }
    Start-Sleep -Seconds 3
    $process.Refresh()
    if ($process.HasExited) { throw 'LivePanel exited after creating its window.' }
    $null = $process.CloseMainWindow()
    if (-not $process.WaitForExit(10000)) { throw 'LivePanel did not shut down after closing its window.' }
    $records = @(Get-ChildItem -LiteralPath $logDirectory -Filter 'session-*.jsonl' |
        ForEach-Object { Get-Content -LiteralPath $_.FullName | ForEach-Object { $_ | ConvertFrom-Json } })
    $started = @($records | Where-Object { $_.msg -eq 'session_started' -and $_.app_version -eq $Version })
    if ($started.Count -eq 0) { throw 'Expected versioned session startup record was not written.' }
    if (@($records | Where-Object { $_.msg -eq 'application_failed' }).Count -ne 0) {
        throw 'LivePanel recorded an application startup failure.'
    }
    if (@($records | Where-Object { $_.msg -eq 'session_stopped' }).Count -eq 0) {
        throw 'Orderly session shutdown was not recorded.'
    }
    Write-Output "LivePanel $Version startup smoke passed: window created, process stable, orderly shutdown and isolated session log verified."
} finally {
    if ($process) {
        $process.Refresh()
        if (-not $process.HasExited) {
            $null = $process.CloseMainWindow()
            if (-not $process.WaitForExit(5000)) { Stop-Process -Id $process.Id -Force }
        }
    }
    foreach ($name in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
    if (Test-Path -LiteralPath $smokeRoot) { Remove-Item -LiteralPath $smokeRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
