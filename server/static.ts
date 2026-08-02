import express, { type Express } from "express";
import fs from "fs";
import path from "path";

const HTML_CACHE_CONTROL = "no-cache, no-store, must-revalidate";

function setHtmlCacheHeaders(res: express.Response) {
  res.set({
    "Cache-Control": HTML_CACHE_CONTROL,
    "Pragma": "no-cache",
    "Expires": "0",
  });
}

export function serveStatic(app: Express, publicPath = path.resolve(__dirname, "public")) {
  const distPath = publicPath;
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (path.extname(filePath).toLowerCase() === ".html") {
        setHtmlCacheHeaders(res);
      } else if (filePath.startsWith(path.join(distPath, "assets") + path.sep)) {
        // Vite fingerprints everything in /assets, so these URLs are safe to
        // retain across deployments while the HTML entrypoint is revalidated.
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));

  // fall through to index.html if the file doesn't exist
  // no-cache ensures browsers always fetch the latest HTML after a new deploy
  app.use("/{*path}", (_req, res) => {
    setHtmlCacheHeaders(res);
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
