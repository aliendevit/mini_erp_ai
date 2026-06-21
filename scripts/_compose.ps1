Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Script:ComposeFile = Join-Path $Script:RepoRoot "docker-compose.python.yml"

function Assert-DockerAvailable {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker is not available on PATH. Start Docker Desktop or install Docker first."
    }

    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker is installed but not reachable. Start Docker Desktop and try again."
    }

    if (-not (Test-Path -LiteralPath $Script:ComposeFile)) {
        throw "Compose file not found: $Script:ComposeFile"
    }
}

function Invoke-ProjectCompose {
    param(
        [Parameter(Mandatory = $true)]
        [string[]] $Arguments
    )

    Push-Location $Script:RepoRoot
    try {
        & docker compose -f $Script:ComposeFile @Arguments
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }
    finally {
        Pop-Location
    }
}

function Write-ServiceUrls {
    Write-Host ""
    Write-Host "Frontend: http://localhost:3000"
    Write-Host "Backend:  http://localhost:3001/api/health"
    Write-Host "Postgres: localhost:5432"
}
