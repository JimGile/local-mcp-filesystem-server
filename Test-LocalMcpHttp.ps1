param(
    [string]$Uri = "http://127.0.0.1:3000/mcp/local-filesystem",
    [string]$IPv4Uri = "http://192.168.2.5:3000/mcp/local-filesystem",
    [string]$BearerToken = ""
)

$ErrorActionPreference = "Stop"

function Test-McpEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TargetUri,
        [Parameter(Mandatory = $true)]
        [string]$Label,
        [Parameter(Mandatory = $true)]
        [string]$Body,
        [Parameter(Mandatory = $true)]
        [hashtable]$Headers
    )

    try {
        Write-Host "Sending MCP request to [$Label]: $TargetUri" -ForegroundColor Cyan

        $response = Invoke-RestMethod -Uri $TargetUri -Method Post -Headers $Headers -ContentType "application/json" -Body $Body

        Write-Host "[$Label] Response:" -ForegroundColor Green
        $response | ConvertTo-Json -Depth 20
        Write-Host ""
    }
    catch {
        Write-Host "[$Label] Request failed:" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        Write-Host ""
    }
}

try {
    $body = @{
        jsonrpc = "2.0"
        id      = 1
        method  = "tools/list"
        params  = @{}
    } | ConvertTo-Json -Depth 10

    $headers = @{
        Accept = "application/json, text/event-stream"
    }

    if ($BearerToken) {
        $headers.Authorization = "Bearer $BearerToken"
    }

    Test-McpEndpoint -TargetUri $Uri -Label "Loopback" -Body $body -Headers $headers
    Test-McpEndpoint -TargetUri $IPv4Uri -Label "IPv4" -Body $body -Headers $headers
}
finally {
    Write-Host ""
    Read-Host "Press Enter to close"
}
