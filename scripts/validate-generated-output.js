#!/usr/bin/env node

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const http = require("node:http");
const { spawn } = require("node:child_process");

const GENERATED_SERVER_PATH = path.resolve(__dirname, "..", "generator-output", "server.generated.js");
const PRIMARY_SERVER_PATH = path.resolve(__dirname, "..", "server.js");

function resolveServerPath() {
  if (fs.existsSync(GENERATED_SERVER_PATH)) {
    return GENERATED_SERVER_PATH;
  }

  if (fs.existsSync(PRIMARY_SERVER_PATH)) {
    console.warn(
      `Generated server file not found at ${GENERATED_SERVER_PATH}. ` +
      `Falling back to ${PRIMARY_SERVER_PATH} for CI validation.`
    );
    return PRIMARY_SERVER_PATH;
  }

  throw new Error(
    `Missing both generated and primary server files:\n` +
    `- ${GENERATED_SERVER_PATH}\n` +
    `- ${PRIMARY_SERVER_PATH}`
  );
}

function runNodeCheck(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", filePath], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Syntax check failed for ${filePath}\n${stderr}`));
    });
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(err => {
        if (err) {
          reject(err);
          return;
        }
        if (!port) {
          reject(new Error("Could not determine free port"));
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForPattern(state, pattern, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (pattern.test(state.logs)) {
        clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for pattern ${pattern} in logs:\n${state.logs}`));
      }
    }, 50);
  });
}

function startServer(serverPath, env) {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const state = {
    child,
    logs: "",
    exited: false,
    exitCode: null
  };

  const append = chunk => {
    state.logs += chunk.toString();
  };

  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("exit", code => {
    state.exited = true;
    state.exitCode = code;
  });

  return state;
}

async function stopServer(state) {
  if (!state?.child || state.exited) {
    return;
  }

  state.child.kill("SIGTERM");
  await wait(300);

  if (!state.exited) {
    state.child.kill("SIGKILL");
    await wait(200);
  }
}

function httpGetStatus(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: "GET" }, res => {
      resolve(res.statusCode || 0);
      res.resume();
    });
    req.on("error", reject);
    req.end();
  });
}

async function validateStdioMode(serverPath, baseDir) {
  const state = startServer(serverPath, {
    BASE_DIR: baseDir,
    MCP_TRANSPORT: "stdio"
  });

  try {
    await waitForPattern(state, /MCP stdio transport connected/, 3000);
    if (state.exited && state.exitCode && state.exitCode !== 0) {
      throw new Error(`Generated server exited unexpectedly in stdio mode.\nLogs:\n${state.logs}`);
    }
  } finally {
    await stopServer(state);
  }
}

async function validateHttpMode(serverPath, baseDir, mode) {
  const port = await getFreePort();
  const state = startServer(serverPath, {
    BASE_DIR: baseDir,
    MCP_TRANSPORT: mode,
    HTTP_HOST: "127.0.0.1",
    HTTP_PORT: String(port),
    HTTP_PATH: "/mcp"
  });

  try {
    await waitForPattern(state, /MCP HTTP transport listening at http:\/\/127\.0\.0\.1:\d+\/mcp/, 4000);

    if (mode === "both") {
      await waitForPattern(state, /MCP stdio transport connected/, 2000);
    }

    const status = await httpGetStatus(`http://127.0.0.1:${port}/mcp`);
    if (status !== 405) {
      throw new Error(`Expected HTTP GET /mcp to return 405, received ${status}`);
    }

    if (state.exited) {
      throw new Error(`Generated server exited unexpectedly in ${mode} mode.\nLogs:\n${state.logs}`);
    }
  } finally {
    await stopServer(state);
  }
}

async function main() {
  const serverPath = resolveServerPath();

  await runNodeCheck(serverPath);

  const baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), "mcp-generated-sandbox-"));

  try {
    await validateStdioMode(serverPath, baseDir);
    await validateHttpMode(serverPath, baseDir, "http");
    await validateHttpMode(serverPath, baseDir, "both");
    console.log(`Server validation passed for ${serverPath}.`);
  } finally {
    await fsp.rm(baseDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
});
