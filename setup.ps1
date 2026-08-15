<#
  setup.ps1 — 双机开发环境一键搭建
  --------------------------------------------------
  前置（手动，一次）：
    1) 装好 Node.js
    2) npm i -g @deepseek-ai/dsh
    3) git clone 本仓库

  原理：DSH 只认 ~/.dsh/profiles/<name> 这个固定位置（--profile web）。
  本脚本把仓库里 profile/（可移植模板，用相对 link:）落地到那个位置，
  并把 link: 的相对路径替换成本机仓库的真实绝对路径（绝对软链才能被
  DSH 稳定解析——相对软链穿过 junction/别处访问会解析错）。

  脚本自动做：
    1) 确保 pnpm 可用（没有就 npm i -g pnpm）
    2) 生成 ~/.dsh/profiles/web（真实目录），link: 换成绝对路径
    3) pnpm install，把 plugins/ 下的插件软链进 node_modules
    4) 生成 .credentials.yaml 模板（key 留空，你亲手填）
    5) 自检：确认每个插件软链都就位

  用法（PowerShell / pwsh）： .\setup.ps1
#>

$ErrorActionPreference = 'Stop'

function Write-Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "    [ok] $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Host "    [!]  $m" -ForegroundColor Yellow }
function Write-Fail($m) { Write-Host "    [X]  $m" -ForegroundColor Red }

# ---------- 1) 定位仓库根（= 脚本所在目录） ----------
$RepoRoot   = $PSScriptRoot
$ProfileSrc = Join-Path $RepoRoot 'profile'

if (-not (Test-Path (Join-Path $ProfileSrc 'package.json'))) {
    Write-Fail "找不到 $ProfileSrc\package.json —— 请确认 setup.ps1 放在仓库根目录。"
    exit 1
}

# DSH home 与 profile 目标位置（和 DSH 源码 resolveDshHome 一致）
$DshHome     = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$ProfilesDir = Join-Path $DshHome 'profiles'
$ProfileLink = Join-Path $ProfilesDir 'web'

# ---------- 前置检查 ----------
Write-Step "前置检查：node / npm / dsh"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Fail '未找到 node，请先安装 Node.js'; exit 1 }
Write-Ok 'node 已就绪'
if (-not (Get-Command npm -ErrorAction SilentlyContinue))  { Write-Fail '未找到 npm'; exit 1 }
Write-Ok 'npm 已就绪'
if (-not (Get-Command dsh -ErrorAction SilentlyContinue))  { Write-Warn '未找到 dsh（npm i -g @deepseek-ai/dsh 装了吗？）；继续，但最后自检只查软链。' }
else { Write-Ok 'dsh 已就绪' }

# ---------- 2) 确保 pnpm ----------
Write-Step "确保 pnpm 可用"
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Warn '未找到 pnpm，执行 npm i -g pnpm ...'
    npm install -g pnpm
    if ($LASTEXITCODE -ne 0) { Write-Fail 'pnpm 安装失败'; exit 1 }
}
Write-Ok 'pnpm 已就绪'

# ---------- 3) 落地 profile（真实目录 + 绝对 link） ----------
Write-Step "生成 $ProfileLink"
if (-not (Test-Path $ProfilesDir)) { New-Item -ItemType Directory -Path $ProfilesDir -Force | Out-Null }

# 已存在就备份（不管它是真实目录还是链接）
if (Test-Path $ProfileLink) {
    $backup = "$ProfileLink.bak." + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Write-Warn "发现已存在的 profile，备份为 $backup"
    Rename-Item $ProfileLink $backup
}

New-Item -ItemType Directory -Path $ProfileLink -Force | Out-Null

# 把模板里的相对 link: 换成本机仓库的绝对路径（正斜杠）
$pluginsDir = (($RepoRoot -replace '\\','/') + '/plugins')
$pkgText = (Get-Content (Join-Path $ProfileSrc 'package.json') -Raw)
$pkgText = $pkgText.Replace('link:../plugins', "link:$pluginsDir")
Set-Content -Path (Join-Path $ProfileLink 'package.json') -Value $pkgText -Encoding utf8

# 其余配置文件原样复制
foreach ($f in 'cordis.yml','cordis.patch.yml','pnpm-workspace.yaml') {
    Copy-Item (Join-Path $ProfileSrc $f) (Join-Path $ProfileLink $f) -Force
}
Write-Ok "profile 已生成，插件绝对路径：$pluginsDir"

# ---------- 4) pnpm install ----------
Write-Step "pnpm install（把 plugins/ 下的插件软链进 node_modules）"
Push-Location $ProfileLink
try {
    pnpm install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install 失败（exit $LASTEXITCODE）" }
} finally {
    Pop-Location
}
Write-Ok 'pnpm install 完成'

# ---------- 5) 密钥模板 ----------
Write-Step "密钥模板"
$cred = Join-Path $DshHome '.credentials.yaml'
if (-not (Test-Path $cred)) {
    @'
# 填入本机要用的 API key（每台机器各填各的）
DEEPSEEK_API_KEY:
NEON_API_KEY:
'@ | Set-Content -Path $cred -Encoding utf8
    Write-Warn "已生成 $cred —— 请把 key 填进去"
} else {
    Write-Ok '已存在 .credentials.yaml，不覆盖。'
}

# ---------- 6) 自检 ----------
Write-Step "自检"
# 动态从 profile 的 dependencies 读插件名（link: 依赖），新增插件无需改这里
$profilePkg = Get-Content (Join-Path $ProfileLink 'package.json') -Raw | ConvertFrom-Json
$pluginNames = @($profilePkg.dependencies.PSObject.Properties.Name)
$allOk = $true
foreach ($p in $pluginNames) {
    $pkg = Join-Path $ProfileLink "node_modules\$p\package.json"
    if (Test-Path $pkg) { Write-Ok "$p 软链就绪" }
    else { Write-Fail "$p 未就绪：$pkg"; $allOk = $false }
}

Write-Host ""
if ($allOk) {
    Write-Host '全部就绪。下一步：填 key，然后跑 dsh web 验证。' -ForegroundColor Green
} else {
    Write-Fail '有插件未就绪，请检查上面的失败项。'
    exit 1
}
