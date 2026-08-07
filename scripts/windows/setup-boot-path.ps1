<#
.SYNOPSIS
    Arms the Windows boot path of the batch: an at-logon resume, a second
    scheduled task that watches the first (and back), and the update settings
    that keep a restart from parking the machine on a locked screen.

.DESCRIPTION
    Run ONCE from an ELEVATED PowerShell. Registering and modifying scheduled
    tasks needs administrator rights, which the agent working in this repository
    does not have — this script is therefore the whole hand-over, and it is
    IDEMPOTENT: running it twice changes nothing and says so.

    What it does, in order:

      (a) Adds an AT-LOGON trigger to the primary task HoA-Batch-Autostart, so a
          reboot that signs itself back in resumes the batch immediately instead
          of within the next 15-minute tick. The existing triggers are kept.

      (b) Adds a second ACTION to the primary task, `windows-task-watch.mjs
          --check watchdog`, so the primary watches the watchdog. Task Scheduler
          runs actions in order and the batch launcher exits as soon as it has
          spawned (or decided not to), so this costs one short node run a tick.

      (c) Registers the watchdog task HoA-Batch-Watchdog: AT STARTUP, delayed
          seven minutes and then repeating every 15 minutes, running as SYSTEM
          so it works with nobody logged on. It runs `windows-task-watch.mjs
          --check primary` — which re-registers, enables or starts the primary
          when it is gone, disabled or silent.

      (d) Exports both task definitions to local\windows-tasks\, which is what a
          re-registration reads. Git-ignored: they belong to this machine.

      (e) The pre-departure update settings: no forced restart while a user is
          logged on, and automatic restart sign-on ENABLED so an update restart
          returns to a signed-in (if locked) session in which the interactive
          primary task can run. With -PauseUpdatesDays it also pauses Windows
          Update for the length of an absence (Windows allows at most 35 days).

.PARAMETER PauseUpdatesDays
    Pause Windows Update for this many days (1..35). 0 (the default) leaves the
    pause state untouched. Use it right before an absence, not as a standing
    setting.

.PARAMETER DryRun
    Report what would change and change nothing.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\windows\setup-boot-path.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\windows\setup-boot-path.ps1 -PauseUpdatesDays 21
#>
[CmdletBinding()]
param(
    [ValidateRange(0, 35)]
    [int]$PauseUpdatesDays = 0,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Constants. These MUST match scripts/windows-task-core.mjs, which is what
# --- the watch script and the readiness check read; a Vitest case pins them.
$PrimaryTaskName        = 'HoA-Batch-Autostart'
$WatchdogTaskName       = 'HoA-Batch-Watchdog'
$TaskIntervalMinutes    = 15
$WatchdogOffsetMinutes  = 7
$DefinitionDir          = 'local\windows-tasks'
$WatchScript            = 'scripts\windows-task-watch.mjs'

$script:Changes = @()
function Write-Change([string]$text) { $script:Changes += $text; Write-Host "  CHANGED  $text" -ForegroundColor Yellow }
function Write-Same([string]$text)   { Write-Host "  already  $text" -ForegroundColor DarkGray }
function Write-Fail([string]$text)   { Write-Host "  FAILED   $text" -ForegroundColor Red }

# Property access that survives Set-StrictMode: a scheduled-task action carries
# `Arguments` only when it is an Exec action, and reading a property that is not
# there is a terminating error under strict mode.
function Get-Prop($obj, [string]$name) {
    if ($null -eq $obj) { return $null }
    $p = $obj.PSObject.Properties[$name]
    if ($p) { return $p.Value }
    return $null
}

# --- Preconditions --------------------------------------------------------

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'This script must run from an ELEVATED PowerShell (Run as administrator).' -ForegroundColor Red
    Write-Host 'Nothing was changed.'
    exit 2
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$WatchPath = Join-Path $RepoRoot $WatchScript
if (-not (Test-Path $WatchPath)) {
    Write-Host "Cannot find $WatchScript under $RepoRoot — is this the repository checkout?" -ForegroundColor Red
    exit 2
}

$NodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue)
if (-not $NodeExe) { $NodeExe = (Get-Command node -ErrorAction SilentlyContinue) }
if (-not $NodeExe) {
    Write-Host 'Cannot find node.exe on PATH. Install Node or open a shell that has it.' -ForegroundColor Red
    exit 2
}
$NodePath = $NodeExe.Source

Write-Host ''
Write-Host "Repository : $RepoRoot"
Write-Host "node       : $NodePath"
if ($DryRun) { Write-Host 'MODE       : dry run — nothing will be changed' -ForegroundColor Cyan }
Write-Host ''

$WatchWatchdogArgs = '"{0}" --check watchdog' -f $WatchPath
$WatchPrimaryArgs  = '"{0}" --check primary'  -f $WatchPath

