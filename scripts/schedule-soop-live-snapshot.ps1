param(
  [string]$TaskName = "NZU_SOOP_Live_Snapshot_5min",
  [int]$IntervalMinutes = 5,
  [switch]$RunAsSystem = $true,
  [string]$RunAsUser = "",
  [string]$RunAsPassword = ""
)

$ErrorActionPreference = "Stop"

if ($IntervalMinutes -lt 1) {
  throw "IntervalMinutes must be >= 1."
}

$Root = Split-Path -Parent $PSScriptRoot
$NodeExe = (Get-Command node).Source
if (-not $NodeExe) {
  throw "node executable not found in PATH."
}

$WatchScript = Join-Path $Root "scripts\tools\watch-soop-live-snapshot.js"
if (!(Test-Path $WatchScript)) {
  throw "Missing file: $WatchScript"
}

$TaskCommand = "cmd /c cd /d `"$Root`" && `"$NodeExe`" `"$WatchScript`" --interval-sec $($IntervalMinutes * 60)"

if ($RunAsSystem) {
  schtasks /Create /F /SC MINUTE /MO $IntervalMinutes /TN $TaskName /TR $TaskCommand /RU "SYSTEM" /RL HIGHEST | Out-Null
  $accountText = "SYSTEM"
} else {
  if ([string]::IsNullOrWhiteSpace($RunAsUser) -or [string]::IsNullOrWhiteSpace($RunAsPassword)) {
    throw "When -RunAsSystem is disabled, both -RunAsUser and -RunAsPassword are required."
  }
  schtasks /Create /F /SC MINUTE /MO $IntervalMinutes /TN $TaskName /TR $TaskCommand /RU $RunAsUser /RP $RunAsPassword /RL HIGHEST | Out-Null
  $accountText = $RunAsUser
}

Write-Output "Task registered: $TaskName"
Write-Output "IntervalMinutes: $IntervalMinutes"
Write-Output "Command: $TaskCommand"
Write-Output "RunAs: $accountText"
