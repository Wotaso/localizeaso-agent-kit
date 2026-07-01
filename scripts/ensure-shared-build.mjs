#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const sharedRoot = join(repoRoot, 'packages', 'asc-shared');

async function newestMtimeMs(dir) {
  let newest = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, await newestMtimeMs(filePath));
      continue;
    }
    const fileStat = await stat(filePath);
    newest = Math.max(newest, fileStat.mtimeMs);
  }
  return newest;
}

async function sharedBuildIsFresh() {
  try {
    const [jsStat, typesStat] = await Promise.all([
      stat(join(sharedRoot, 'dist', 'index.js')),
      stat(join(sharedRoot, 'dist', 'index.d.ts')),
    ]);
    let sourceMtime = 0;
    try {
      sourceMtime = await newestMtimeMs(join(sharedRoot, 'src'));
    } catch {
      return true;
    }
    return jsStat.mtimeMs >= sourceMtime && typesStat.mtimeMs >= sourceMtime;
  } catch {
    return false;
  }
}

export async function ensureSharedBuild() {
  if (await sharedBuildIsFresh()) return;
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['--filter', '@aso/asc-shared', 'build'], {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `@aso/asc-shared build failed with exit code ${code}.`));
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await ensureSharedBuild();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
