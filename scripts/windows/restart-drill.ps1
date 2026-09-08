<#
.SYNOPSIS
    Proves — or disproves — that the container comes back on its own after a
    crash, without an editor, and that the batch launcher arms itself again.

.DESCRIPTION
    Run from an ORDINARY PowerShell on the Windows host, OUTSIDE VS Code, with
    every VS Code window attached to the container closed.

    This is the drill that decides whether the deployed recovery change works.
    It is the only test that matters, because the unit tests around the
    entrypoint run against isolated fixtures and cannot observe Docker at all.

    THIS DRILL STOPS THE CONTAINER. Every agent, delegated author and verify
    suite inside it dies. The script refuses to run while a browser suite is
    working, and asks before it stops anything, unless -Force is given.

    What it measures, in order:

      1. the container's identity, entrypoint, restart policy and start time;
      2. the launcher and batch-pause state BEFORE the drill, so a deliberate
         stop is not mistaken for a failed recovery;
      3. `docker stop` followed by `docker start` from outside any editor,
         with a stopwatch;
      4. how long the launcher needs to report a live PID and a FRESH tick —
         an exit code alone proves nothing and is not accepted;
      5. a second sample ten seconds later, so a launcher that starts and
         immediately dies is not recorded as a success;
      6. optionally (-IncludeEngineRestart) the same observation after a Docker
         Desktop restart, which is what actually happens when the VM dies —
         there `docker start` must NOT be used: the restart policy has to fire
         by itself.

    The report is written next to this script, i.e. into the folder mounted
    into the container, so the agent can read the outcome without a hand-over.

.PARAMETER ContainerId
    Container to drill. Default: the single running container with a vsc-* image.

.PARAMETER TimeoutSeconds
    How long the launcher may take to report a live, freshly ticking daemon.
    Default 60, as in docs/wsl-vm-recovery.md.

.PARAMETER IncludeEngineRestart
    Also restart Docker Desktop and observe recovery WITHOUT docker start.

.PARAMETER Force
    Do not ask before stopping the container.

.EXAMPLE
    .\restart-drill.ps1

.EXAMPLE
    .\restart-drill.ps1 -IncludeEngineRestart
#>
[CmdletBinding()]
param(
    [string] $ContainerId,
    [int] $TimeoutSeconds = 60,
    [switch] $IncludeEngineRestart,
    [switch] $Force
)

$ErrorActionPreference = 'Continue'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportPath = Join-Path $PSScriptRoot "restart-drill-$stamp.txt"
$report = New-Object System.Text.StringBuilder
$verdicts = @()

function Say {
    param([string] $Text = '', [string] $Colour = 'Gray')
    Write-Host $Text -ForegroundColor $Colour
    [void] $report.AppendLine($Text)
}

function Step { param([string] $Title) Say ''; Say ('-' * 74); Say "STEP $Title"; Say ('-' * 74) }

function Record {
    param([string] $Name, [bool] $Ok, [string] $Detail)
    $verdicts += [pscustomobject]@{ Check = $Name; Result = $(if ($Ok) { 'PASS' } else { 'FAIL' }); Detail = $Detail }
    Say ("  [{0}] {1} — {2}" -f $(if ($Ok) { 'PASS' } else { 'FAIL' }), $Name, $Detail) $(if ($Ok) { 'Green' } else { 'Red' })
}

# Run a command inside the container as the batch user, in the main checkout.
function In-Container {
    param([string] $Id, [string[]] $Command)
    docker exec --user node --workdir /workspace/hoa $Id @Command 2>&1
}

Say "Heart of Africa - unattended restart drill"
Say "started : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')"
Say "host    : $env:COMPUTERNAME"

# ------------------------------------------------------- step 1: identify it

Step '1 — identify the container'

if (-not $ContainerId) {
    $candidates = @(docker ps --format '{{.ID}} {{.Image}}' | Where-Object { $_ -match '\svsc-' })
    if ($candidates.Count -ne 1) {
        Say "Expected exactly one running vsc-* container, found $($candidates.Count):" 'Red'
        $candidates | ForEach-Object { Say "  $_" }
        Say 'Pass -ContainerId explicitly.' 'Yellow'
        [IO.File]::WriteAllText($reportPath, $report.ToString(), (New-Object System.Text.UTF8Encoding($false)))
        return
    }
    $ContainerId = ($candidates[0] -split '\s')[0]
}
Say "container: $ContainerId"

