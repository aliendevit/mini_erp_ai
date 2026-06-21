param(
    [switch] $NoBuild
)

. "$PSScriptRoot\_compose.ps1"

Assert-DockerAvailable

$args = @("up", "-d")
if (-not $NoBuild) {
    $args += "--build"
}

Write-Host "Starting Mini ERP AI services..."
Invoke-ProjectCompose -Arguments $args

Write-Host ""
Write-Host "Service status:"
Invoke-ProjectCompose -Arguments @("ps")
Write-ServiceUrls
