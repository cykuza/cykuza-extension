import { accessSync, constants } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import type { Launcher as ChromeLauncher } from 'chrome-launcher';

const require = createRequire(import.meta.url);

export type ResolveChromiumBinaryOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
  canAccess?: (path: string) => boolean;
  chromeInstallations?: () => string[];
};

/**
 * Resolve a Chromium-family browser binary for WXT/web-ext.
 *
 * chrome-launcher (used by web-ext) only discovers Google Chrome. This project
 * targets Chrome/Edge/Brave, so when Chrome is absent we fall back to other
 * Chromium installs instead of failing with "No Chrome installations found".
 *
 * Precedence:
 * 1. CHROME_PATH (chrome-launcher / Lighthouse convention)
 * 2. chrome-launcher.getInstallations() (Google Chrome when present)
 * 3. Well-known Chromium-family paths for the host OS
 */
export function resolveChromiumBinary(
  opts: ResolveChromiumBinaryOptions = {}
): string | undefined {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const home = opts.home ?? env.HOME ?? env.USERPROFILE ?? homedir();
  const canAccess = opts.canAccess ?? defaultCanAccess;
  const chromeInstallations =
    opts.chromeInstallations ?? defaultChromeInstallations;

  const fromEnv = env.CHROME_PATH?.trim();
  if (fromEnv && canAccess(fromEnv)) return fromEnv;

  const fromLauncher = chromeInstallations();
  const firstInstall = fromLauncher[0];
  if (firstInstall && canAccess(firstInstall)) return firstInstall;

  for (const candidate of chromiumCandidates(platform, home, env)) {
    if (canAccess(candidate)) return candidate;
  }

  return undefined;
}

/** Ordered Chromium-family binary candidates for the host OS. */
export function chromiumCandidates(
  platform: NodeJS.Platform,
  home: string,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  if (platform === 'darwin') {
    const apps = [
      'Google Chrome.app/Contents/MacOS/Google Chrome',
      'Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      'Chromium.app/Contents/MacOS/Chromium',
      'Brave Browser.app/Contents/MacOS/Brave Browser',
      'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      'Microsoft Edge Beta.app/Contents/MacOS/Microsoft Edge Beta',
    ];
    const roots = ['/Applications', home ? `${home}/Applications` : ''].filter(
      Boolean
    );
    return roots.flatMap((root) => apps.map((rel) => `${root}/${rel}`));
  }

  if (platform === 'linux') {
    return [
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/brave-browser',
      '/usr/bin/brave-browser-stable',
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable',
      '/snap/bin/chromium',
    ];
  }

  if (platform === 'win32') {
    const local = env.LOCALAPPDATA ?? (home ? `${home}\\AppData\\Local` : '');
    const programFiles = env.PROGRAMFILES ?? 'C:\\Program Files';
    const programFilesX86 =
      env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
    return [
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${local}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFiles}\\Chromium\\Application\\chrome.exe`,
      `${programFiles}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      `${local}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ];
  }

  return [];
}

function defaultCanAccess(filePath: string): boolean {
  try {
    accessSync(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function defaultChromeInstallations(): string[] {
  try {
    const { Launcher } = require('chrome-launcher') as {
      Launcher: typeof ChromeLauncher;
    };
    return Launcher.getInstallations();
  } catch {
    return [];
  }
}
