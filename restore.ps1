<#
  restore.ps1 — 回滚 DSH 全局安装（升级后打不开时用）
  -------------------------------------------------------------
  背景：dsh-update-check 每次点「更新」前，会把当前全局安装自动备份到
        ~/.dsh/backups/dsh-<版本>-<时间戳>/  （只保留最近 2 份）。
        本脚本把其中一份备份复制回原位，实现回滚。

  回滚对象（唯一）：全局安装目录
        %APPDATA%\npm\node_modules\@deepseek-ai\dsh
  不回滚：
        - profile（~/.dsh/profiles/web）
        - 对话（~/.dsh/sessions/）
        - 设置（~/.dsh/settings.yaml）
        - 仓库插件源码（D:\DeepseekHarness\plugins\）

  用法：
        .\restore.ps1            # 列出所有备份，按序号选择
        .\restore.ps1 <片段>      # 直接回滚名字含该片段的备份（如 rc.6 或某时间戳）
#>

$ErrorActionPreference = 'Stop'

$DshHome  = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$Backups  = Join-Path $DshHome 'backups'
$Target   = Join-Path $env:APPDATA 'npm\node_modules\@deepseek-ai\dsh'

if (-not (Test-Path $Backups)) { Write-Host "没有备份目录：$Backups" -ForegroundColor Red; exit 1 }

$list = Get-ChildItem $Backups -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'dsh-*' } | Sort-Object Name -Descending
if (-not $list) { Write-Host "没有任何 dsh 备份（$Backups）。" -ForegroundColor Red; exit 1 }

$chosen = $null
if ($args.Count -ge 1) {
  $chosen = $list | Where-Object { $_.Name -like "*$($args[0])*" } | Select-Object -First 1
  if (-not $chosen) { Write-Host "没找到匹配 '$($args[0])' 的备份。" -ForegroundColor Red; exit 1 }
} elseif ($list.Count -eq 1) {
  $chosen = $list[0]
} else {
  Write-Host "可用备份（新→旧）：" -ForegroundColor Cyan
  for ($i = 0; $i -lt $list.Count; $i++) { Write-Host ("  [{0}] {1}" -f $i, $list[$i].Name) }
  $idx = Read-Host '输入序号回滚'
  if ($idx -match '^\d+$' -and [int]$idx -ge 0 -and [int]$idx -lt $list.Count) { $chosen = $list[[int]$idx] }
  if (-not $chosen) { Write-Host '无效序号，退出。' -ForegroundColor Red; exit 1 }
}

Write-Host ''
Write-Host ("回滚到：{0}" -f $chosen.Name) -ForegroundColor Yellow
Write-Host ("目标：{0}" -f $Target) -ForegroundColor Yellow
Write-Host '注意：若 dsh web 正在运行，请先停掉它（Ctrl+C / Stop-Process），否则文件被占用会失败。' -ForegroundColor Yellow
$ok = Read-Host '确认回滚？(y/N)'
if ($ok -notmatch '^[yY]') { Write-Host '已取消。'; exit 0 }

# 1) 把当前（坏掉）的安装挪开，保留现场
$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$broken = "$Target.broken.$stamp"
if (Test-Path $Target) {
  Write-Host ("当前安装挪到：{0}" -f $broken)
  Rename-Item $Target $broken
}

# 2) 把备份复制回原位（robocopy 稳定，能重试被占用文件）
Write-Host '复制备份回原位（约 250MB，稍等）...'
robocopy $chosen.FullName $Target /E /NFL /NDL /NJH /NJS /R:2 /W:2 | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Host '复制失败，请检查上面的 robocopy 输出。' -ForegroundColor Red; exit 1 }

Write-Host ''
Write-Host '回滚完成。现在重启： dsh web' -ForegroundColor Green
Write-Host ("被替换的坏版本保留在：{0}（确认能启动后可手动删除）" -f $broken) -ForegroundColor Yellow
