param(
    [string]$Uri = "http://127.0.0.1:3000/mcp/local-filesystem"
)

$ErrorActionPreference = "Stop"

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

    Write-Host "Sending MCP request to: $Uri" -ForegroundColor Cyan

    $response = Invoke-RestMethod -Uri $Uri -Method Post -Headers $headers -ContentType "application/json" -Body $body

    Write-Host "Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 20
}
catch {
    Write-Host "Request failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
finally {
    Write-Host ""
    Read-Host "Press Enter to close"
}
