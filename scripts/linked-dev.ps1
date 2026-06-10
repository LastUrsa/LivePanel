param(
    [string]$Build = "none",
    [switch]$Launch,
    [switch]$NoSync,
    [switch]$SkipHealth,
    [string]$Root = "C:\Temp\StarsongLinkedDev",
    [string]$StreamSignalEnvironment = "dev"
)

$ErrorActionPreference = "Stop"

$KnownApps = @("livepanel", "streamsignal", "tidereader", "tuberswitch")

function Resolve-BuildList([string]$Value) {
    $normalized = $Value.Trim().ToLowerInvariant()
    if ($normalized -eq "" -or $normalized -eq "none") {
        return @()
    }
    if ($normalized -eq "all") {
        return $KnownApps
    }
    $items = @()
    foreach ($item in $normalized.Split(",")) {
        $name = $item.Trim()
        if ($name -eq "") {
            continue
        }
        if ($KnownApps -notcontains $name) {
            throw "Unknown app in -Build: $name. Use one of: $($KnownApps -join ', '), all, none."
        }
        if ($items -notcontains $name) {
            $items += $name
        }
    }
    return $items
}

function Invoke-Step([string]$Message, [scriptblock]$Body) {
    Write-Host ""
    Write-Host "==> $Message"
    & $Body
}

function Assert-Command([string]$Name) {
    $found = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $found) {
        throw "Required command not found on PATH: $Name"
    }
}

function Invoke-RobocopyMirror([string]$Source, [string]$Destination) {
    if (-not (Test-Path $Source)) {
        throw "Source path not found: $Source"
    }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    $excludeDirs = @(".git", ".agents", ".codex", "build", "node_modules", "dist", "coverage", "TestResults", "bin", "obj")
    $excludeFiles = @(".env", ".env.*", "*.db", "*.sqlite", "*.sqlite3", "*.pem", "*.key", "*.pfx", "*.p12", "*.crt", "*.log")
    $args = @(
        $Source,
        $Destination,
        "/MIR",
        "/NFL",
        "/NDL",
        "/NJH",
        "/NJS",
        "/NP",
        "/XD"
    ) + $excludeDirs + @("/XF") + $excludeFiles

    & robocopy @args | Out-Host
    if ($LASTEXITCODE -gt 7) {
        throw "robocopy failed with exit code $LASTEXITCODE while syncing $Source"
    }

    $iconFiles = @(
        @{ Source = Join-Path $Source "build\appicon.png"; Destination = Join-Path $Destination "build\appicon.png" },
        @{ Source = Join-Path $Source "build\windows\icon.ico"; Destination = Join-Path $Destination "build\windows\icon.ico" }
    )
    foreach ($iconFile in $iconFiles) {
        if (Test-Path $iconFile.Source) {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $iconFile.Destination) | Out-Null
            Copy-Item -LiteralPath $iconFile.Source -Destination $iconFile.Destination -Force
        }
    }
}

