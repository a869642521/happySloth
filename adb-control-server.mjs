import { execFile } from "node:child_process";
import { createServer } from "node:http";

const port = Number(process.env.PORT || 4174);
const adbPath = process.env.ADB || "adb";
const deviceId = process.env.ADB_DEVICE || "";
const dryRun = process.env.DRY_RUN === "1";
const fallbackSize = parseSize(process.env.DEVICE_SIZE || "");
let cachedSize = fallbackSize;

createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      await getScreenSize();
      sendJson(response, 200, { ok: true, deviceSize: cachedSize });
      return;
    }

    if (request.method === "POST" && url.pathname === "/tap") {
      const payload = await readJson(request);
      const point = await toDevicePoint(payload);
      await runAdb(["shell", "input", "tap", String(point.x), String(point.y)]);
      sendJson(response, 200, { ok: true, action: "tap", point });
      return;
    }

    if (request.method === "POST" && url.pathname === "/swipe") {
      const payload = await readJson(request);
      const from = await toDevicePoint(payload.from);
      const to = await toDevicePoint(payload.to);
      const durationMs = clampNumber(payload.durationMs, 80, 1200, 240);
      await runAdb([
        "shell",
        "input",
        "swipe",
        String(from.x),
        String(from.y),
        String(to.x),
        String(to.y),
        String(durationMs)
      ]);
      sendJson(response, 200, { ok: true, action: "swipe", from, to, durationMs });
      return;
    }

    sendJson(response, 404, {
      ok: false,
      message: "Use POST /tap, POST /swipe, or GET /health."
    });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message });
  }
}).listen(port, () => {
  console.log(`ADB control server running at http://localhost:${port}`);
  if (dryRun) console.log("DRY_RUN=1 is enabled; commands will be logged but not sent to a device.");
  console.log("Set ADB_DEVICE=<serial> if you have more than one Android device.");
});

async function toDevicePoint(point = {}) {
  const size = await getScreenSize();
  return {
    x: Math.round(clampNumber(point.x, 0, 1, 0) * size.width),
    y: Math.round(clampNumber(point.y, 0, 1, 0) * size.height)
  };
}

async function getScreenSize() {
  if (cachedSize) return cachedSize;

  const output = await runAdb(["shell", "wm", "size"]);
  const size = parseSize(output);
  if (!size) {
    throw new Error("Cannot read Android screen size. Set DEVICE_SIZE=1080x2400 as a fallback.");
  }

  cachedSize = size;
  return cachedSize;
}

function parseSize(value) {
  const match = String(value || "").match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return null;
  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

function runAdb(args) {
  const finalArgs = deviceId ? ["-s", deviceId, ...args] : args;

  if (dryRun) {
    const command = `${adbPath} ${finalArgs.join(" ")}`;
    console.log(`[dry-run] ${command}`);
    if (args.join(" ") === "shell wm size") {
      const size = fallbackSize || { width: 1080, height: 2400 };
      return Promise.resolve(`Physical size: ${size.width}x${size.height}`);
    }
    return Promise.resolve("");
  }

  return new Promise((resolve, reject) => {
    execFile(adbPath, finalArgs, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message).trim()));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy(new Error("Request body is too large."));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function setCorsHeaders(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
