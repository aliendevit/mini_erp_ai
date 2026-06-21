param(
    [switch] $RemoveContainers
)

. "$PSScriptRoot\_compose.ps1"

Assert-DockerAvailable

if ($RemoveContainers) {
    Write-Host "Stopping and removing Mini ERP AI containers. Volumes are preserved."
    Invoke-ProjectCompose -Arguments @("down")
}
else {
    Write-Host "Stopping Mini ERP AI services. Containers and volumes are preserved."
    Invoke-ProjectCompose -Arguments @("stop")
}

Write-Host ""
Write-Host "Service status:"
Invoke-ProjectCompose -Arguments @("ps")
