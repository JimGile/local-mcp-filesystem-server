# Local MCP Filesystem Server

A secure Model Context Protocol (MCP) server that provides sandboxed filesystem access to AI assistants and other MCP clients. This server restricts all file operations to a designated base directory, ensuring safe and controlled file system interactions.

## Features

- **Sandboxed Access**: All file operations are strictly contained within a configured base directory
- **Security-First Design**: Path traversal protection with normalized and resolved paths
- **Read/Write Operations**: Comprehensive file and directory manipulation
- **Multiple Transports**: Supports MCP over stdio, HTTP, or both simultaneously
- **Interactive Generator**: Web-based tool for easy server configuration and customization
- **MCP Standard Compliant**: Works with any MCP-compatible client

### Available Tools

- `read_file` - Read file contents (supports UTF-8 and base64 encoding)
- `write_file` - Write content to files with optional overwrite protection
- `list_directory` - List directory contents with type information
- `stat_file` - Get metadata for a file or directory
- `search_files` - Recursively search files by name
- `make_directory` - Create directories recursively
- `delete_file` - Delete files safely (refuses to delete directories)
- `rename_file` - Rename or move a file within the sandbox

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm

### Setup

1. Clone the repository:

```bash
git clone https://github.com/JimGile/local-mcp-filesystem-server.git
cd local-mcp-filesystem-server
```

1. Install dependencies:

```bash
npm install
```

1. Create your sandbox directory:

```bash
mkdir -p C:/mcp-sandbox/base
# Or on Unix-like systems:
# mkdir -p /path/to/your/sandbox
```

## Usage

### Running the Server

Set `BASE_DIR` and choose a transport mode with `MCP_TRANSPORT`.

> Default transport is `both` when `MCP_TRANSPORT` is not set.

#### stdio

**Windows (PowerShell):**

```powershell
$env:BASE_DIR="C:/mcp-sandbox/base"
$env:MCP_TRANSPORT="stdio"
node server.js
```

**Windows (Command Prompt):**

```cmd
set BASE_DIR=C:/mcp-sandbox/base
set MCP_TRANSPORT=stdio
node server.js
```

**Unix/Linux/macOS:**

```bash
BASE_DIR="/path/to/your/sandbox" MCP_TRANSPORT="stdio" node server.js
```

#### HTTP transport

```bash
BASE_DIR="/path/to/your/sandbox" MCP_TRANSPORT="http" HTTP_HOST="127.0.0.1" HTTP_PORT="3000" HTTP_PATH="/mcp/local-filesystem" node server.js
```

HTTP with bearer token enabled:

```bash
BASE_DIR="/path/to/your/sandbox" MCP_TRANSPORT="http" HTTP_HOST="127.0.0.1" HTTP_PORT="3000" HTTP_PATH="/mcp/local-filesystem" MCP_BEARER_TOKEN="replace-with-strong-token" node server.js
```

Default HTTP endpoint:

```text
http://127.0.0.1:3000/mcp/local-filesystem
```

#### Both transports at once (default)

```bash
BASE_DIR="/path/to/your/sandbox" MCP_TRANSPORT="both" HTTP_HOST="127.0.0.1" HTTP_PORT="3000" HTTP_PATH="/mcp/local-filesystem" node server.js
```

### Expose HTTP endpoint with tunneling (ngrok or Cloudflare)

Use these options for temporary/ad-hoc external access.

#### Option A: ngrok (free tier)

1. Install ngrok and sign in.

1. Configure your ngrok authtoken once:

```bash
ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>
```

1. Start this MCP server in HTTP mode (or `both`) on localhost:

```powershell
$env:BASE_DIR="C:/mcp-sandbox/base"
$env:MCP_TRANSPORT="http"
$env:HTTP_HOST="127.0.0.1"
$env:HTTP_PORT="3000"
$env:HTTP_PATH="/mcp/local-filesystem"
node server.js
```

1. In another terminal, start the ngrok tunnel script:

```powershell
.\Start-NgrokTunnel.ps1 -LocalHost "127.0.0.1" -LocalPort 3000 -HttpPath "/mcp/local-filesystem"
```

1. Copy the printed `MCP endpoint` URL into your MCP client.

Example endpoint:

```text
https://<random-subdomain>.ngrok-free.app/mcp/local-filesystem
```

#### Option B: Cloudflare Tunnel (quick tunnel)

1. Install `cloudflared`.

1. Start this MCP server in HTTP mode (or `both`) on localhost:

```powershell
$env:BASE_DIR="C:/mcp-sandbox/base"
$env:MCP_TRANSPORT="http"
$env:HTTP_HOST="127.0.0.1"
$env:HTTP_PORT="3000"
$env:HTTP_PATH="/mcp/local-filesystem"
node server.js
```

1. In another terminal, run a quick Cloudflare tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

1. Copy the generated public URL from terminal output and append your MCP path.

Example:

```text
Public URL from cloudflared: https://<random-subdomain>.trycloudflare.com
MCP endpoint to use:         https://<random-subdomain>.trycloudflare.com/mcp/local-filesystem
```

Notes for both options:

- Public URLs may change between sessions.
- Keep `MCP_BEARER_TOKEN` enabled whenever exposing the endpoint.
- Clients must send `Authorization: Bearer <token>` if bearer auth is enabled.
- MCP requests must use `POST` to the configured `HTTP_PATH`.

### Using with Claude Desktop or Other MCP Clients

