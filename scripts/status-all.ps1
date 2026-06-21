param(
    [switch] $WithLogs
)

. "$PSScriptRoot\_compose.ps1"

Assert-DockerAvailable

Write-Host "Mini ERP AI service status:"
Invoke-ProjectCompose -Arguments @("ps")
Write-ServiceUrls

if ($WithLogs) {
    Write-Host ""
    Write-Host "Recent service logs:"
    Invoke-ProjectCompose -Arguments @("logs", "--tail", "80")
}
