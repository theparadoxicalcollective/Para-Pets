import type { Express } from "express";

export interface BuildInfo {
  shortCommitSha: string;
  fullCommitSha: string;
  buildTimestamp: string;
  environment: string;
  branch: string;
}

const safeValue = (value: string | undefined) => value?.trim() || "unknown";

/** Returns an intentionally small allowlist of deployment metadata. */
export function getBuildInfo(env: NodeJS.ProcessEnv = process.env): BuildInfo {
  const fullCommitSha = safeValue(env.BUILD_COMMIT_SHA || env.RAILWAY_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA);
  return {
    shortCommitSha: fullCommitSha === "unknown" ? "unknown" : fullCommitSha.slice(0, 7),
    fullCommitSha,
    buildTimestamp: safeValue(env.BUILD_TIMESTAMP || env.RAILWAY_DEPLOYMENT_CREATED_AT),
    environment: safeValue(env.BUILD_ENVIRONMENT || env.RAILWAY_ENVIRONMENT_NAME || env.NODE_ENV),
    branch: safeValue(env.BUILD_BRANCH || env.RAILWAY_GIT_BRANCH || env.GIT_BRANCH),
  };
}

export function registerBuildInfoRoute(app: Express) {
  app.get("/api/build-info", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(getBuildInfo());
  });
}
