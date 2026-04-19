import { spawn, type ChildProcess } from "child_process";
import { createWriteStream, existsSync, writeFileSync, type WriteStream } from "fs";
import { createServer } from "net";
import { dirname } from "path";
import { sidecarModelService } from "./sidecar-model.service.js";
import { isAbortError } from "./sidecar-download.js";
import { sidecarRuntimeService, type SidecarRuntimeInstall } from "./sidecar-runtime.service.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate a localhost port")));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

class SidecarProcessService {
  private child: ChildProcess | null = null;
  private logStream: WriteStream | null = null;
  private baseUrl: string | null = null;
  private ready = false;
  private currentSignature: string | null = null;
  private intentionalStop = false;
  private unexpectedCrashCount = 0;
  private lastReadyAt = 0;
  private syncLock: Promise<void> = Promise.resolve();

  isReady(): boolean {
    return this.ready && this.baseUrl !== null;
  }

  getBaseUrl(): string | null {
    return this.baseUrl;
  }

  async ensureReady(): Promise<string> {
    await this.syncForCurrentConfig();
    if (!this.ready || !this.baseUrl) {
      throw new Error("The local llama-server is not ready");
    }
    return this.baseUrl;
  }

  async syncForCurrentConfig(): Promise<void> {
    return this.withLock(async () => {
      await this.syncUnlocked();
    });
  }

  async restart(): Promise<void> {
    return this.withLock(async () => {
      this.currentSignature = null;
      await this.stopUnlocked();
      await this.syncUnlocked();
    });
  }

  async stop(): Promise<void> {
    return this.withLock(async () => {
      await this.stopUnlocked();
      if (sidecarModelService.getModelFilePath()) {
        sidecarModelService.setStatus("downloaded");
      } else {
        sidecarModelService.setStatus("not_downloaded");
      }
    });
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void = () => {};
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.syncLock;
    this.syncLock = next;
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async syncUnlocked(): Promise<void> {
    const modelPath = sidecarModelService.getModelFilePath();
    const config = sidecarModelService.getConfig();

    if (!modelPath) {
      await this.stopUnlocked();
      sidecarModelService.setStatus("not_downloaded");
      return;
    }

    if (!sidecarModelService.isEnabled()) {
      await this.stopUnlocked();
      sidecarModelService.setStatus("downloaded");
      return;
    }

    const runtime = await this.ensureRuntimeInstalled();
    const nextSignature = JSON.stringify({
      serverPath: runtime.serverPath,
      modelPath,
      contextSize: config.contextSize,
      gpuLayers: config.gpuLayers,
    });

    if (this.child && this.ready && this.currentSignature === nextSignature) {
      sidecarModelService.setStatus("ready");
      return;
    }

    sidecarModelService.setStatus("starting_server");
    await this.stopUnlocked();
    await this.startUnlocked(runtime, modelPath, nextSignature);
  }

  private async ensureRuntimeInstalled(): Promise<SidecarRuntimeInstall> {
    sidecarModelService.setStatus("downloading_runtime");
    try {
      return await sidecarRuntimeService.ensureInstalled((progress) => {
        sidecarModelService.emitExternalProgress(progress);
      });
    } catch (error) {
      if (isAbortError(error)) {
        sidecarModelService.setStatus(sidecarModelService.getModelFilePath() ? "downloaded" : "not_downloaded");
      } else {
        sidecarModelService.setStatus("server_error");
      }
      throw error;
    }
  }

  private buildArgs(modelPath: string): string[] {
    const config = sidecarModelService.getConfig();
    const args = [
      "-m",
      modelPath,
      "--host",
      "127.0.0.1",
      "--parallel",
      "2",
      "--log-disable",
      "--ctx-size",
      String(config.contextSize),
    ];

    const gpuLayers = config.gpuLayers === -1 ? 999 : config.gpuLayers;
    args.push("-ngl", String(gpuLayers));
    return args;
  }

  private async startUnlocked(runtime: SidecarRuntimeInstall, modelPath: string, signature: string): Promise<void> {
    if (!existsSync(modelPath)) {
      throw new Error("The selected sidecar model file is missing. Please download it again.");
    }

    const port = await getFreePort();
    const args = this.buildArgs(modelPath);
    args.push("--port", String(port));

    writeFileSync(sidecarRuntimeService.getLogPath(), "", "utf-8");
    const logStream = createWriteStream(sidecarRuntimeService.getLogPath(), { flags: "a" });

    const child = spawn(runtime.serverPath, args, {
      cwd: dirname(runtime.serverPath),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.child = child;
    this.logStream = logStream;
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.ready = false;
    this.currentSignature = signature;
    this.intentionalStop = false;

    child.stdout!.on("data", (chunk) => {
      logStream.write(chunk);
    });
    child.stderr!.on("data", (chunk) => {
      logStream.write(chunk);
    });
    child.on("exit", (code, signal) => {
      void this.handleChildExit(code, signal);
    });

    try {
      await this.waitForHealth(this.baseUrl, child);
      this.ready = true;
      this.unexpectedCrashCount = 0;
      this.lastReadyAt = Date.now();
      sidecarModelService.setStatus("ready");
      sidecarModelService.clearLegacyRuntimeStamp();
    } catch (error) {
      sidecarModelService.setStatus("server_error");
      await this.stopUnlocked();
      throw error;
    }
  }

  private async waitForHealth(baseUrl: string, child: ChildProcess): Promise<void> {
    const timeoutAt = Date.now() + 60_000;
    let lastError: unknown = null;

    while (Date.now() < timeoutAt) {
      if (child.exitCode !== null) {
        throw new Error(`llama-server exited before becoming ready (exit ${child.exitCode})`);
      }

      try {
        const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3_000) });
        if (response.ok) {
          return;
        }
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }

      await delay(500);
    }

    throw lastError instanceof Error ? lastError : new Error("Timed out waiting for llama-server health");
  }

  private async stopUnlocked(): Promise<void> {
    const child = this.child;
    if (!child) {
      this.ready = false;
      this.baseUrl = null;
      return;
    }

    this.intentionalStop = true;
    const exited = new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    });

    try {
      child.kill("SIGTERM");
    } catch {
      // Best-effort shutdown.
    }

    const timeout = delay(5_000);
    await Promise.race([exited, timeout]);

    if (child.exitCode === null) {
      try {
        child.kill("SIGKILL");
      } catch {
        // Best-effort forced shutdown.
      }
    }

    this.cleanupChildState();
  }

  private cleanupChildState(): void {
    this.child = null;
    this.ready = false;
    this.baseUrl = null;
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  private async handleChildExit(code: number | null, signal: NodeJS.Signals | null): Promise<void> {
    const wasIntentional = this.intentionalStop;
    this.intentionalStop = false;
    this.cleanupChildState();

    if (wasIntentional) {
      return;
    }

    console.error(`[sidecar] llama-server exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"})`);

    const crashedSoonAfterReady = this.lastReadyAt > 0 && Date.now() - this.lastReadyAt < 30_000;
    this.unexpectedCrashCount = crashedSoonAfterReady ? this.unexpectedCrashCount + 1 : 1;

    if (this.unexpectedCrashCount > 1) {
      sidecarModelService.setStatus("server_error");
      return;
    }

    try {
      await this.syncForCurrentConfig();
    } catch (error) {
      console.error("[sidecar] Auto-restart failed:", error);
      sidecarModelService.setStatus("server_error");
    }
  }
}

export const sidecarProcessService = new SidecarProcessService();
