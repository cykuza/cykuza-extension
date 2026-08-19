import type { Plugin } from 'vite';

export type AmoUnsafeVendorKind = 'zod-doc' | 'zod-util' | 'react-dom-prod';

export function matchAmoUnsafeVendor(id: string): AmoUnsafeVendorKind | null;

export function rewriteAmoUnsafeVendor(
  kind: AmoUnsafeVendorKind,
  code: string
): string;

export function transformAmoUnsafeVendor(
  id: string,
  code: string
): { code: string; map: null } | null;

export function amoSafeVendorsPlugin(): Plugin;
