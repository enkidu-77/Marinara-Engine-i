import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_VERSION } from "@marinara-engine/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_ROOT = resolve(__dirname, "../..");
const MONOREPO_ROOT = resolve(SERVER_ROOT, "../..");
const COMMIT_LENGTH = 12;

let cachedCommit: string | null | undefined;

function normalizeCommit(value: string | undefined | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, COMMIT_LENGTH);
}

export function getBuildCommit() {
  if (cachedCommit !== undefined) return cachedCommit;

  const envCommit = normalizeCommit(process.env.MARINARA_GIT_COMMIT ?? process.env.GITHUB_SHA);
  if (envCommit) {
    cachedCommit = envCommit;
    return cachedCommit;
  }

  if (!existsSync(resolve(MONOREPO_ROOT, ".git"))) {
    cachedCommit = null;
    return cachedCommit;
  }

  try {
    const commit = execFileSync("git", ["rev-parse", `--short=${COMMIT_LENGTH}`, "HEAD"], {
      cwd: MONOREPO_ROOT,
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    cachedCommit = commit || null;
  } catch {
    cachedCommit = null;
  }

  return cachedCommit;
}

export function getBuildLabel() {
  const commit = getBuildCommit();
  return commit ? `${APP_VERSION}+${commit}` : APP_VERSION;
}