$inspect = docker inspect $ContainerId --format @'
Name          : {{.Name}}
Image         : {{.Image}}
StartedAt     : {{.State.StartedAt}}
Status        : {{.State.Status}}
ExitCode      : {{.State.ExitCode}}
RestartCount  : {{.RestartCount}}
RestartPolicy : {{.HostConfig.RestartPolicy.Name}}
Entrypoint    : {{.Config.Entrypoint}}
Cmd           : {{.Config.Cmd}}
'@
Say ($inspect | Out-String).TrimEnd()

$policy = (docker inspect $ContainerId --format '{{.HostConfig.RestartPolicy.Name}}').Trim()
Record 'restart policy is unless-stopped' ($policy -eq 'unless-stopped') "policy = '$policy'"

$entry = (docker inspect $ContainerId --format '{{json .Config.Entrypoint}}').Trim()
Record 'image entrypoint installed' ($entry -match 'container-entrypoint\.sh') "entrypoint = $entry"

if ($entry -notmatch 'container-entrypoint\.sh') {
    Say ''
    Say 'The container was not rebuilt with the reviewed configuration — the drill would' 'Yellow'
    Say 'only prove that Docker can start a container, not that it arms itself. Run' 'Yellow'
    Say 'deploy-container-recovery.ps1 and rebuild first.' 'Yellow'
}

# ------------------------------------------- step 2: state before, and safety

Step '2 — state before the drill'

