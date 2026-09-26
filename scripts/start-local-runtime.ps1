$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$runtimeDir = Join-Path $repoRoot ".artifacts\local-runtime"
$logPath = Join-Path $runtimeDir "runtime.log"
$lockPath = Join-Path $runtimeDir "launcher.lock"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

function Write-RuntimeLog([string]$message) {
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) $message" -Encoding utf8
}

function Test-LocalQaEndpoint {
  try {
    $request = [Net.HttpWebRequest]::Create("http://127.0.0.1:3200/api/qa/reel-playback-fixture.mp4")
    $request.Timeout = 3000
    $response = $request.GetResponse()
    $contentType = $response.ContentType
    $status = [int]$response.StatusCode
    $response.Close()
    $valid = ($status -eq 200) -and ($contentType -eq "video/mp4")
    return [bool]$valid
  } catch {
    return $false
  }
}

function Get-Port3200Pids {
  return @(Get-NetTCPConnection -State Listen -LocalPort 3200 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Test-OrRejectExistingServer {
  $pids = Get-Port3200Pids
  if ($pids.Count -eq 0) { return $false }
  if ($pids.Count -ne 1) {
    Write-RuntimeLog "ERROR: TCP 3200 has multiple listener PIDs: $($pids -join ','). No process was stopped."
    throw "Port 3200 has multiple listeners; refusing to change them."
  }
  $pidValue = [int]$pids[0]
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction SilentlyContinue
  $isNextStart = $processInfo -and $processInfo.Name -eq "node.exe" -and $processInfo.CommandLine -match "next.*start" -and $processInfo.CommandLine -match "--port\s+3200"
  if ($isNextStart -and (Test-LocalQaEndpoint)) {
    Write-RuntimeLog "Already serving Flex Scenes on TCP 3200; PID=$pidValue; no duplicate started."
    return $true
  }
  Write-RuntimeLog "ERROR: TCP 3200 is occupied by PID=$pidValue ($($processInfo.Name)); it did not prove the expected Flex Scenes local-QA endpoint. No process was stopped."
  throw "Port 3200 is occupied by another or unverifiable process; refusing to stop it."
}

try {
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot ".next\BUILD_ID"))) { throw "Production build is missing at $repoRoot\.next. Run the normal build once before startup." }
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "node_modules\next\dist\bin\next"))) { throw "Next.js runtime is missing under $repoRoot\node_modules." }
  $branch = (& git -C $repoRoot rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -ne "feature/ui-v2-mockup-parity") { throw "Expected feature/ui-v2-mockup-parity; found $branch." }
  $head = (& git -C $repoRoot rev-parse HEAD).Trim()
  $buildId = (Get-Content -LiteralPath (Join-Path $repoRoot ".next\BUILD_ID") -Raw).Trim()
  $env:FLEX_SCENES_LOCAL_QA = "1"

  if (Test-OrRejectExistingServer) { exit 0 }

  $lock = $null
  try {
    $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  } catch {
    Write-RuntimeLog "Another launcher holds the startup lock; leaving port 3200 unchanged."
    exit 0
  }
  if (Test-OrRejectExistingServer) { exit 0 }

  $nextCli = Join-Path $repoRoot "node_modules\next\dist\bin\next"
  $stdoutPath = Join-Path $runtimeDir "server.stdout.log"
  $stderrPath = Join-Path $runtimeDir "server.stderr.log"
  $startedAt = Get-Date -Format o
  $server = Start-Process -FilePath "node.exe" -ArgumentList @("`"$nextCli`"", "start", "--hostname", "0.0.0.0", "--port", "3200") -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
  Write-RuntimeLog "Starting production Flex Scenes; PID=$($server.Id); started=$startedAt; branch=$branch; HEAD=$head; BUILD_ID=$buildId; bind=0.0.0.0:3200; FLEX_SCENES_LOCAL_QA=1."

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Seconds 1
    if (Test-LocalQaEndpoint) { $ready = $true; break }
    if ($server.HasExited) { throw "Flex Scenes process $($server.Id) exited before becoming ready. See $stderrPath." }
  }
  if (-not $ready) { throw "Flex Scenes did not serve the local-QA health check within 60 seconds. See $stderrPath." }
  Write-RuntimeLog "READY: PID=$($server.Id) passed local-QA MP4 Range health check on 127.0.0.1:3200."
} catch {
  Write-RuntimeLog "ERROR: $($_.Exception.Message)"
  throw
} finally {
  if ($lock) { $lock.Dispose() }
}
