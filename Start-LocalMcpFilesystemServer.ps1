param(
    [string]$ProjectRoot = "C:\Data\Projects\local-mcp-filesystem-server",
    [string]$BaseDir = "C:\mcp-sandbox\base",
    [ValidateSet("stdio", "http", "both")]
    [string]$Transport = "both",
    [string]$HttpHost = "127.0.0.1",
    [int]$HttpPort = 3000,
    [string]$HttpPath = "/mcp/local-filesystem"
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

Push-Location $ProjectRoot
try {
    $env:BASE_DIR = $BaseDir
    $env:MCP_TRANSPORT = $Transport
    $env:HTTP_HOST = $HttpHost
    $env:HTTP_PORT = "$HttpPort"
    $env:HTTP_PATH = $HttpPath

    Write-Host "Starting MCP server..." -ForegroundColor Cyan
    Write-Host "ProjectRoot   : $ProjectRoot"
    Write-Host "BASE_DIR      : $BaseDir"
    Write-Host "MCP_TRANSPORT : $Transport"
    if ($Transport -eq "http" -or $Transport -eq "both") {
        Write-Host "HTTP endpoint : http://$HttpHost`:$HttpPort$HttpPath"
    }

    & node $serverFile
}
finally {
    Pop-Location
}
