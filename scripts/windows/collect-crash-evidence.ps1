<#
.SYNOPSIS
    Collects, in ONE call, every trace of a container/VM death that the agent
    inside the container cannot reach, and writes it back to a folder the agent
    can read.

.DESCRIPTION
    Run from an ORDINARY PowerShell on the Windows host (no elevation needed for
    the Docker and WSL parts; the System event log may need elevation on some
    machines — the script says so per section instead of failing).

    The container has neither a Docker socket nor wsl.exe, and its dmesg is
    empty, so three questions are unanswerable from inside and are exactly the
    ones that decide whether a death was the machine, the engine or the suites:

      (a) HOW did the container exit — exit code, OOM flag, restart count, and
          whether the restart policy fired at all.
      (b) Did the WSL VM itself crash — a dump under %LOCALAPPDATA%\Temp\wsl-crashes
          is the only durable evidence, and Docker Desktop restarts erase the rest.
      (c) What ELSE happened at that minute — a Windows update, a sleep/resume,
          an unexpected power event, a Hyper-V or dxgkrnl fault.

    The report is written next to this script by default, i.e. into the folder
    that is mounted into the container as /workspace, so the agent reads the
    result without any further hand-over.

.PARAMETER Since
    How far back to search the event logs. Default 72 hours, which covers the
    three deaths of 06.-08.09.2026.

.PARAMETER Around
    Zero or more timestamps of known deaths. Each gets its own tightly windowed
    section (+/- 10 minutes) so the interesting minute is not buried in noise.
    Accepts anything Get-Date parses, e.g. "2026-09-08 05:26".

.PARAMETER ContainerId
    Container to inspect. Default: every container whose image looks like a
    VS Code dev container (vsc-*).

.PARAMETER OutFile
    Where to write the report. Default: .\crash-evidence-<timestamp>.txt next
    to this script.

.EXAMPLE
    .\collect-crash-evidence.ps1

.EXAMPLE
    .\collect-crash-evidence.ps1 -Around "2026-09-06 03:07","2026-09-07 12:12","2026-09-08 05:26"
#>
[CmdletBinding()]
param(
    [double] $Since = 72,
    [string[]] $Around = @(),
    [string] $ContainerId,
    [string] $OutFile
)

$ErrorActionPreference = 'Continue'
$start = (Get-Date).AddHours(-$Since)

if (-not $OutFile) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $OutFile = Join-Path $PSScriptRoot "crash-evidence-$stamp.txt"
}

$report = New-Object System.Text.StringBuilder

function Add-Line { param([string] $Text = '') [void] $report.AppendLine($Text) }

function Add-Section {
    param([string] $Title)
    Add-Line
    Add-Line ('=' * 78)
    Add-Line "== $Title"
    Add-Line ('=' * 78)
}

# Every probe runs inside this wrapper: a machine that lacks a tool, a log or a
# permission must still produce a COMPLETE report with a named gap, because an
# absent section is indistinguishable from an absent cause otherwise.
function Add-Probe {
    param([string] $Title, [scriptblock] $Body)
    Add-Section $Title
    try {
        $out = & $Body 2>&1
        if ($null -eq $out -or ($out | Measure-Object).Count -eq 0) {
            Add-Line '(no rows — the source exists and returned nothing)'
        } else {
            $out | Out-String -Width 200 | ForEach-Object { Add-Line $_.TrimEnd() }
        }
    } catch {
        Add-Line "(UNAVAILABLE: $($_.Exception.Message))"
    }
}

Write-Host "Collecting host evidence since $($start.ToString('yyyy-MM-dd HH:mm'))..." -ForegroundColor Cyan

Add-Line "Heart of Africa - host crash evidence"
Add-Line "collected  : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')"
Add-Line "window     : since $($start.ToString('yyyy-MM-dd HH:mm')) ($Since h)"
Add-Line "host       : $env:COMPUTERNAME"
Add-Line "user       : $env:USERNAME"
Add-Line "elevated   : $((New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator))"

# ---------------------------------------------------------------- (a) Docker

Add-Probe 'Docker: version and engine state' { docker version }
Add-Probe 'Docker: all containers' { docker ps -a --no-trunc --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Status}}\t{{.RunningFor}}' }

$targets = @()
if ($ContainerId) {
    $targets = @($ContainerId)
} else {
    try {
        $targets = @(docker ps -a --format '{{.ID}} {{.Image}}' |
            Where-Object { $_ -match '\svsc-' } |
            ForEach-Object { ($_ -split '\s')[0] })
    } catch { $targets = @() }
}

