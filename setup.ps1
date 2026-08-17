<#
  setup.ps1 - one-command dev environment setup for this machine
  --------------------------------------------------
  Prerequisites (manual, one-time):
    1) Install Node.js
    2) npm i -g @deepseek-ai/dsh
    3) git clone this repo

  How it works: DSH only reads the fixed location ~/.dsh/profiles/<name> (--profile web).
  This script materializes the repo's profile/ (portable template, relative link:) into
  that location, and rewrites the relative link: to this machine's real absolute repo path
  (absolute symlinks resolve reliably in DSH; relative symlinks break when accessed
  through a junction or from another location).

  The script does:
    1) Ensure pnpm is available (npm i -g pnpm if missing)
    2) Generate ~/.dsh/profiles/web (real directory), rewrite link: to absolute paths
    3) pnpm install, symlink plugins under plugins/ into node_modules
    4) Generate a .credentials.yaml template (keys left empty for you to fill in)
    5) Self-check: verify every plugin symlink is in place

  Usage (PowerShell / pwsh): .\setup.ps1
#>

$ErrorActionPreference = 'Stop'

function Write-Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "    [ok] $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Host "    [!]  $m" -ForegroundColor Yellow }
function Write-Fail($m) { Write-Host "    [X]  $m" -ForegroundColor Red }

# BOM guard (second layer of defense): read the file back; if a UTF-8 BOM (EF BB BF)
# is found, strip it immediately and warn. Even if someone later reverts the write path
# back to a BOM-emitting form, this layer catches it in the same setup run, so dsh's
# readProfileManifest (plain JSON.parse, no BOM stripping) never trips.
function Assert-Utf8NoBom {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    $clean = New-Object byte[] ($bytes.Length - 3)
    [Array]::Copy($bytes, 3, $clean, 0, $clean.Length)
    [System.IO.File]::WriteAllBytes($Path, $clean)
    Write-Warn "Stripped UTF-8 BOM: $Path"
  }
}

# ---------- 1) Locate repo root (= script directory) ----------
$RepoRoot   = $PSScriptRoot
$ProfileSrc = Join-Path $RepoRoot 'profile'

if (-not (Test-Path (Join-Path $ProfileSrc 'package.json'))) {
    Write-Fail "Cannot find $ProfileSrc\package.json - make sure setup.ps1 is at the repo root."
    exit 1
}

# DSH home and profile target (matches DSH source resolveDshHome)
$DshHome     = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$ProfilesDir = Join-Path $DshHome 'profiles'
$ProfileLink = Join-Path $ProfilesDir 'web'

# ---------- Preflight ----------
Write-Step "Preflight: node / npm / dsh"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Fail 'node not found - install Node.js first'; exit 1 }
Write-Ok 'node ok'
if (-not (Get-Command npm -ErrorAction SilentlyContinue))  { Write-Fail 'npm not found'; exit 1 }
Write-Ok 'npm ok'
if (-not (Get-Command dsh -ErrorAction SilentlyContinue))  { Write-Warn 'dsh not found (did you run npm i -g @deepseek-ai/dsh?); continuing, but the final self-check only verifies symlinks.' }
else { Write-Ok 'dsh ok' }

# ---------- 2) Ensure pnpm ----------
Write-Step "Ensure pnpm is available"
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Warn 'pnpm not found, running npm i -g pnpm ...'
    npm install -g pnpm
    if ($LASTEXITCODE -ne 0) { Write-Fail 'pnpm install failed'; exit 1 }
}
Write-Ok 'pnpm ok'

# ---------- 2.5) Build plugin dependency bridge (junction) ----------
# Plugins under plugins/ that import @deepseek-ai/* (schemastery / dsh-settings etc.)
# live in this repo (e.g. D:), so Node cannot resolve up to the global dsh node_modules
# on C:. A junction pointing plugins/node_modules there is required (documented DSH mechanism).
Write-Step "Build plugin dependency bridge (junction)"
$pluginsNodeModules = Join-Path $RepoRoot 'plugins\node_modules'
$alreadyJunction = $false
if (Test-Path $pluginsNodeModules) {
    $alreadyJunction = ((Get-Item $pluginsNodeModules -Force).Attributes -match 'ReparsePoint')
    if (-not $alreadyJunction) {
        Write-Warn 'plugins\node_modules exists but is not a junction (regular dir); removing and recreating'
        Remove-Item $pluginsNodeModules -Recurse -Force
    }
}
if ($alreadyJunction) {
    Write-Ok 'plugins\node_modules is already a junction, skipping'
} else {
    $dshGlobalRoot = (npm root -g 2>$null | Out-String).Trim()
    $dshGlobalNodeModules = Join-Path (Join-Path (Join-Path $dshGlobalRoot '@deepseek-ai') 'dsh') 'node_modules'
    if ($dshGlobalRoot -and (Test-Path $dshGlobalNodeModules)) {
        New-Item -ItemType Junction -Path $pluginsNodeModules -Target $dshGlobalNodeModules | Out-Null
        Write-Ok "Created junction: plugins\node_modules -> $dshGlobalNodeModules"
    } else {
        Write-Warn "Global dsh node_modules not found ($dshGlobalNodeModules); skipping. Plugins importing @deepseek-ai/* will fail to load."
    }
}

