/**
 * Node Buffer polyfill for the MV3 service worker.
 *
 * bitcoinjs-lib / secp256k1 / ecpair run Buffer-based self-checks at import time.
 * The service worker has no Node Buffer — without this as the first background
 * import, the SW crashes on startup and chrome.runtime.sendMessage never
 * gets a reply.
 */
import { Buffer } from 'buffer';

type GlobalWithBuffer = typeof globalThis & {
  Buffer?: typeof Buffer;
  global?: typeof globalThis & { Buffer?: typeof Buffer };
};

const g = globalThis as GlobalWithBuffer;

if (g.Buffer === undefined) {
  g.Buffer = Buffer;
}

// Some bundled CJS helpers still read `global.Buffer`.
if (g.global === undefined) {
  g.global = g;
}
if (g.global.Buffer === undefined) {
  g.global.Buffer = Buffer;
}
