import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { spawn } from "node:child_process";

export type DockerLoadResult = {
  loadedRefs: string[];
  imageId?: string;
  rawOutput: string;
};

type RunResult = {
  stdout: string;
  stderr: string;
  code: number;
};

async function runDocker(args: string[], stdin?: NodeJS.ReadableStream): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });

    if (stdin) {
      pipeline(stdin, child.stdin).catch(reject);
    } else {
      child.stdin.end();
    }
  });
}

export class DockerClient {
  async loadImage(artifactPath: string): Promise<DockerLoadResult> {
    let result: RunResult;
    if (artifactPath.endsWith(".tar.gz") || artifactPath.endsWith(".tgz")) {
      const input = fs.createReadStream(artifactPath).pipe(zlib.createGunzip());
      result = await runDocker(["load"], input);
    } else {
      result = await runDocker(["load", "-i", artifactPath]);
    }

    if (result.code !== 0) {
      throw new Error(`docker load failed: ${result.stderr || result.stdout}`);
    }

    const rawOutput = `${result.stdout}\n${result.stderr}`.trim();
    const loadedRefs = rawOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("Loaded image: "))
      .map((line) => line.replace("Loaded image: ", "").trim());

    const idLine = rawOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith("Loaded image ID: "));

    return {
      loadedRefs,
      imageId: idLine?.replace("Loaded image ID: ", "").trim(),
      rawOutput
    };
  }

  async inspectImageId(imageRef: string): Promise<string | null> {
    const result = await runDocker(["image", "inspect", "--format", "{{.Id}}", imageRef]);
    if (result.code !== 0) {
      return null;
    }
    return result.stdout.trim() || null;
  }

  async removeImage(imageRef: string): Promise<void> {
    const result = await runDocker(["image", "rm", imageRef]);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
  }

  async tagImage(sourceRef: string, targetRef: string): Promise<void> {
    const result = await runDocker(["tag", sourceRef, targetRef]);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
  }

  async removeContainer(containerName: string): Promise<void> {
    const result = await runDocker(["rm", "-f", containerName]);
    if (result.code !== 0 && !result.stderr.includes("No such container")) {
      throw new Error(result.stderr || result.stdout);
    }
  }

  async runContainer(args: {
    containerName: string;
    imageRef: string;
    network: string;
    envVars: Record<string, string>;
    labels: Record<string, string>;
    volumes?: string[];
    extraArgs?: string[];
  }): Promise<void> {
    const runArgs = ["run", "-d", "--name", args.containerName, "--restart", "unless-stopped", "--network", args.network];

    if (args.volumes) {
      for (const volume of args.volumes) {
        runArgs.push("-v", volume);
      }
    }
    for (const [key, value] of Object.entries(args.envVars)) {
      runArgs.push("-e", `${key}=${value}`);
    }
    for (const [key, value] of Object.entries(args.labels)) {
      runArgs.push("-l", `${key}=${value}`);
    }
    if (args.extraArgs) {
      runArgs.push(...args.extraArgs);
    }
    runArgs.push(args.imageRef);

    const result = await runDocker(runArgs);
    if (result.code !== 0) {
      throw new Error(`docker run failed: ${result.stderr || result.stdout}`);
    }
  }

  async restartContainer(containerName: string): Promise<void> {
    const result = await runDocker(["restart", containerName]);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
  }

  async stopContainer(containerName: string): Promise<void> {
    const result = await runDocker(["stop", containerName]);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
  }

  async getContainerStatus(containerName: string): Promise<string | null> {
    const result = await runDocker(["inspect", "--format", "{{.State.Status}}", containerName]);
    if (result.code !== 0) {
      return null;
    }
    return result.stdout.trim() || null;
  }

  async containerLogs(containerName: string, lines = 200): Promise<string> {
    const result = await runDocker(["logs", "--tail", String(lines), containerName]);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
    const out = `${result.stdout}\n${result.stderr}`.trim();
    return out || "(no logs)";
  }

  async execContainer(containerName: string, command: string[]): Promise<string> {
    const result = await runDocker(["exec", containerName, ...command]);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
    return `${result.stdout}\n${result.stderr}`.trim();
  }

  async listContainersByLabel(label: string): Promise<Array<{ name: string; image: string; status: string }>> {
    const result = await runDocker(["ps", "-a", "--filter", `label=${label}`, "--format", "{{.Names}}\t{{.Image}}\t{{.Status}}"]);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    return lines.map((line) => {
      const [name, image, ...rest] = line.split("\t");
      return { name, image, status: rest.join("\t") };
    });
  }

  async removeVolume(volumeName: string): Promise<void> {
    const result = await runDocker(["volume", "rm", volumeName]);
    if (result.code !== 0 && !result.stderr.includes("No such volume")) {
      throw new Error(result.stderr || result.stdout);
    }
  }
}