function Invoke-CommandChecked([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
}

function Copy-DirectoryContents([string]$Source, [string]$Destination) {
    if (-not (Test-Path $Source)) {
        throw "Build output not found: $Source"
    }
    if (Test-Path $Destination) {
        Remove-Item $Destination -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Copy-Item -Path (Join-Path $Source "*") -Destination $Destination -Recurse -Force
}

function Get-FileHashText([string]$Path) {
    if (-not (Test-Path $Path)) {
        return ""
    }
    return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash
}

function Invoke-NpmInstallIfNeeded([string]$FrontendDir) {
    $lockPath = Join-Path $FrontendDir "package-lock.json"
    $packagePath = Join-Path $FrontendDir "package.json"
    if (-not (Test-Path $packagePath)) {
        return
    }

    $stampPath = Join-Path $FrontendDir ".linked-dev.package-lock.sha256"
    $nodeModules = Join-Path $FrontendDir "node_modules"
    $currentHash = Get-FileHashText $lockPath
    $previousHash = ""
    if (Test-Path $stampPath) {
        $previousHash = (Get-Content $stampPath -Raw).Trim()
    }

    if ((Test-Path $nodeModules) -and $currentHash -ne "" -and $currentHash -eq $previousHash) {
        Write-Host "npm dependencies are current: $FrontendDir"
        return
    }

    Invoke-CommandChecked "npm" @("install") $FrontendDir
    if ($currentHash -ne "") {
        Set-Content -Path $stampPath -Value $currentHash -Encoding ASCII
    }
}

function Build-WailsApp([hashtable]$Spec) {
    $frontendDir = Join-Path $Spec.Mirror "frontend"
    Invoke-NpmInstallIfNeeded $frontendDir
    Invoke-CommandChecked "wails" @("build") $Spec.Mirror
}

function Build-TideReader([hashtable]$Spec) {
    $frontendDir = Join-Path $Spec.Mirror "frontend"
    Invoke-NpmInstallIfNeeded $frontendDir
    $publishScript = Join-Path $Spec.Mirror "scripts\publish-desktop.ps1"
    Invoke-CommandChecked "powershell.exe" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $publishScript, "-Version", "livepanel-dev") $Spec.Mirror
}

function Get-TideReaderPublishDir([hashtable]$Spec) {
    return Join-Path $Spec.Mirror "artifacts\publish\win-x64-livepanel-dev"
}

function Stop-ProcessByName([string]$Name) {
    $processes = Get-Process -Name $Name -ErrorAction SilentlyContinue
    if ($null -eq $processes) {
        return
    }
    $processes | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Test-Endpoint([string]$Name, [string]$Url) {
    try {
        $response = Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec 4
        $mode = ""
        if ($null -ne $response.mode) {
            $mode = $response.mode
        }
        Write-Host ("{0,-13} ok      {1,-8} {2}" -f $Name, $mode, $Url)
    } catch {
        Write-Host ("{0,-13} missing          {1}" -f $Name, $Url)
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$suiteRoot = Split-Path -Parent $repoRoot
$srcRoot = Join-Path $Root "src"
$runRoot = Join-Path $Root "run"
$buildList = @(Resolve-BuildList $Build)

$specs = @{
    livepanel = @{
        Name = "LivePanel"
        Process = "LivePanel"
        Source = Join-Path $suiteRoot "LivePanel"
        Mirror = Join-Path $srcRoot "LivePanel"
        Run = Join-Path $runRoot "LivePanel"
        Output = "build\bin"
        Kind = "wails"
    }
    streamsignal = @{
        Name = "StreamSignal"
        Process = "StreamSignal"
        Source = Join-Path $suiteRoot "StreamSignal"
        Mirror = Join-Path $srcRoot "StreamSignal"
        Run = Join-Path $runRoot "StreamSignal"
        Output = "build\bin"
        Kind = "wails"
    }
    tidereader = @{
        Name = "TideReader"
        Process = "TideReader.Desktop"
        Source = Join-Path $suiteRoot "TideReader"
        Mirror = Join-Path $srcRoot "TideReader"
        Run = Join-Path $runRoot "TideReader"
        Output = ""
        Kind = "tidereader"
    }
    tuberswitch = @{
        Name = "TuberSwitch"
        Process = "TuberSwitch"
        Source = Join-Path $suiteRoot "TuberSwitch"
        Mirror = Join-Path $srcRoot "TuberSwitch"
        Run = Join-Path $runRoot "TuberSwitch"
        Output = "build\bin"
        Kind = "wails"
    }
}

Assert-Command "robocopy"
Assert-Command "npm"
Assert-Command "wails"

New-Item -ItemType Directory -Force -Path $srcRoot, $runRoot | Out-Null

if (-not $NoSync) {
    foreach ($app in $KnownApps) {
        $spec = $specs[$app]
        if ((Test-Path $spec.Source) -and (($buildList -contains $app) -or -not (Test-Path $spec.Mirror))) {
            Invoke-Step "Sync $($spec.Name)" {
                Invoke-RobocopyMirror $spec.Source $spec.Mirror
            }
        }
    }
}

foreach ($app in $buildList) {
    $spec = $specs[$app]
    Invoke-Step "Build $($spec.Name)" {
        if ($spec.Kind -eq "tidereader") {
            Build-TideReader $spec
        } else {
            Build-WailsApp $spec
        }
    }
}

if ($Launch) {
    Invoke-Step "Stop stale app processes" {
        Stop-ProcessByName "LivePanel"
        Stop-ProcessByName "StreamSignal"
        Stop-ProcessByName "TideReader.Desktop"
        Stop-ProcessByName "TuberSwitch"
    }
}

foreach ($app in $KnownApps) {
    $spec = $specs[$app]
    $output = ""
    if ($spec.Kind -eq "tidereader") {
        $output = Get-TideReaderPublishDir $spec
        if (-not (Test-Path $output)) {
            $fallback = Join-Path $spec.Source "artifacts\publish\win-x64-livepanel-dev"
            if (Test-Path $fallback) {
                $output = $fallback
            }
        }
    } else {
        $output = Join-Path $spec.Mirror $spec.Output
        if (-not (Test-Path $output)) {
            $fallback = Join-Path $spec.Source $spec.Output
            if (Test-Path $fallback) {
                $output = $fallback
            }
        }
    }
    if (Test-Path $output) {
        Invoke-Step "Stage $($spec.Name)" {
            Copy-DirectoryContents $output $spec.Run
        }
    } else {
        Write-Host "Skipping stage for $($spec.Name); no build output found."
    }
}

if ($Launch) {
    $livePanelExe = Join-Path $specs.livepanel.Run "LivePanel.exe"
    $streamSignalExe = Join-Path $specs.streamsignal.Run "StreamSignal.exe"
    $tideReaderExe = Join-Path $specs.tidereader.Run "TideReader.Desktop.exe"
    $tuberSwitchExe = Join-Path $specs.tuberswitch.Run "TuberSwitch.exe"

    foreach ($exe in @($livePanelExe, $streamSignalExe, $tideReaderExe, $tuberSwitchExe)) {
        if (-not (Test-Path $exe)) {
            throw "Linked launch executable not found: $exe"
        }
    }

    Invoke-Step "Launch LivePanel linked dev stack" {
        $previousStreamSignalEnv = $env:STREAMSIGNAL_ENV
        $previousStreamSignalExe = $env:LIVEPANEL_STREAMSIGNAL_EXECUTABLE
        $previousTideReaderExe = $env:LIVEPANEL_TIDEREADER_EXECUTABLE
        $previousTuberSwitchExe = $env:LIVEPANEL_TUBERSWITCH_EXECUTABLE
        try {
            $env:STREAMSIGNAL_ENV = $StreamSignalEnvironment
            $env:LIVEPANEL_STREAMSIGNAL_EXECUTABLE = $streamSignalExe
            $env:LIVEPANEL_TIDEREADER_EXECUTABLE = $tideReaderExe
            $env:LIVEPANEL_TUBERSWITCH_EXECUTABLE = $tuberSwitchExe
            Start-Process -FilePath $livePanelExe -WorkingDirectory $specs.livepanel.Run
        } finally {
            if ($null -eq $previousStreamSignalEnv) { Remove-Item Env:\STREAMSIGNAL_ENV -ErrorAction SilentlyContinue } else { $env:STREAMSIGNAL_ENV = $previousStreamSignalEnv }
            if ($null -eq $previousStreamSignalExe) { Remove-Item Env:\LIVEPANEL_STREAMSIGNAL_EXECUTABLE -ErrorAction SilentlyContinue } else { $env:LIVEPANEL_STREAMSIGNAL_EXECUTABLE = $previousStreamSignalExe }
            if ($null -eq $previousTideReaderExe) { Remove-Item Env:\LIVEPANEL_TIDEREADER_EXECUTABLE -ErrorAction SilentlyContinue } else { $env:LIVEPANEL_TIDEREADER_EXECUTABLE = $previousTideReaderExe }
            if ($null -eq $previousTuberSwitchExe) { Remove-Item Env:\LIVEPANEL_TUBERSWITCH_EXECUTABLE -ErrorAction SilentlyContinue } else { $env:LIVEPANEL_TUBERSWITCH_EXECUTABLE = $previousTuberSwitchExe }
        }
        Write-Host "LivePanel launched from $livePanelExe"
    }

    if (-not $SkipHealth) {
        Start-Sleep -Seconds 4
        Invoke-Step "Linked SIP health" {
            Test-Endpoint "StreamSignal" "http://127.0.0.1:47020/api/v1/app"
            Test-Endpoint "TideReader" "http://127.0.0.1:47030/api/v1/app"
            Test-Endpoint "TuberSwitch" "http://127.0.0.1:47040/api/v1/app"
        }
    }
}

Write-Host ""
Write-Host "Done."