if (-not $targets -or $targets.Count -eq 0) {
    Add-Section 'Docker: dev container inspection'
    Add-Line '(no container with a vsc-* image found — pass -ContainerId explicitly)'
} else {
    foreach ($id in $targets) {
        # The five fields that decide the question. ExitCode 137 is a SIGKILL
        # (the engine or the kernel took it), 143 is our own SIGTERM handover,
        # 0 with a FinishedAt is a clean stop. OOMKilled separates "the machine
        # ran out" from "something outside killed it". RestartCount says whether
        # unless-stopped ever fired: a death with a two-hour gap and count 0 is
        # a restart policy that never ran, not a policy that failed.
        Add-Probe "Docker: state of $id" {
            docker inspect $id --format @'
Name          : {{.Name}}
Image         : {{.Image}}
Created       : {{.Created}}
StartedAt     : {{.State.StartedAt}}
FinishedAt    : {{.State.FinishedAt}}
Status        : {{.State.Status}}
Running       : {{.State.Running}}
ExitCode      : {{.State.ExitCode}}
OOMKilled     : {{.State.OOMKilled}}
Error         : {{.State.Error}}
RestartCount  : {{.RestartCount}}
RestartPolicy : {{.HostConfig.RestartPolicy.Name}} (max {{.HostConfig.RestartPolicy.MaximumRetryCount}})
Entrypoint    : {{.Config.Entrypoint}}
Cmd           : {{.Config.Cmd}}
Memory limit  : {{.HostConfig.Memory}}
'@
        }
        Add-Probe "Docker: last 80 log lines of $id" { docker logs --tail 80 --timestamps $id }
    }
}

# Docker Desktop keeps its own logs on disk; the engine's in-memory event
# stream does NOT survive an engine restart, which is precisely what happens
# in these incidents, so the files are the only durable copy.
Add-Probe 'Docker Desktop: log files present' {
    $logDir = Join-Path $env:LOCALAPPDATA 'Docker\log'
    if (-not (Test-Path $logDir)) { throw "no log directory at $logDir" }
    Get-ChildItem -Recurse -File $logDir |
        Where-Object { $_.LastWriteTime -ge $start } |
        Sort-Object LastWriteTime -Descending |
        Select-Object LastWriteTime, @{n = 'SizeKB'; e = { [math]::Round($_.Length / 1KB, 1) } }, FullName |
        Select-Object -First 40
}

# ------------------------------------------------------------------- (b) WSL

Add-Probe 'WSL: version' { wsl.exe --version }
Add-Probe 'WSL: distributions' { wsl.exe --list --verbose }

Add-Probe 'WSL: crash dumps' {
    $dir = Join-Path $env:LOCALAPPDATA 'Temp\wsl-crashes'
    if (-not (Test-Path $dir)) { return "ABSENT: $dir does not exist (no WSL crash dump was ever written)" }
    $dumps = Get-ChildItem -File $dir -ErrorAction Stop
    if ($dumps.Count -eq 0) { return "EMPTY: $dir exists but holds no dump" }
    $dumps | Sort-Object LastWriteTime -Descending |
        Select-Object LastWriteTime, @{n = 'SizeKB'; e = { [math]::Round($_.Length / 1KB, 1) } }, Name
}

Add-Probe 'WSL: .wslconfig (memory and processor ceiling of the VM)' {
    $cfg = Join-Path $env:USERPROFILE '.wslconfig'
    if (-not (Test-Path $cfg)) {
        return "ABSENT: $cfg does not exist — WSL 2 then defaults to 50% of host RAM, which is the ceiling the browser suites run against"
    }
    Get-Content $cfg
}

Add-Probe 'Host: physical memory' {
    $cs = Get-CimInstance Win32_ComputerSystem
    $os = Get-CimInstance Win32_OperatingSystem
    "Total physical : {0:N1} GB" -f ($cs.TotalPhysicalMemory / 1GB)
    "Free physical  : {0:N1} GB" -f ($os.FreePhysicalMemory / 1MB)
    "Last boot      : {0}" -f $os.LastBootUpTime
}

# ------------------------------------------------------- (c) what else happened

# Kernel-Power 41 is the classic "the system rebooted without cleanly shutting
# down first"; 42/107 and Power-Troubleshooter 1 are sleep and resume, which is
# the leading suspect for a death at 03:07 and 05:26 with nobody at the machine.
$powerIds = 41, 42, 107, 109, 1074, 6008
Add-Probe "System log: power, shutdown and resume events (IDs $($powerIds -join ', '))" {
    Get-WinEvent -FilterHashtable @{ LogName = 'System'; StartTime = $start; Id = $powerIds } -ErrorAction Stop |
        Sort-Object TimeCreated -Descending |
        Select-Object TimeCreated, Id, ProviderName, @{n = 'Message'; e = { ($_.Message -split "`n")[0] } }
}

