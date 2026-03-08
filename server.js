#!/usr/bin/env node
/**
 * local-mcp-filesystem-server
 *
 * Secure MCP filesystem server restricted to:
 * C:/mcp-sandbox/base
 *
 * Setup:
 *   npm init -y
 *   npm install @modelcontextprotocol/sdk zod
 *
 * Run:
 *   BASE_DIR="C:/mcp-sandbox/base" node server.js
 *
 * Security model:
 *   - All paths must stay inside BASE_DIR
 *   - Paths are normalized and resolved before access
 *   - Parent traversal outside the base directory is rejected
 *   - Symlink targets are checked when possible
 *
 * AI note:
 *   Implement sandboxed base-folder enforcement for MCP filesystem server to ensure secure access and operations.
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { existsSync } = require("node:fs");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { createMcpExpressApp } = require("@modelcontextprotocol/sdk/server/express.js");
const { z } = require("zod");

const SERVER_NAME = "local-mcp-filesystem-server";
const SERVER_VERSION = "1.0.0";
const BASE_DIR_INPUT = process.env.BASE_DIR || "C:/mcp-sandbox/base";
const MCP_TRANSPORT = (process.env.MCP_TRANSPORT || "both").toLowerCase();
const HTTP_HOST = process.env.HTTP_HOST || "127.0.0.1";
const HTTP_PORT = Number.parseInt(process.env.HTTP_PORT || "3000", 10);
const HTTP_PATH = process.env.HTTP_PATH || "/mcp";

function assertValidBaseDir(baseDirInput) {
  if (!baseDirInput || typeof baseDirInput !== "string") {
    throw new Error("BASE_DIR must be a non-empty string");
  }
  const resolved = path.resolve(baseDirInput);
  return resolved;
}

const BASE_DIR = assertValidBaseDir(BASE_DIR_INPUT);

function isSubPath(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function realpathSafe(targetPath) {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function getEntryType(entry) {
  if (entry.isDirectory()) {
    return "directory";
  }
  if (entry.isFile()) {
    return "file";
  }
  return "other";
}

async function ensureBaseDirExists() {
  if (!existsSync(BASE_DIR)) {
    throw new Error(`Base directory does not exist: ${BASE_DIR}`);
  }
  const stat = await fs.stat(BASE_DIR);
  if (!stat.isDirectory()) {
    throw new Error(`Base path is not a directory: ${BASE_DIR}`);
  }
}

async function resolveInsideBase(userPath) {
  if (!userPath || typeof userPath !== "string") {
    throw new Error("Path must be a non-empty string");
  }

  const normalizedInput = userPath.replaceAll("\\", "/");
  const joinedPath = path.resolve(BASE_DIR, normalizedInput);
  const realBase = await realpathSafe(BASE_DIR);
  const realCandidate = await realpathSafe(joinedPath);

  if (!isSubPath(realBase, realCandidate)) {
    throw new Error("Access denied: path resolves outside the allowed base directory");
  }

  return realCandidate;
}

async function resolveInsideBaseForWrite(userPath) {
  if (!userPath || typeof userPath !== "string") {
    throw new Error("Path must be a non-empty string");
  }

  const normalizedInput = userPath.replaceAll('\\', "/");
  const joinedPath = path.resolve(BASE_DIR, normalizedInput);
  const realBase = await realpathSafe(BASE_DIR);

  const parentDir = path.dirname(joinedPath);
  const realParent = await realpathSafe(parentDir);

  if (!isSubPath(realBase, realParent)) {
    throw new Error("Access denied: write target resolves outside the allowed base directory");
  }

  if (!isSubPath(realBase, path.resolve(joinedPath))) {
    throw new Error("Access denied: invalid write path");
  }

  return path.resolve(joinedPath);
}

function handleToolError(toolName, error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: false, tool: toolName, error: message }, null, 2) }],
    isError: true
  };
}

function registerTools(server) {
  server.registerTool(
    "read_file",
    {
      description: "Read the contents of a file",
      inputSchema: z.object({
        path: z.string().min(1),
        encoding: z.enum(["utf8", "base64"]).optional()
      })
    },
    async ({ path: userPath, encoding }) => {
      try {
        const targetPath = await resolveInsideBase(userPath);
        const content = await fs.readFile(targetPath, encoding === "base64" ? undefined : "utf8");
        const result = encoding === "base64"
          ? Buffer.from(content).toString("base64")
          : content;
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, path: userPath, content: result }, null, 2) }]
        };
      } catch (error) {
        return handleToolError("read_file", error);
      }
    }
  );

  server.registerTool(
    "write_file",
    {
      description: "Write content to a file",
      inputSchema: z.object({
        path: z.string().min(1),
        content: z.string(),
        overwrite: z.boolean().optional()
      })
    },
    async ({ path: userPath, content, overwrite }) => {
      try {
        const targetPath = await resolveInsideBaseForWrite(userPath);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });

        if (!overwrite) {
          try {
            await fs.access(targetPath);
            throw new Error("Target file already exists and overwrite=false");
          } catch (error) {
            if (error?.message === "Target file already exists and overwrite=false") {
              throw error;
            }
          }
        }

        await fs.writeFile(targetPath, content, "utf8");
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, path: userPath, bytesWritten: Buffer.byteLength(content, "utf8") }, null, 2) }]
        };
      } catch (error) {
        return handleToolError("write_file", error);
      }
    }
  );

  server.registerTool(
    "list_directory",
    {
      description: "List the contents of a directory",
      inputSchema: z.object({
        path: z.string().optional()
      })
    },
    async ({ path: userPath }) => {
      try {
        const targetPath = await resolveInsideBase(userPath || ".");
        const entries = await fs.readdir(targetPath, { withFileTypes: true });
        const result = entries.map((entry) => ({
          name: entry.name,
          type: getEntryType(entry)
        }));
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, path: userPath || ".", entries: result }, null, 2) }]
        };
      } catch (error) {
        return handleToolError("list_directory", error);
      }
    }
  );

  server.registerTool(
    "make_directory",
    {
      description: "Create a new directory",
      inputSchema: z.object({
        path: z.string().min(1)
      })
    },
    async ({ path: userPath }) => {
      try {
        const targetPath = await resolveInsideBaseForWrite(userPath);
        await fs.mkdir(targetPath, { recursive: true });
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, directory: userPath }, null, 2) }]
        };
      } catch (error) {
        return handleToolError("make_directory", error);
      }
    }
  );

  server.registerTool(
    "delete_file",
    {
      description: "Delete a file",
      inputSchema: z.object({
        path: z.string().min(1)
      })
    },
    async ({ path: userPath }) => {
      try {
        const targetPath = await resolveInsideBase(userPath);
        const stat = await fs.stat(targetPath);
        if (stat.isDirectory()) {
          throw new Error("Refusing to delete a directory with delete_file");
        }
        await fs.unlink(targetPath);
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, deleted: userPath }, null, 2) }]
        };
      } catch (error) {
        return handleToolError("delete_file", error);
      }
    }
  );
}

function createServer() {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });
  registerTools(server);
  return server;
}

function getTransportMode() {
  if (MCP_TRANSPORT !== "stdio" && MCP_TRANSPORT !== "http" && MCP_TRANSPORT !== "both") {
    throw new Error('MCP_TRANSPORT must be one of: "stdio", "http", "both"');
  }
  return MCP_TRANSPORT;
}

async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP stdio transport connected");
  return server;
}

async function startHttpServer() {
  if (!Number.isInteger(HTTP_PORT) || HTTP_PORT < 1 || HTTP_PORT > 65535) {
    throw new Error("HTTP_PORT must be a valid port number (1-65535)");
  }

  const app = createMcpExpressApp();

  app.post(HTTP_PATH, async (req, res) => {
    const requestServer = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    try {
      await requestServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`HTTP MCP request failed: ${message}`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    } finally {
      res.on("close", async () => {
        try {
          await transport.close();
          await requestServer.close();
        } catch {
          // no-op on shutdown cleanup
        }
      });
    }
  });

  app.get(HTTP_PATH, (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Use POST for MCP requests."
      },
      id: null
    });
  });

  app.delete(HTTP_PATH, (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    });
  });

  return new Promise((resolve, reject) => {
    const listener = app.listen(HTTP_PORT, HTTP_HOST, () => {
      console.error(`MCP HTTP transport listening at http://${HTTP_HOST}:${HTTP_PORT}${HTTP_PATH}`);
      resolve(listener);
    });
    listener.on("error", reject);
  });
}

async function main() {
  await ensureBaseDirExists();
  const mode = getTransportMode();

  if (mode === "stdio" || mode === "both") {
    await startStdioServer();
  }

  if (mode === "http" || mode === "both") {
    await startHttpServer();
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
});