# --- (a) + (b) the primary task ------------------------------------------

Write-Host "$PrimaryTaskName"
$primary = Get-ScheduledTask -TaskName $PrimaryTaskName -ErrorAction SilentlyContinue
if (-not $primary) {
    Write-Fail "the primary task does not exist — this script hardens it, it does not create it."
    Write-Host '           Register it first (see docs/batch-autonomy.md), then re-run this script.'
} else {
    # (a) at-logon trigger, added only when no logon trigger is there yet.
    $hasLogon = @($primary.Triggers) | Where-Object { "$(Get-Prop (Get-Prop $_ 'CimClass') 'CimClassName')" -match 'Logon' }
    if ($hasLogon) {
        Write-Same 'at-logon trigger'
    } elseif ($DryRun) {
        Write-Change 'at-logon trigger would be added'
    } else {
        $logon = New-ScheduledTaskTrigger -AtLogOn
        Set-ScheduledTask -TaskName $PrimaryTaskName -Trigger (@($primary.Triggers) + $logon) | Out-Null
        Write-Change 'at-logon trigger added (the resume is now instant, not within 15 min)'
        $primary = Get-ScheduledTask -TaskName $PrimaryTaskName
    }

    # (b) the reciprocal watch action, added only when it is not there yet.
    $hasWatch = @($primary.Actions) | Where-Object { "$(Get-Prop $_ 'Arguments')" -match 'windows-task-watch\.mjs' }
    if ($hasWatch) {
        Write-Same 'watch-the-watchdog action'
    } elseif ($DryRun) {
        Write-Change 'watch-the-watchdog action would be added'
    } else {
        $watchAction = New-ScheduledTaskAction -Execute $NodePath -Argument $WatchWatchdogArgs -WorkingDirectory $RepoRoot
        Set-ScheduledTask -TaskName $PrimaryTaskName -Action (@($primary.Actions) + $watchAction) | Out-Null
        Write-Change 'watch-the-watchdog action added (the primary now checks the second task)'
    }
}

# --- (c) the watchdog task ------------------------------------------------

Write-Host ''
Write-Host "$WatchdogTaskName"

$watchdog = Get-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue
$wanted = $false
if ($watchdog) {
    # IDEMPOTENCY: re-register only when the definition actually differs. The
    # four properties below are the ones this script sets; anything else the user
    # tuned by hand is left alone.
    $actionOk    = @($watchdog.Actions)  | Where-Object { "$(Get-Prop $_ 'Arguments')" -match '--check\s+primary' }
    $bootOk      = @($watchdog.Triggers) | Where-Object { "$(Get-Prop (Get-Prop $_ 'CimClass') 'CimClassName')" -match 'Boot' }
    $repeatOk    = @($watchdog.Triggers) | Where-Object { "$(Get-Prop (Get-Prop $_ 'Repetition') 'Interval')" -eq ('PT{0}M' -f $TaskIntervalMinutes) }
    $systemOk    = "$(Get-Prop (Get-Prop $watchdog 'Principal') 'UserId')" -match 'SYSTEM'
    $wanted = -not ($actionOk -and $bootOk -and $repeatOk -and $systemOk)
} else {
    $wanted = $true
}

if (-not $wanted) {
    Write-Same 'watchdog task registered with an at-startup trigger, a 15-minute repeat and the SYSTEM principal'
} else {
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $trigger.Delay = 'PT{0}M' -f $WatchdogOffsetMinutes
    # An -AtStartup trigger has no repetition of its own; the one from a -Once
    # trigger is the documented way to attach an indefinite repeat to it. The
    # OFFSET is what keeps the two tasks from ticking in the same second, where
    # each would read a peer that has not yet recorded the run it just started.
    $repeatSource = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $TaskIntervalMinutes)
    $trigger.Repetition = $repeatSource.Repetition

    $action = New-ScheduledTaskAction -Execute $NodePath -Argument $WatchPrimaryArgs -WorkingDirectory $RepoRoot
    $principalDef = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
    $settings.Hidden = $true

    if ($DryRun) {
        Write-Change 'watchdog task would be registered (at startup, +7 min, every 15 min, as SYSTEM)'
    } else {
        Register-ScheduledTask -TaskName $WatchdogTaskName `
            -Description 'Watches HoA-Batch-Autostart: re-registers, enables or starts it when it is gone, disabled or silent (repo: scripts/windows-task-watch.mjs).' `
            -Trigger $trigger -Action $action -Principal $principalDef -Settings $settings -Force | Out-Null
        Write-Change 'watchdog task registered (at startup, +7 min, every 15 min, as SYSTEM)'
    }
}

# --- (d) export both definitions -----------------------------------------

