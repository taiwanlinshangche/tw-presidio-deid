$ErrorActionPreference = 'Stop'

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$RuntimeRoot = Join-Path $ProjectRoot '.runtime'
$LockDir = Join-Path $RuntimeRoot 'bootstrap.lock'
$NodeVersion = '24.21.0'
$Archive = "node-v$NodeVersion-win-x64.zip"
$ArchiveSha256 = '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541'
$DownloadUrl = "https://nodejs.org/dist/v$NodeVersion/$Archive"
$CacheDir = Join-Path $RuntimeRoot 'cache'
$CacheFile = Join-Path $CacheDir $Archive
$ManagedDir = Join-Path $RuntimeRoot "node-v$NodeVersion-win-x64"
$ManagedNode = Join-Path $ManagedDir 'node.exe'
$StageDir = $null
$OwnsLock = $false

function Test-CompatibleNode([string]$Candidate) {
  if (-not (Test-Path -LiteralPath $Candidate -PathType Leaf)) { return $false }
  try {
    $version = (& $Candidate -p 'process.versions.node' 2>$null).Trim()
    if ($LASTEXITCODE -ne 0) { return $false }
    $parsed = [System.Version]$version
    return $parsed -ge [System.Version]'22.12.0'
  } catch { return $false }
}

function Get-NpmCli([string]$Candidate) {
  try {
    $nodePath = (& $Candidate -p 'process.execPath' 2>$null).Trim()
    if ($LASTEXITCODE -ne 0) { return $null }
    $npmCli = Join-Path (Split-Path -Parent $nodePath) 'node_modules\npm\bin\npm-cli.js'
    if (Test-Path -LiteralPath $npmCli -PathType Leaf) { return [System.IO.Path]::GetFullPath($npmCli) }
  } catch {}
  return $null
}

function Release-BootstrapLock {
  if ($script:OwnsLock) {
    Remove-Item -LiteralPath $LockDir -Recurse -Force -ErrorAction Stop
    $script:OwnsLock = $false
  }
}

try {
  if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -notin @('AMD64', 'x86')) {
    throw '此版本僅支援 Windows x64。'
  }
  New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
  try {
    New-Item -ItemType Directory -Path $LockDir -ErrorAction Stop | Out-Null
    $OwnsLock = $true
  } catch {
    $ownerFile = Join-Path $LockDir 'pid'
    $ownerPid = if (Test-Path -LiteralPath $ownerFile) { Get-Content -LiteralPath $ownerFile -ErrorAction SilentlyContinue } else { $null }
    if (-not $ownerPid) {
      for ($attempt = 0; $attempt -lt 10 -and -not $ownerPid; $attempt++) {
        Start-Sleep -Milliseconds 100
        if (Test-Path -LiteralPath $ownerFile) {
          $ownerPid = Get-Content -LiteralPath $ownerFile -ErrorAction SilentlyContinue
        }
      }
    }
    if ($ownerPid -and (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue)) {
      throw '另一個初始化程序正在執行，請等待它完成。'
    }
    Remove-Item -LiteralPath $LockDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $LockDir -ErrorAction Stop | Out-Null
    $OwnsLock = $true
  }
  Set-Content -LiteralPath (Join-Path $LockDir 'pid') -Value $PID -Encoding ascii

  $systemNode = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  $systemNpmCli = if ($systemNode) { Get-NpmCli $systemNode.Source } else { $null }
  if ($systemNode -and (Test-CompatibleNode $systemNode.Source) -and $systemNpmCli) {
    $node = $systemNode.Source
    $env:DEID_NPM_CLI = $systemNpmCli
  } elseif ((Test-CompatibleNode $ManagedNode) -and ($managedNpmCli = Get-NpmCli $ManagedNode)) {
    $node = $ManagedNode
    $env:DEID_NPM_CLI = $managedNpmCli
  } else {
    New-Item -ItemType Directory -Path $CacheDir -Force | Out-Null
    $cachedHash = if (Test-Path -LiteralPath $CacheFile) { (Get-FileHash -LiteralPath $CacheFile -Algorithm SHA256).Hash.ToLowerInvariant() } else { '' }
    if ($cachedHash -ne $ArchiveSha256) {
      Remove-Item -LiteralPath $CacheFile -Force -ErrorAction SilentlyContinue
      $partial = "$CacheFile.part"
      Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
      Write-Host "首次啟動：正在下載 Node.js $NodeVersion（畫面會顯示進度）…"
      Invoke-WebRequest -Uri $DownloadUrl -OutFile $partial -UseBasicParsing
      $downloadedHash = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($downloadedHash -ne $ArchiveSha256) {
        Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
        throw 'Node.js 檔案校驗失敗，已停止安裝。'
      }
      Move-Item -LiteralPath $partial -Destination $CacheFile
    }

    $StageDir = Join-Path $RuntimeRoot ".node-stage-$PID"
    Remove-Item -LiteralPath $StageDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $StageDir | Out-Null
    Expand-Archive -LiteralPath $CacheFile -DestinationPath $StageDir
    $stagedDir = Join-Path $StageDir "node-v$NodeVersion-win-x64"
    $stagedNode = Join-Path $stagedDir 'node.exe'
    if (-not (Test-CompatibleNode $stagedNode)) { throw '下載的 Node.js 無法執行或版本不符。' }
    $stagedNpmCli = Get-NpmCli $stagedNode
    if (-not $stagedNpmCli) { throw '下載的 Node.js 缺少 npm，已停止安裝。' }
    Remove-Item -LiteralPath $ManagedDir -Recurse -Force -ErrorAction SilentlyContinue
    Move-Item -LiteralPath $stagedDir -Destination $ManagedDir
    Remove-Item -LiteralPath $StageDir -Recurse -Force
    $StageDir = $null
    $node = $ManagedNode
    $env:DEID_NPM_CLI = Get-NpmCli $ManagedNode
  }

  Release-BootstrapLock
  & $node (Join-Path $ProjectRoot 'scripts\start.mjs') '--open'
  exit $LASTEXITCODE
} catch {
  [Console]::Error.WriteLine("啟動失敗：$($_.Exception.Message)")
  exit 1
} finally {
  if ($StageDir) { Remove-Item -LiteralPath $StageDir -Recurse -Force -ErrorAction SilentlyContinue }
  if ($OwnsLock) { Remove-Item -LiteralPath $LockDir -Recurse -Force -ErrorAction SilentlyContinue }
}