# ---------- 3) Materialize profile (real dir + absolute link) ----------
Write-Step "Generating $ProfileLink"
if (-not (Test-Path $ProfilesDir)) { New-Item -ItemType Directory -Path $ProfilesDir -Force | Out-Null }

# Before materializing, remove older profile backups (web.bak.*), keeping only the newest one about to be created.
$oldBackups = Get-ChildItem $ProfilesDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'web.bak.*' }
foreach ($old in $oldBackups) {
    Write-Warn "Removing old backup $($old.Name)"
    Remove-Item $old.FullName -Recurse -Force
}

# Back up if it already exists (whether real dir or link)
if (Test-Path $ProfileLink) {
    $backup = "$ProfileLink.bak." + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Write-Warn "Existing profile found, backing up to $backup"
    Rename-Item $ProfileLink $backup
}

New-Item -ItemType Directory -Path $ProfileLink -Force | Out-Null

# Rewrite the template's relative link: to this machine's absolute repo path (forward slashes)
$pluginsDir = (($RepoRoot -replace '\\','/') + '/plugins')
$pkgText = (Get-Content (Join-Path $ProfileSrc 'package.json') -Raw)
$pkgText = $pkgText.Replace('link:../plugins', "link:$pluginsDir")
# BOM-free write: Windows PowerShell 5.1's `Set-Content -Encoding utf8` writes EF BB BF,
# and dsh's readProfileManifest does plain JSON.parse(raw) without stripping BOM, crashing startup.
# Use UTF8Encoding($false) instead.
[System.IO.File]::WriteAllText((Join-Path $ProfileLink 'package.json'), $pkgText, (New-Object System.Text.UTF8Encoding($false)))
Assert-Utf8NoBom (Join-Path $ProfileLink 'package.json')

# Copy pnpm config (pnpm install needs it)
Copy-Item (Join-Path $ProfileSrc 'pnpm-workspace.yaml') (Join-Path $ProfileLink 'pnpm-workspace.yaml') -Force
# Copy user patch layer (dsh-plugin-manager's enable/disable toggle is written here; cordis.yml is still auto-generated by DSH at startup)
$patchSrc = Join-Path $ProfileSrc 'cordis.patch.yml'
if (Test-Path $patchSrc) {
    Copy-Item $patchSrc (Join-Path $ProfileLink 'cordis.patch.yml') -Force
}
Write-Ok "Profile generated, plugin absolute path: $pluginsDir"

# ---------- 4) pnpm install ----------
Write-Step "pnpm install (symlink plugins under plugins/ into node_modules)"
Push-Location $ProfileLink
try {
    pnpm install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}
Write-Ok 'pnpm install done'

# ---------- 5) Credentials template ----------
Write-Step "Credentials template"
$cred = Join-Path $DshHome '.credentials.yaml'
if (-not (Test-Path $cred)) {
    $credTemplate = @'
# Fill in the API keys this machine needs (each machine fills its own)
# Uncomment the lines below and fill in real keys; leave them commented to boot
# (the program still starts, but model calls will need a key)
# DEEPSEEK_API_KEY: sk-your-key
# NEON_API_KEY: your-key
'@
    [System.IO.File]::WriteAllText($cred, $credTemplate, (New-Object System.Text.UTF8Encoding($false)))
    Assert-Utf8NoBom $cred
    Write-Warn "Generated $cred - uncomment and fill in your keys (boot works without keys; model calls need them)"
} else {
    Write-Ok '.credentials.yaml already exists, not overwriting.'
}

# ---------- 6) Self-check ----------
Write-Step "Self-check"
# Read plugin names dynamically from the profile's dependencies (link: deps); new plugins need no change here
$profilePkg = Get-Content (Join-Path $ProfileLink 'package.json') -Raw | ConvertFrom-Json
$pluginNames = @($profilePkg.dependencies.PSObject.Properties.Name)
$allOk = $true
foreach ($p in $pluginNames) {
    $pkg = Join-Path $ProfileLink "node_modules\$p\package.json"
    if (Test-Path $pkg) { Write-Ok "$p symlink ready" }
    else { Write-Fail "$p not ready: $pkg"; $allOk = $false }
}

Write-Host ""
if ($allOk) {
    Write-Host 'All ready. Next: fill in keys, then run dsh web to verify.' -ForegroundColor Green
} else {
    Write-Fail 'Some plugins are not ready; check the failures above.'
    exit 1
}
