param(
    [string]$NgrokExe = "ngrok",
    [string]$LocalHost = "127.0.0.1",
    [int]$LocalPort = 3000,
    [string]$HttpPath = "/mcp/local-filesystem",
    [string]$Region = "",
    [int]$ApiPort = 4040
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command $NgrokExe -ErrorAction SilentlyContinue)) {
    throw "ngrok was not found in PATH. Install ngrok and ensure '$NgrokExe' is available."
}

$target = "http://$LocalHost`:$LocalPort"
$args = @("http", $target)
if ($Region) {
    $args = @("--region", $Region) + $args
}

Write-Host "Starting ngrok tunnel..." -ForegroundColor Cyan
Write-Host "Forward target : $target"
Write-Host "MCP path       : $HttpPath"

$ngrok = Start-Process -FilePath $NgrokExe -ArgumentList $args -PassThru -WindowStyle Hidden

try {
    $publicUrl = $null

    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $status = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$ApiPort/api/tunnels"
            $httpsTunnel = $status.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
            if ($httpsTunnel) {
                $publicUrl = $httpsTunnel.public_url
                break
            }
        }
        catch {
            # ngrok API may not be ready yet
        }
    }

    if (-not $publicUrl) {
        throw "Could not read tunnel URL from ngrok API at http://127.0.0.1:$ApiPort."
    }

    $externalMcpEndpoint = "$publicUrl$HttpPath"

    Write-Host ""
    Write-Host "Tunnel is live." -ForegroundColor Green
    Write-Host "Public base URL: $publicUrl" -ForegroundColor Green
    Write-Host "MCP endpoint   : $externalMcpEndpoint" -ForegroundColor Green
    Write-Host ""
    Write-Host "Remember to send Authorization: Bearer <token> if MCP_BEARER_TOKEN is enabled." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to stop ngrok tunnel"
}
finally {
    if ($ngrok -and -not $ngrok.HasExited) {
        Stop-Process -Id $ngrok.Id -Force
    }
}
