// ──────────────────────────────────────────────
// Updates: Check for new versions and apply updates
// ──────────────────────────────────────────────
import type { FastifyInstance } from "fastify";
import { APP_VERSION } from "@marinara-engine/shared";
import { execFile } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import { promisify } from "util";
import { getMonorepoRoot } from "../config/runtime-config.js";
import { getBuildCommit, getBuildLabel } from "../config/build-info.js";

const execFileAsync = promisify(execFile);

const GITHUB_REPO = "SpicyMarinara/Marinara-Engine";
const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;
const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_REPO}`;
const GITHUB_TAGS_API = `${GITHUB_API_BASE}/git/matching-refs/tags/v`;
const GITHUB_RELEASE_BY_TAG_API = (tag: string) => `${GITHUB_API_BASE}/releases/tags/${tag}`;

// ── Cached release info (15-min TTL) ──
let cachedRelease: {
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
} | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60_000;

/** Detect whether this install is a git repo. */
function isGitInstall(): boolean {
  const monorepoRoot = getMonorepoRoot();
  return existsSync(resolve(monorepoRoot, ".git"));
}

/** Compare semver strings. Returns true if b > a. */
function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const a = parse(current);
  const b = parse(latest);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (bv > av) return true;
    if (bv < av) return false;
  }
  return false;
}

function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const left = parse(a);
  const right = parse(b);

  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const lv = left[i] ?? 0;
    const rv = right[i] ?? 0;
    if (lv > rv) return 1;
    if (lv < rv) return -1;
  }

  return 0;
}

function normalizeTag(tag: string) {
  return tag.replace(/^v/, "");
}

function isStableVersionTag(tag: string) {
  return /^v\d+\.\d+\.\d+$/.test(tag.trim());
}

function buildFallbackRelease(tag: string) {
  return {
    latestVersion: normalizeTag(tag),
    releaseUrl: `${GITHUB_REPO_URL}/releases/tag/${tag}`,
    releaseNotes: "",
    publishedAt: "",
  };
}

function buildRequestHeaders() {
  return {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": `MarinaraEngine/${APP_VERSION}`,
  };
}

async function resolveLatestReleaseFromGitHub(signal: AbortSignal) {
  const tagsRes = await fetch(GITHUB_TAGS_API, {
    headers: buildRequestHeaders(),
    signal,
  });

  if (!tagsRes.ok) {
    throw new Error(`GitHub tags API returned ${tagsRes.status}`);
  }

  const tagRefs = (await tagsRes.json()) as Array<{ ref?: string }>;
  const latestTag = tagRefs
    .map((entry) => entry.ref?.split("/").pop()?.trim() ?? "")
    .filter(isStableVersionTag)
    .sort(compareVersions)
    .at(-1);

  if (!latestTag) {
    throw new Error("No stable vX.Y.Z tags were found on GitHub");
  }

  const releaseRes = await fetch(GITHUB_RELEASE_BY_TAG_API(latestTag), {
    headers: buildRequestHeaders(),
    signal,
  });

  if (!releaseRes.ok) {
    return buildFallbackRelease(latestTag);
  }

  const release = (await releaseRes.json()) as {
    html_url?: string;
    body?: string;
    published_at?: string;
  };

  return {
    latestVersion: normalizeTag(latestTag),
    releaseUrl: release.html_url ?? `${GITHUB_REPO_URL}/releases/tag/${latestTag}`,
    releaseNotes: release.body ?? "",
    publishedAt: release.published_at ?? "",
  };
}

export async function updatesRoutes(app: FastifyInstance) {
  // ── Check for updates ──
  // GET /api/updates/check
  // Fetches the newest stable Git tag from GitHub, then hydrates it
  // with matching release metadata when that release exists.
  app.get("/check", async (_req, reply) => {
    const now = Date.now();
    const currentCommit = getBuildCommit();
    const currentBuild = getBuildLabel();

    // Return cached if fresh
    if (cachedRelease && now - cacheTimestamp < CACHE_TTL_MS) {
      return {
        currentVersion: APP_VERSION,
        currentCommit,
        currentBuild,
        ...cachedRelease,
        updateAvailable: isNewerVersion(APP_VERSION, cachedRelease.latestVersion),
        installType: isGitInstall() ? "git" : "standalone",
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        cachedRelease = await resolveLatestReleaseFromGitHub(controller.signal);
      } finally {
        clearTimeout(timeout);
      }
      cacheTimestamp = now;

      return {
        currentVersion: APP_VERSION,
        currentCommit,
        currentBuild,
        ...cachedRelease,
        updateAvailable: isNewerVersion(APP_VERSION, cachedRelease.latestVersion),
        installType: isGitInstall() ? "git" : "standalone",
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({
        error: `Failed to check for updates: ${message}`,
        currentVersion: APP_VERSION,
        currentCommit,
        currentBuild,
        updateAvailable: false,
      });
    }
  });

  // ── Apply update (git installs only) ──
  // POST /api/updates/apply
  // Runs git pull, pnpm install, rebuild, then signals the process to restart.
  app.post("/apply", async (_req, reply) => {
    if (!isGitInstall()) {
      return reply.status(400).send({
        error:
          "Auto-update is only available for git-based installs. For Docker, run: docker compose pull && docker compose up -d",
        installType: "standalone",
      });
    }

    const root = getMonorepoRoot();

    try {
      // Step 1: git pull
      const { stdout: pullOut } = await execFileAsync("git", ["pull"], {
        cwd: root,
        timeout: 60_000,
      });

      const alreadyUpToDate = pullOut.includes("Already up to date");

      // Even if git says "already up to date", the dist might be stale
      // (e.g. a previous update pulled code but failed to build).
      // Compare package.json version with the running APP_VERSION.
      if (alreadyUpToDate) {
        const { readFileSync } = await import("fs");
        try {
          const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
          const sourceVersion = pkg.version as string;
          if (sourceVersion === APP_VERSION) {
            return { status: "already_up_to_date", message: "Already on the latest version." };
          }
          // Source has a newer version than running dist — need to rebuild
        } catch {
          return { status: "already_up_to_date", message: "Already on the latest version." };
        }
      }

      // Step 2: pnpm install
      // shell: true is required on Windows where pnpm is a .cmd file
      await execFileAsync("pnpm", ["install", "--frozen-lockfile"], {
        cwd: root,
        timeout: 120_000,
        shell: true,
      });

      // Step 3: Rebuild all packages
      await execFileAsync("pnpm", ["build"], {
        cwd: root,
        timeout: 300_000,
        shell: true,
      });

      // Step 4: Signal exit so the user can relaunch with the new version.
      // Send response first, then schedule exit.
      const result = {
        status: "updated",
        message: "Update applied successfully. Please relaunch the app to use the new version.",
      };

      // Give Fastify time to flush the response, then exit
      setTimeout(() => {
        console.log("[Update] Shutting down after update...");
        process.exit(0);
      }, 500);

      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        error: `Update failed: ${message}`,
        hint: "You can try running the update manually: git pull && pnpm install && pnpm build",
      });
    }
  });
}
