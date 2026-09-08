<#
.SYNOPSIS
    Installs the reviewed dev container configuration into the ACTIVE host
    .devcontainer folder, so that a rebuilt container restarts itself after a
    crash and arms the batch launcher without an editor.

.DESCRIPTION
    Run from an ORDINARY PowerShell on the Windows host. The agent cannot do
    this itself: the container sees /workspace/.devcontainer as a READ-ONLY
    mount (deliberately — the running container is not allowed to rewrite its
    own security overlay), so the reviewed files are staged next to this script
    and copied across from outside.

    WHAT IT CHANGES, and why each file has to travel:

      devcontainer.json      adds --restart=unless-stopped, overrideCommand:false,
                             shutdownAction:none and init:true, and moves the
                             firewall/read-only check out of postStartCommand
                             into the image entrypoint, because a plain
                             `docker start` runs NO lifecycle callback at all.
      Dockerfile             installs container-entrypoint.sh and declares the
                             ENTRYPOINT/CMD that the above relies on.
      container-entrypoint.sh  new file: refuses to start on a writable
                             configuration, restores the firewall, arms the
                             launcher, then execs the container command.
      init-firewall.sh       the host copy is older than the reviewed one and
                             lacks several allowed hosts; rebuilding with the
                             stale copy would silently narrow the allowlist.
      fill-workspace.sh      copied for completeness; identical today, and the
                             script says so rather than pretending it changed.

    HOST-ONLY files are never touched: CLAUDE.md, hooks\, settings.json and
    anything else living only in the active folder stay exactly as they are.

    A timestamped backup of the whole active folder is written first, and
    -Rollback puts the newest backup back.

.PARAMETER Rollback
    Restore the most recent backup instead of deploying.

.PARAMETER WhatIfOnly
    Show what would change and exit without writing anything.

.EXAMPLE
    .\deploy-container-recovery.ps1 -WhatIfOnly

.EXAMPLE
    .\deploy-container-recovery.ps1
#>
[CmdletBinding()]
param(
    [switch] $Rollback,
    [switch] $WhatIfOnly
)

$ErrorActionPreference = 'Stop'

$staging = Join-Path $PSScriptRoot 'devcontainer'
$active = Join-Path (Split-Path $PSScriptRoot -Parent) '.devcontainer'

Write-Host "staging (reviewed) : $staging"
Write-Host "active  (host)     : $active"
Write-Host ''

if (-not (Test-Path $active)) {
    throw "No active .devcontainer at $active. Run this script from the hoa-host folder that sits NEXT TO .devcontainer."
}

# ------------------------------------------------------------------ rollback

if ($Rollback) {
    $backups = Get-ChildItem -Directory (Split-Path $active -Parent) -Filter '.devcontainer.backup-*' |
        Sort-Object Name -Descending
    if (-not $backups) { throw 'No backup found to roll back to.' }
    $newest = $backups[0]
    Write-Host "Restoring $($newest.FullName) -> $active" -ForegroundColor Yellow
    Copy-Item -Recurse -Force (Join-Path $newest.FullName '*') $active
    Write-Host 'Restored. Rebuild the container to make it effective.' -ForegroundColor Green
    return
}

if (-not (Test-Path $staging)) {
    throw "No staged configuration at $staging. The agent writes it there; ask it to stage the reviewed .devcontainer again."
}

# --------------------------------------------------------------- what changes

$files = 'devcontainer.json', 'Dockerfile', 'container-entrypoint.sh', 'init-firewall.sh', 'fill-workspace.sh'
$plan = @()

foreach ($name in $files) {
    $src = Join-Path $staging $name
    $dst = Join-Path $active $name
    if (-not (Test-Path $src)) { $plan += [pscustomobject]@{ File = $name; Action = 'MISSING IN STAGING' }; continue }
    if (-not (Test-Path $dst)) { $plan += [pscustomobject]@{ File = $name; Action = 'NEW' }; continue }
    $a = (Get-FileHash $src -Algorithm SHA256).Hash
    $b = (Get-FileHash $dst -Algorithm SHA256).Hash
    $plan += [pscustomobject]@{ File = $name; Action = $(if ($a -eq $b) { 'unchanged' } else { 'REPLACE' }) }
}

$plan | Format-Table -AutoSize | Out-String | Write-Host

$hostOnly = Get-ChildItem $active | Where-Object { $files -notcontains $_.Name } | Select-Object -ExpandProperty Name
if ($hostOnly) {
    Write-Host "Kept untouched (host-only): $($hostOnly -join ', ')" -ForegroundColor Gray
    Write-Host ''
}

if ($plan | Where-Object { $_.Action -eq 'MISSING IN STAGING' }) {
    throw 'Staging is incomplete — refusing to deploy a half configuration.'
}

$todo = @($plan | Where-Object { $_.Action -in 'NEW', 'REPLACE' })
if ($todo.Count -eq 0) {
    Write-Host 'Nothing to do: the active configuration already matches the reviewed one.' -ForegroundColor Green
    Write-Host 'If the container still does not restart itself, it has not been REBUILT since the change.' -ForegroundColor Yellow
    return
}
if ($WhatIfOnly) {
    Write-Host 'WhatIfOnly: nothing written.' -ForegroundColor Cyan
    return
}

# --------------------------------------------------------------------- deploy

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path (Split-Path $active -Parent) ".devcontainer.backup-$stamp"
Write-Host "Backup: $backup"
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item -Recurse -Force (Join-Path $active '*') $backup

foreach ($row in $todo) {
    Copy-Item -Force (Join-Path $staging $row.File) (Join-Path $active $row.File)
    Write-Host "  $($row.Action.PadRight(8)) $($row.File)" -ForegroundColor Green
}

Write-Host ''
Write-Host 'Deployed. THE CHANGE IS NOT LIVE YET.' -ForegroundColor Yellow
Write-Host 'A reload does not install an entrypoint — the image must be rebuilt:' -ForegroundColor Yellow
Write-Host '  VS Code -> F1 -> "Dev Containers: Rebuild Container"' -ForegroundColor White
Write-Host ''
Write-Host 'Then prove it with the drill, which needs no editor:' -ForegroundColor Gray
Write-Host '  .\restart-drill.ps1' -ForegroundColor White
Write-Host ''
Write-Host "Undo: .\deploy-container-recovery.ps1 -Rollback   (restores $backup)" -ForegroundColor Gray
