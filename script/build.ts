import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { execFileSync } from "node:child_process";

function gitValue(args: string[]) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  const commitSha = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || gitValue(["rev-parse", "HEAD"]);
  const branch = process.env.RAILWAY_GIT_BRANCH || process.env.GIT_BRANCH || gitValue(["rev-parse", "--abbrev-ref", "HEAD"]);
  const buildTimestamp = process.env.BUILD_TIMESTAMP || new Date().toISOString();
  const buildEnvironment = process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || "production";
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.BUILD_COMMIT_SHA": JSON.stringify(commitSha),
      "process.env.BUILD_BRANCH": JSON.stringify(branch),
      "process.env.BUILD_TIMESTAMP": JSON.stringify(buildTimestamp),
      "process.env.BUILD_ENVIRONMENT": JSON.stringify(buildEnvironment),
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
