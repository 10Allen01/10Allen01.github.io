param(
    [string]$ProjectRoot = "e:\Allen",
    [string]$TorExePath = "",
    [string]$PythonCommand = "py",
    [int]$LocalPort = 8080,
    [switch]$BuildFirst = $true,
    [switch]$WriteEnv = $true
)

$ErrorActionPreference = 'Stop'

$distPath = Join-Path $ProjectRoot 'dist'
$runtimeRoot = Join-Path $ProjectRoot 'deploy\onion\windows\runtime'
$dataDir = Join-Path $runtimeRoot 'tor-data'
$hiddenServiceDir = Join-Path $runtimeRoot 'hidden-service'
$torrcPath = Join-Path $runtimeRoot 'torrc.generated'
$pythonLog = Join-Path $runtimeRoot 'python-server.log'
$pythonErrLog = Join-Path $runtimeRoot 'python-server.err.log'
$torLog = Join-Path $runtimeRoot 'tor.log'
$envPath = Join-Path $ProjectRoot '.env'

function Resolve-TorExePath {
    param([string]$Preferred)

    $candidates = @(
        $Preferred,
        'C:\tor\tor.exe',
        'C:\Program Files\Tor\tor.exe',
        'C:\Program Files\Tor Browser\Browser\TorBrowser\Tor\tor.exe',
        'C:\Program Files (x86)\Tor Browser\Browser\TorBrowser\Tor\tor.exe'
    ) | Where-Object { $_ -and $_.Trim().Length -gt 0 }

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $hiddenServiceDir | Out-Null

if ($BuildFirst) {
    Write-Host '[1/6] Building site...'
    & npm.cmd run build
}

if (-not (Test-Path $distPath)) {
    throw "dist not found at $distPath"
}

$resolvedTorExe = Resolve-TorExePath -Preferred $TorExePath
if (-not $resolvedTorExe) {
    throw 'Tor executable not found in common Windows locations.'
}

Write-Host '[2/6] Writing torrc...'
@"
SocksPort 0
DataDirectory $dataDir

HiddenServiceDir $hiddenServiceDir
HiddenServiceVersion 3
HiddenServicePort 80 127.0.0.1:$LocalPort
Log notice file $torLog
"@ | Set-Content -Path $torrcPath -Encoding ascii

Write-Host '[3/6] Starting local static server...'
$pythonArgs = @('-m', 'http.server', $LocalPort, '--bind', '127.0.0.1', '--directory', $distPath)
$pythonProcess = Start-Process -FilePath $PythonCommand -ArgumentList $pythonArgs -PassThru -WindowStyle Hidden -RedirectStandardOutput $pythonLog -RedirectStandardError $pythonErrLog

Start-Sleep -Seconds 2
if ($pythonProcess.HasExited) {
    throw 'Local static server exited unexpectedly.'
}

Write-Host '[4/6] Starting Tor hidden service...'
$torArgs = @('-f', $torrcPath)
$torProcess = Start-Process -FilePath $resolvedTorExe -ArgumentList $torArgs -PassThru -WindowStyle Hidden

$hostnamePath = Join-Path $hiddenServiceDir 'hostname'
Write-Host '[5/6] Waiting for onion hostname...'
for ($i = 0; $i -lt 90; $i++) {
    if (Test-Path $hostnamePath) {
        break
    }
    Start-Sleep -Seconds 1
}

if (-not (Test-Path $hostnamePath)) {
    throw "Onion hostname was not generated. Check $torLog"
}

$hostname = (Get-Content $hostnamePath -Raw).Trim()
$onionUrl = "http://$hostname"

if ($WriteEnv) {
    Write-Host '[6/6] Writing .env onion values...'
    $existing = @{}
    if (Test-Path $envPath) {
        foreach ($line in Get-Content $envPath) {
            if ($line -match '^(?<key>[A-Z0-9_]+)=(?<value>.*)$') {
                $existing[$matches['key']] = $matches['value']
            }
        }
    }
    if (-not $existing.ContainsKey('PUBLIC_SITE_URL')) { $existing['PUBLIC_SITE_URL'] = 'http://localhost:4321' }
    if (-not $existing.ContainsKey('PUBLIC_BASE_PATH')) { $existing['PUBLIC_BASE_PATH'] = '/' }
    $existing['PUBLIC_ONION_URL'] = $onionUrl
    if (-not $existing.ContainsKey('PUBLIC_ONION_LABEL')) { $existing['PUBLIC_ONION_LABEL'] = 'Onion Access' }

    @(
        "PUBLIC_SITE_URL=$($existing['PUBLIC_SITE_URL'])"
        "PUBLIC_BASE_PATH=$($existing['PUBLIC_BASE_PATH'])"
        "PUBLIC_ONION_URL=$($existing['PUBLIC_ONION_URL'])"
        "PUBLIC_ONION_LABEL=$($existing['PUBLIC_ONION_LABEL'])"
    ) | Set-Content -Path $envPath -Encoding utf8
}

Write-Host ''
Write-Host 'Onion address generated:' -ForegroundColor Green
Write-Host $onionUrl -ForegroundColor Cyan
Write-Host ''
Write-Host 'Python PID:' $pythonProcess.Id
Write-Host 'Tor PID:' $torProcess.Id
Write-Host 'Tor exe:' $resolvedTorExe
Write-Host 'Python log:' $pythonLog
Write-Host 'Python err log:' $pythonErrLog
Write-Host 'Tor log:' $torLog
Write-Host ''
Write-Host 'Keep this PowerShell session open or keep both processes running to keep the onion site online.' -ForegroundColor Yellow
