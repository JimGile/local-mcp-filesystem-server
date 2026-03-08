param(
    [string]$ProjectRoot = "C:\Data\Projects\local-mcp-filesystem-server",
    [string]$BaseDir = "C:\mcp-sandbox\base",
    [ValidateSet("stdio", "http", "both")]
    [string]$Transport = "both",
    [string]$HttpHost = "127.0.0.1",
    [int]$HttpPort = 3000,
    [string]$HttpPath = "/mcp/local-filesystem",
    [string]$BearerToken = "",
    [string]$EnvFilePath = "",
    [int]$RateLimitWindowMs = 60000,
    [int]$RateLimitMaxRequests = 60,
    [bool]$EnableHttpRequestLogging = $true
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project root not found: $ProjectRoot"
}

if (-not (Test-Path -LiteralPath $BaseDir)) {
    New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null
}

$serverFile = Join-Path $ProjectRoot "server.js"
if (-not (Test-Path -LiteralPath $serverFile)) {
    throw "server.js not found at: $serverFile"
}

if (-not $EnvFilePath) {
    $EnvFilePath = Join-Path $ProjectRoot ".env\mcp.env"
}

if ((-not $BearerToken) -and (Test-Path -LiteralPath $EnvFilePath)) {
    foreach ($line in Get-Content -LiteralPath $EnvFilePath) {
        if ($line -match '^\s*MCP_BEARER_TOKEN\s*=\s*(.+?)\s*$') {
            $BearerToken = $Matches[1]
            break
        }
    }
}

Push-Location $ProjectRoot
try {
    $env:BASE_DIR = $BaseDir
    $env:MCP_TRANSPORT = $Transport
    $env:HTTP_HOST = $HttpHost
    $env:HTTP_PORT = "$HttpPort"
    $env:HTTP_PATH = $HttpPath
    $env:HTTP_RATE_LIMIT_WINDOW_MS = "$RateLimitWindowMs"
    $env:HTTP_RATE_LIMIT_MAX_REQUESTS = "$RateLimitMaxRequests"
    $env:HTTP_REQUEST_LOGGING = if ($EnableHttpRequestLogging) { "true" } else { "false" }
    if ($BearerToken) {
        $env:MCP_BEARER_TOKEN = $BearerToken
    }

    Write-Host "Starting MCP server..." -ForegroundColor Cyan
    Write-Host "ProjectRoot   : $ProjectRoot"
    Write-Host "BASE_DIR      : $BaseDir"
    Write-Host "MCP_TRANSPORT : $Transport"
    if ($Transport -eq "http" -or $Transport -eq "both") {
        Write-Host "HTTP endpoint : http://$HttpHost`:$HttpPort$HttpPath"
        Write-Host "Env file      : $EnvFilePath"
        Write-Host "Rate limit    : $RateLimitMaxRequests requests / $RateLimitWindowMs ms"
        if ($BearerToken) {
            Write-Host "Auth          : Bearer token enabled"
            Write-Host "MCP_BEARER_TOKEN: $BearerToken" -ForegroundColor Green
        }
        else {
            Write-Host "Auth          : No bearer token configured" -ForegroundColor Yellow
        }
    }

    & node $serverFile
}
finally {
    Pop-Location
}