Add-Probe 'System log: sleep/wake detail (Power-Troubleshooter)' {
    Get-WinEvent -FilterHashtable @{ LogName = 'System'; StartTime = $start; ProviderName = 'Microsoft-Windows-Power-Troubleshooter' } -ErrorAction Stop |
        Sort-Object TimeCreated -Descending | Select-Object -First 20 |
        ForEach-Object { "{0}`n{1}`n" -f $_.TimeCreated, $_.Message }
}

Add-Probe 'System log: Hyper-V, vmcompute, WSL service and GPU (dxgkrnl) faults' {
    Get-WinEvent -FilterHashtable @{ LogName = 'System'; StartTime = $start; Level = 1, 2, 3 } -ErrorAction Stop |
        Where-Object { $_.ProviderName -match 'Hyper-V|vmcompute|LxssManager|WSL|dxgkrnl|display|nvlddmkm' } |
        Sort-Object TimeCreated -Descending | Select-Object -First 60 |
        Select-Object TimeCreated, Id, LevelDisplayName, ProviderName, @{n = 'Message'; e = { ($_.Message -split "`n")[0] } }
}

Add-Probe 'Windows Update: installation history' {
    Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-WindowsUpdateClient/Operational'; StartTime = $start } -ErrorAction Stop |
        Sort-Object TimeCreated -Descending | Select-Object -First 40 |
        Select-Object TimeCreated, Id, @{n = 'Message'; e = { ($_.Message -split "`n")[0] } }
}

Add-Probe 'Application log: errors and warnings' {
    Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $start; Level = 1, 2 } -ErrorAction Stop |
        Sort-Object TimeCreated -Descending | Select-Object -First 40 |
        Select-Object TimeCreated, Id, ProviderName, @{n = 'Message'; e = { ($_.Message -split "`n")[0] } }
}

# ------------------------------------------- tight windows around known deaths

foreach ($moment in $Around) {
    $at = $null
    try { $at = [datetime]::Parse($moment, [Globalization.CultureInfo]::GetCultureInfo('de-DE')) } catch { }
    if (-not $at) { try { $at = Get-Date $moment } catch { } }
    if (-not $at) {
        Add-Section "Death window $moment"
        Add-Line "(UNPARSEABLE timestamp: $moment)"
        continue
    }

    Add-Probe "Death window $($at.ToString('yyyy-MM-dd HH:mm')) +/- 10 min — EVERY System and Application row" {
        $from = $at.AddMinutes(-10)
        $to = $at.AddMinutes(10)
        $rows = @()
        foreach ($log in 'System', 'Application') {
            $rows += Get-WinEvent -FilterHashtable @{ LogName = $log; StartTime = $from; EndTime = $to } -ErrorAction SilentlyContinue
        }
        if ($rows.Count -eq 0) { return "(no event in either log between $from and $to — the machine logged nothing at all, which itself points at an abrupt VM loss rather than a Windows-side action)" }
        $rows | Sort-Object TimeCreated |
            Select-Object TimeCreated, LogName, Id, LevelDisplayName, ProviderName, @{n = 'Message'; e = { ($_.Message -split "`n")[0] } }
    }
}

# ------------------------------------------------------------------- verdict

Add-Section 'How to read this'
Add-Line 'ExitCode 137 + OOMKilled false + no Windows event in the death window'
Add-Line '  -> the VM was taken down from outside the container; look at WSL crash dumps and .wslconfig memory.'
Add-Line 'ExitCode 137 + OOMKilled true'
Add-Line '  -> the container hit its own memory limit; the suites are the cause and the fix is in the repository.'
Add-Line 'RestartCount 0 with a long gap between FinishedAt and the next StartedAt'
Add-Line '  -> unless-stopped never fired: either the engine was down too, or the container was deliberately stopped.'
Add-Line 'A Power-Troubleshooter or Kernel-Power 42/107 row inside the window'
Add-Line '  -> the host slept and the VM did not survive it; this is a Windows power-setting fix, not a repository one.'
Add-Line 'A WindowsUpdateClient row inside the window'
Add-Line '  -> an update restarted the platform under the batch.'

[IO.File]::WriteAllText($OutFile, $report.ToString(), (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Host "Report written: $OutFile" -ForegroundColor Green
Write-Host 'It lies in the folder that is mounted into the container, so the agent can read it directly.' -ForegroundColor Gray
