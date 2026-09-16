import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("./dist/", import.meta.url)));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
};
const headers = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self' https://rpc.bohr.life; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
const server = createServer(async (req, res) => {
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (
    req.method === "GET" &&
    (pathname === "/healthz" || pathname === "/health")
  ) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    return res.end(
      JSON.stringify({
        ok: true,
        service: "cloak",
        revision: process.env.REVISION || "local",
        time: new Date().toISOString(),
      }),
    );
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    return res.end();
  }
  let target = resolve(root, `.${decodeURIComponent(pathname)}`);
  if (target !== root && !target.startsWith(root + sep)) {
    res.writeHead(400);
    return res.end("Bad path");
  }
  try {
    if ((await stat(target)).isDirectory())
      target = resolve(target, "index.html");
  } catch {
    if (extname(pathname)) {
      res.writeHead(404);
      return res.end("Not found");
    }
    target = resolve(root, "index.html");
  }
  try {
    const contents = await readFile(target);
    const immutableAsset = pathname.startsWith("/assets/");
    res.writeHead(200, {
      "content-type": mime[extname(target)] || "application/octet-stream",
      "cache-control":
        extname(target) === ".html"
          ? "no-cache"
          : immutableAsset
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600",
    });
    return res.end(req.method === "HEAD" ? undefined : contents);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
});
server.listen(Number(process.env.PORT || 4323), "0.0.0.0", () =>
  console.log(`Cloak serving on 0.0.0.0:${process.env.PORT || 4323}`),
);
