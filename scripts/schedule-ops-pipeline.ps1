param(
  [string]$PipelineTaskName = "NZU_Ops_Pipeline_0610",
  [string]$HealthTaskName = "NZU_Ops_Pipeline_0620_HealthCheck",
  [string]$PipelineTime = "06:10",
  [string]$HealthTime = "06:20",
  [switch]$RunAsSystem = $true,
  [string]$RunAsUser = "",
  [string]$RunAsPassword = ""
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$OpsCmd = Join-Path $Root "scripts\tools\run-ops-pipeline.cmd"
$HealthCmd = Join-Path $Root "scripts\tools\check-ops-pipeline-freshness.cmd"

if (!(Test-Path $OpsCmd)) { throw "Missing file: $OpsCmd" }
if (!(Test-Path $HealthCmd)) { throw "Missing file: $HealthCmd" }

$PipelineCommand = "cmd /c `"$OpsCmd`""
$HealthCommand = "cmd /c `"$HealthCmd`""

if ($RunAsSystem) {
  schtasks /Create /F /SC DAILY /TN $PipelineTaskName /TR $PipelineCommand /ST $PipelineTime /RU "SYSTEM" /RL HIGHEST | Out-Null
  schtasks /Create /F /SC DAILY /TN $HealthTaskName /TR $HealthCommand /ST $HealthTime /RU "SYSTEM" /RL HIGHEST | Out-Null
  $accountText = "SYSTEM"
} else {
  if ([string]::IsNullOrWhiteSpace($RunAsUser) -or [string]::IsNullOrWhiteSpace($RunAsPassword)) {
    throw "When -RunAsSystem is disabled, both -RunAsUser and -RunAsPassword are required."
  }
  schtasks /Create /F /SC DAILY /TN $PipelineTaskName /TR $PipelineCommand /ST $PipelineTime /RU $RunAsUser /RP $RunAsPassword /RL HIGHEST | Out-Null
  schtasks /Create /F /SC DAILY /TN $HealthTaskName /TR $HealthCommand /ST $HealthTime /RU $RunAsUser /RP $RunAsPassword /RL HIGHEST | Out-Null
  $accountText = $RunAsUser
}

Write-Output "Task registered: $PipelineTaskName ($PipelineTime)"
Write-Output "Command: $PipelineCommand"
Write-Output "Task registered: $HealthTaskName ($HealthTime)"
Write-Output "Command: $HealthCommand"
Write-Output "RunAs: $accountText"