Write-Host ''
Write-Host 'exported definitions'
$definitionRoot = Join-Path $RepoRoot $DefinitionDir
if (-not (Test-Path $definitionRoot)) {
    if ($DryRun) { Write-Change "$DefinitionDir would be created" }
    else { New-Item -ItemType Directory -Path $definitionRoot -Force | Out-Null; Write-Change "$DefinitionDir created" }
}
foreach ($name in @($PrimaryTaskName, $WatchdogTaskName)) {
    $target = Join-Path $definitionRoot "$name.xml"
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if (-not $task) { Write-Fail "$name — no such task, nothing to export"; continue }
    $xml = Export-ScheduledTask -TaskName $name
    $current = $null
    if (Test-Path $target) { $current = Get-Content -Raw -Path $target }
    # Compared NORMALIZED: Set-Content appends a newline Export-ScheduledTask does
    # not produce, and an unnormalized comparison would report a change on every
    # single run — the one thing an idempotent script must not do.
    $same = ($null -ne $current) -and ((($current -replace "`r`n", "`n").Trim()) -eq (($xml -replace "`r`n", "`n").Trim()))
    if ($same) {
        Write-Same "$DefinitionDir\$name.xml"
    } elseif ($DryRun) {
        Write-Change "$DefinitionDir\$name.xml would be written"
    } else {
        Set-Content -Path $target -Value $xml -Encoding Unicode
        Write-Change "$DefinitionDir\$name.xml written"
    }
}

# --- (e) the update settings ---------------------------------------------

Write-Host ''
Write-Host 'Windows Update / restart behaviour'

function Set-RegistryValue([string]$path, [string]$name, $value, [string]$kind, [string]$label) {
    $current = $null
    if (Test-Path $path) {
        $item = Get-ItemProperty -Path $path -Name $name -ErrorAction SilentlyContinue
        if ($item) { $current = $item.$name }
    }
    if ("$current" -eq "$value") { Write-Same $label; return }
    if ($DryRun) { Write-Change "$label would be set to $value"; return }
    if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
    New-ItemProperty -Path $path -Name $name -Value $value -PropertyType $kind -Force | Out-Null
    Write-Change "$label set to $value"
}

# No forced restart while a user is signed in — the batch's session is one.
Set-RegistryValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' `
    'NoAutoRebootWithLoggedOnUsers' 1 'DWord' 'no auto-restart while a user is logged on'

# Automatic restart sign-on: after an update restart Windows signs the user back
# in (screen locked) instead of stopping at the sign-in screen. That signed-in
# session is what the INTERACTIVE primary task needs to run at all — this is the
# setting that turns "reboot" from "batch stops until someone types a password"
# into "batch resumes at the at-logon trigger". 0 = enabled (it is a DISABLE flag).
Set-RegistryValue 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' `
    'DisableAutomaticRestartSignOn' 0 'DWord' 'automatic restart sign-on enabled'

if ($PauseUpdatesDays -gt 0) {
    $uxPath = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
    $start  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    $end    = (Get-Date).ToUniversalTime().AddDays($PauseUpdatesDays).ToString('yyyy-MM-ddTHH:mm:ssZ')
    Set-RegistryValue $uxPath 'PauseUpdatesStartTime'        $start 'String' 'update pause start'
    Set-RegistryValue $uxPath 'PauseUpdatesExpiryTime'       $end   'String' "update pause until $end"
    Set-RegistryValue $uxPath 'PauseFeatureUpdatesStartTime' $start 'String' 'feature-update pause start'
    Set-RegistryValue $uxPath 'PauseFeatureUpdatesEndTime'   $end   'String' 'feature-update pause end'
    Set-RegistryValue $uxPath 'PauseQualityUpdatesStartTime' $start 'String' 'quality-update pause start'
    Set-RegistryValue $uxPath 'PauseQualityUpdatesEndTime'   $end   'String' 'quality-update pause end'
} else {
    Write-Same 'update pause untouched (pass -PauseUpdatesDays <1..35> before an absence)'
}

# --- Summary --------------------------------------------------------------

Write-Host ''
if ($script:Changes.Count -eq 0) {
    Write-Host 'Nothing changed — the boot path was already armed.' -ForegroundColor Green
} elseif ($DryRun) {
    Write-Host ("{0} change(s) would be made. Re-run without -DryRun to apply." -f $script:Changes.Count) -ForegroundColor Cyan
} else {
    Write-Host ("{0} change(s) applied:" -f $script:Changes.Count) -ForegroundColor Green
    $script:Changes | ForEach-Object { Write-Host "  - $_" }
}
Write-Host ''
Write-Host 'Check it any time with:'
Write-Host "  Get-ScheduledTask -TaskName '$PrimaryTaskName','$WatchdogTaskName' | Get-ScheduledTaskInfo"
Write-Host "  node $WatchScript --check primary --dry-run"
exit 0
