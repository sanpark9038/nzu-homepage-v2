param(
  [string]$TaskName = "NZU_Daily_Pipeline",
  [string]$Time = "03:10",
  [string]$NodeArgs = "run pipeline:daily"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root "tmp\logs"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$LogPath = Join-Path $LogDir "daily-pipeline.log"

$command = "cmd /c cd /d `"$Root`" && npm $NodeArgs >> `"$LogPath`" 2>&1"

schtasks /Create /F /SC DAILY /TN $TaskName /TR $command /ST $Time | Out-Null

Write-Output "Task registered: $TaskName"
Write-Output "Time: $Time"
Write-Output "Command: $command"
Write-Output "Log: $LogPath"