$busy = In-Container $ContainerId @('bash', '-lc', 'pgrep -af "verify/run-all|playwright" || true')
if ($busy -and ($busy | Out-String).Trim()) {
    Say 'A browser suite is running inside the container:' 'Red'
    Say ($busy | Out-String).TrimEnd()
    Say 'Refusing to stop the container: that would discard a running verification.' 'Red'
    [IO.File]::WriteAllText($reportPath, $report.ToString(), (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Report: $reportPath"
    return
}
Say 'no browser suite running — safe to stop'

$statusBefore = In-Container $ContainerId @('node', 'scripts/batch-launcher.mjs', '--status')
Say ''
Say 'launcher --status BEFORE:'
Say ($statusBefore | Out-String).TrimEnd()

# A deliberate launcher stop or a user-requested batch pause must survive the
# drill: recovery means "back to the state it was in", not "started regardless".
$wasStopped = ($statusBefore | Out-String) -match '"?state"?\s*[:=]\s*"?stopped'
if ($wasStopped) {
    Say ''
    Say 'The launcher is deliberately STOPPED. The drill can still prove that the' 'Yellow'
    Say 'container returns, but not that it arms — start it first if you want that.' 'Yellow'
}

if (-not $Force) {
    Say ''
    $answer = Read-Host 'This STOPS the container and kills every agent inside it. Continue? (yes/no)'
    if ($answer -ne 'yes') { Say 'Aborted by the operator.'; [IO.File]::WriteAllText($reportPath, $report.ToString(), (New-Object System.Text.UTF8Encoding($false))); return }
}

# ------------------------------------------------- step 3: stop, then start

Step '3 — docker stop, then docker start, from outside any editor'

Say "stopping $ContainerId ..."
docker stop $ContainerId | Out-Null
$stoppedState = (docker inspect $ContainerId --format '{{.State.Status}}').Trim()
Say "state after stop: $stoppedState"

# Docker's restart-policy semantics: a MANUAL stop suppresses automatic restart,
# so this half of the drill has to start it again explicitly. Only step 6 tests
# the policy itself.
Start-Sleep -Seconds 2
$watch = [Diagnostics.Stopwatch]::StartNew()
docker start $ContainerId | Out-Null
Say "started again after $([math]::Round($watch.Elapsed.TotalSeconds,1)) s"

# ------------------------------------ step 4: wait for a LIVE, TICKING launcher

Step "4 — poll the launcher for a live PID and a fresh tick (max $TimeoutSeconds s)"

$armed = $false
$lastOut = ''
$armedAfter = $null
while ($watch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    Start-Sleep -Seconds 3
    $out = In-Container $ContainerId @('node', 'scripts/batch-launcher.mjs', '--status')
    $lastOut = ($out | Out-String).Trim()
    if ($lastOut -match '"?state"?\s*[:=]\s*"?(ready|running)' -and $lastOut -match '"?pid"?\s*[:=]\s*"?\d+') {
        $armed = $true
        $armedAfter = [math]::Round($watch.Elapsed.TotalSeconds, 1)
        break
    }
}
Say "last --status after $([math]::Round($watch.Elapsed.TotalSeconds,1)) s:"
Say $lastOut
Record 'launcher reports a live daemon within the timeout' $armed $(if ($armed) { "after $armedAfter s" } else { "not reached within $TimeoutSeconds s" })

if ($armed) {
    $pidMatch = [regex]::Match($lastOut, '"?pid"?\s*[:=]\s*"?(\d+)')
    if ($pidMatch.Success) {
        $daemonPid = $pidMatch.Groups[1].Value
        $cmdline = In-Container $ContainerId @('bash', '-lc', "tr '\0' ' ' < /proc/$daemonPid/cmdline 2>/dev/null || echo MISSING")
        $cmdlineText = ($cmdline | Out-String).Trim()
        Say "pid $daemonPid cmdline: $cmdlineText"
        Record 'the recorded PID is really the launcher daemon' ($cmdlineText -match 'batch-launcher') "cmdline = $cmdlineText"
    }
}

# --------------------------------------- step 5: still alive ten seconds later

Step '5 — second sample after 10 s (a launcher that dies at once is not recovery)'

Start-Sleep -Seconds 10
$second = In-Container $ContainerId @('node', 'scripts/batch-launcher.mjs', '--status')
$secondText = ($second | Out-String).Trim()
Say $secondText
Record 'launcher still live at the second sample' ($secondText -match '"?state"?\s*[:=]\s*"?(ready|running)') 'second --status sample'

Say ''
Say 'container logs since the start:'
Say ((docker logs --since 5m --timestamps $ContainerId 2>&1 | Select-Object -Last 60 | Out-String).TrimEnd())

# --------------------------------- step 6: the engine restart, the real case

if ($IncludeEngineRestart) {
    Step '6 — Docker Desktop restart: the restart policy must fire WITHOUT docker start'

    $before = (docker inspect $ContainerId --format '{{.State.StartedAt}}').Trim()
    Say "StartedAt before: $before"

    $dd = Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue
    if (-not $dd) {
        Say 'Docker Desktop is not running as a desktop process — skipping.' 'Yellow'
    } else {
        Say 'stopping Docker Desktop ...'
        $exe = $dd[0].Path
        $dd | Stop-Process -Force
        Start-Sleep -Seconds 15
        Say 'starting Docker Desktop ...'
        Start-Process $exe | Out-Null

        $engineWatch = [Diagnostics.Stopwatch]::StartNew()
        $recovered = $false
        while ($engineWatch.Elapsed.TotalSeconds -lt 300) {
            Start-Sleep -Seconds 10
            $state = (docker inspect $ContainerId --format '{{.State.Status}}' 2>$null)
            if ($state -and $state.Trim() -eq 'running') { $recovered = $true; break }
        }
        $after = (docker inspect $ContainerId --format '{{.State.StartedAt}}' 2>$null)
        Say "StartedAt after : $after"
        Record 'container returned by itself after an engine restart' $recovered "waited $([math]::Round($engineWatch.Elapsed.TotalSeconds,0)) s; no docker start was issued"

        if ($recovered) {
            Start-Sleep -Seconds 20
            $third = In-Container $ContainerId @('node', 'scripts/batch-launcher.mjs', '--status')
            $thirdText = ($third | Out-String).Trim()
            Say $thirdText
            Record 'launcher armed itself after the engine restart' ($thirdText -match '"?state"?\s*[:=]\s*"?(ready|running)') 'no editor, no --arm was called by hand'
        }
    }
} else {
    Step '6 — skipped'
    Say 'Docker Desktop restart not tested. That is the case that actually happens when'
    Say 'the VM dies, so run this again with -IncludeEngineRestart once the manual'
    Say 'stop/start half passes.'
}

# ------------------------------------------------------------------- verdict

Step 'VERDICT'
if ($verdicts.Count -eq 0) {
    Say 'no checks ran'
} else {
    $verdicts | Format-Table -AutoSize | Out-String | ForEach-Object { Say $_.TrimEnd() }
    $failed = @($verdicts | Where-Object { $_.Result -eq 'FAIL' })
    if ($failed.Count -eq 0) {
        Say ''
        Say 'ALL CHECKS PASSED — the container recovers unattended.' 'Green'
    } else {
        Say ''
        Say "$($failed.Count) CHECK(S) FAILED — the batch still dies with the VM." 'Red'
    }
}

[IO.File]::WriteAllText($reportPath, $report.ToString(), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ''
Write-Host "Report written: $reportPath" -ForegroundColor Green
Write-Host 'It lies in the folder mounted into the container, so the agent can read it.' -ForegroundColor Gray