Add the server to your MCP client configuration. For Claude Desktop, edit your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "local-filesystem": {
      "command": "node",
      "args": ["C:/Data/Projects/local-mcp-filesystem-server/server.js"],
      "env": {
        "BASE_DIR": "C:/mcp-sandbox/base",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

## Interactive Generator

The `generator` folder contains a web-based interactive tool that helps you customize the server configuration without manually editing code.

### Using the Generator

1. Open `generator/index.html` in your web browser:

```bash
# Windows
start generator/index.html

# macOS
open generator/index.html

# Linux
xdg-open generator/index.html
```

1. Configure your settings:
   - Set your desired base directory
   - Choose which tools to enable/disable
   - Customize security settings
   - Set server name and version

2. Generate your custom `server.js` file

3. The generator will create a ready-to-use server configuration tailored to your needs

### Benefits of the Generator

- **No Code Editing Required**: Visual interface for all configuration options
- **Validation**: Ensures your configuration is valid before generating
- **Quick Customization**: Easily enable/disable specific filesystem operations
- **Documentation**: In-app explanations for each setting

## Security

### Sandbox Enforcement

All operations are restricted to the configured `BASE_DIR`:

- **Path Normalization**: All paths are normalized and resolved before access
- **Parent Traversal Protection**: Attempts to access outside the base directory are rejected
- **Symlink Checking**: Symlink targets are verified when possible
- **Real Path Resolution**: Uses `fs.realpath()` to resolve actual filesystem paths

### HTTP Security Controls

- **Bearer Token Auth**: Set `MCP_BEARER_TOKEN` to require `Authorization: Bearer <token>`
- **Rate Limiting**: Configurable request limits per client IP
- **Request Logging**: HTTP requests include method/path/status/duration/ip logs

### Security Model

```text
BASE_DIR = C:/mcp-sandbox/base

✅ Allowed:
  - C:/mcp-sandbox/base/file.txt
  - C:/mcp-sandbox/base/subfolder/doc.md

❌ Rejected:
  - C:/mcp-sandbox/base/../other/file.txt
  - C:/outside-folder/file.txt
  - Symlinks pointing outside BASE_DIR
```

## Examples

### Reading a File

Request:

```json
{
  "tool": "read_file",
  "arguments": {
    "path": "config.json"
  }
}
```

Response:

```json
{
  "ok": true,
  "path": "config.json",
  "content": "{ \"setting\": \"value\" }"
}
```

### Writing a File

Request:

```json
{
  "tool": "write_file",
  "arguments": {
    "path": "data/output.txt",
    "content": "Hello, World!",
    "overwrite": true
  }
}
```

Response:

```json
{
  "ok": true,
  "path": "data/output.txt",
  "bytesWritten": 13
}
```

### Listing a Directory

Request:

```json
{
  "tool": "list_directory",
  "arguments": {
    "path": "."
  }
}
```

Response:

```json
{
  "ok": true,
  "path": ".",
  "entries": [
    { "name": "config.json", "type": "file" },
    { "name": "data", "type": "directory" }
  ]
}
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
| --- | --- | --- | --- |
| `BASE_DIR` | Base directory for sandboxed operations | `C:/mcp-sandbox/base` | Yes |
| `MCP_TRANSPORT` | Transport mode: `stdio`, `http`, or `both` | `both` | No |
| `HTTP_HOST` | HTTP bind host when HTTP is enabled | `127.0.0.1` | No |
| `HTTP_PORT` | HTTP port when HTTP is enabled | `3000` | No |
| `HTTP_PATH` | MCP HTTP route path | `/mcp/local-filesystem` | No |
| `MCP_BEARER_TOKEN` | Required bearer token for HTTP requests (when set) | _empty_ | No |
| `HTTP_RATE_LIMIT_WINDOW_MS` | HTTP rate limit window in milliseconds | `60000` | No |
| `HTTP_RATE_LIMIT_MAX_REQUESTS` | Max HTTP requests per client per window | `60` | No |
| `HTTP_REQUEST_LOGGING` | Enable HTTP request logging (`true`/`false`) | `true` | No |

### Server Constants

Edit `server.js` to customize:

```javascript
const SERVER_NAME = "local-mcp-filesystem-server";
const SERVER_VERSION = "1.0.0";
```

## Development

### Project Structure

```text
local-mcp-filesystem-server/
├── server.js              # Main MCP server implementation
├── Start-LocalMcpFilesystemServer.ps1   # Local server launcher
├── Start-NgrokTunnel.ps1   # Temporary ngrok tunnel launcher
├── package.json           # Project dependencies and metadata
├── README.md              # This file
└── generator/             # Interactive generator tool
    ├── index.html         # Generator UI
    └── assets/            # Generator resources
        ├── script_*.js    # JavaScript modules
        └── style_*.css    # Stylesheets
```

### Running in Development

```bash
npm start
```

### Testing

Test the server with manual tool calls or integrate with an MCP client like Claude Desktop.

Validate generated output regression checks:

```bash
npm run validate:generated
```

## Troubleshooting

### Common Issues

#### Error: "Base directory does not exist"

- Ensure the `BASE_DIR` path exists and is accessible
- Create the directory: `mkdir -p /path/to/base`

#### Error: "Access denied: path resolves outside the allowed base directory"

- The requested path attempts to escape the sandbox
- Check for `..` path segments or absolute paths outside `BASE_DIR`

#### Server not connecting to MCP client

- Verify the client configuration points to the correct `server.js` path
- Check that Node.js is in your PATH
- Ensure dependencies are installed (`npm install`)

#### HTTP endpoint not reachable

- Confirm `MCP_TRANSPORT` is set to `http` or `both`
- Check host/port/path values: `HTTP_HOST`, `HTTP_PORT`, `HTTP_PATH`
- Verify no firewall or port conflict is blocking access

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

ISC

## Links

- **Repository**: <https://github.com/JimGile/local-mcp-filesystem-server>
- **Issues**: <https://github.com/JimGile/local-mcp-filesystem-server/issues>
- **MCP Protocol**: <https://modelcontextprotocol.io>

## Credits

Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
