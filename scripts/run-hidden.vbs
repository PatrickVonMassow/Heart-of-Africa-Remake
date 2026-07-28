' Launches the batch autostart tick with NO console window (point 401, cause 2).
'
' WHY: the scheduled task HoA-Batch-Autostart runs node.exe directly under an
' Interactive logon, so Task Scheduler opens a console on the user's desktop
' every 15 minutes — ~96 windows a day, each one stealing the focus (user report
' 28.07.2026). The session that tick spawns does NOT need that console:
' batch-autostart.mjs already spawns detached, with stdio to a log file and
' windowsHide set. Only the launcher's own window was left.
'
' The `0` in the Run call is the whole fix: window style "hidden". The `False`
' means "do not wait for it" — the tick is fire-and-forget, exactly as before.
'
' Paths are DERIVED from this script's own location rather than hard-coded, so
' moving or renaming the checkout does not silently break the nightly batch. A
' failed start is APPENDED TO THE LOG rather than swallowed: with no window
' there is nothing to see, and a launcher that fails invisibly is worse than one
' that flashes.
'
' Wire it up (PowerShell, as administrator):
'   $a = New-ScheduledTaskAction -Execute "C:\Windows\System32\wscript.exe" `
'        -Argument '"<repo>\scripts\run-hidden.vbs"' -WorkingDirectory "<repo>"
'   Set-ScheduledTask -TaskName "HoA-Batch-Autostart" -Action $a

Option Explicit

Dim fso, sh, scriptDir, repoRoot, nodeExe, target, logPath, cmd

' Appends one line to the launcher's own log. Best effort: if even this fails
' there is nothing further a windowless script can do.
Sub Complain(message)
    Dim stream
    On Error Resume Next
    Set stream = fso.OpenTextFile(logPath, 8, True)
    stream.WriteLine "[" & Now & "] " & message
    stream.Close
    On Error GoTo 0
End Sub

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
repoRoot = fso.GetParentFolderName(scriptDir)
target = fso.BuildPath(scriptDir, "batch-autostart.mjs")
logPath = fso.BuildPath(fso.BuildPath(repoRoot, ".claude"), "autostart.log")

' Prefer the standard install; fall back to PATH so a different node location
' still works. Only the absolute path can be checked up front.
nodeExe = fso.BuildPath(sh.ExpandEnvironmentStrings("%ProgramFiles%"), "nodejs\node.exe")
If Not fso.FileExists(nodeExe) Then nodeExe = "node"

If Not fso.FileExists(target) Then
    Complain "run-hidden.vbs: " & target & " not found — the batch tick did NOT run."
    WScript.Quit 1
End If

sh.CurrentDirectory = repoRoot
cmd = """" & nodeExe & """ """ & target & """"

On Error Resume Next
sh.Run cmd, 0, False
If Err.Number <> 0 Then
    Complain "run-hidden.vbs: could not start """ & nodeExe & """ (" & Err.Description & ") — the batch tick did NOT run."
    WScript.Quit 1
End If
On Error GoTo 0
