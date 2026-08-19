/**
 * Vite plugin: keep AMO-unsafe vendor APIs out of the extension bundle.
 *
 * Zod 4 JIT (`Function`) and React DOM `innerHTML` assignments are not used
 * by Cykuza source. Transform only those vendor modules; do not blanket-replace
 * innerHTML across the graph.
 */

/**
 * @param {string} id
 * @returns {'zod-doc' | 'zod-util' | 'react-dom-prod' | null}
 */
export function matchAmoUnsafeVendor(id) {
  const normalized = id.split('?')[0].replace(/\\/g, '/');
  if (normalized.includes('/zod/v4/core/doc.')) return 'zod-doc';
  if (normalized.includes('/zod/v4/core/util.')) return 'zod-util';
  if (normalized.includes('react-dom-client.production')) return 'react-dom-prod';
  return null;
}

/**
 * @param {string} code
 * @param {RegExp} pattern
 * @param {string} replacement
 * @param {string} label
 */
function mustReplace(code, pattern, replacement, label) {
  const copy = new RegExp(pattern.source, pattern.flags);
  if (!copy.test(code)) {
    throw new Error(`amo-safe-vendors: ${label} not found`);
  }
  copy.lastIndex = 0;
  return code.replace(copy, replacement);
}

/**
 * @param {string} kind
 * @param {string} code
 * @returns {string}
 */
export function rewriteAmoUnsafeVendor(kind, code) {
  if (kind === 'zod-doc') {
    return mustReplace(
      code,
      /compile\(\) \{\s*const F = Function;[\s\S]*?return new F\(\.\.\.args, lines\.join\("\\n"\)\);\s*\}/,
      'compile() { throw new Error("Zod JIT compile is disabled"); }',
      'Zod Doc.compile Function constructor'
    );
  }

  if (kind === 'zod-util') {
    return mustReplace(
      code,
      /try \{\s*const F = Function;\s*new F\(""\);\s*return true;\s*\}/,
      'try { return false; }',
      'Zod allowsEval Function probe'
    );
  }

  if (kind === 'react-dom-prod') {
    let next = mustReplace(
      code,
      /nextResource = ownerDocument\.createElement\("div"\);\s*nextResource\.innerHTML = "<script>\\x3c\/script>";\s*nextResource = nextResource\.removeChild\(\s*nextResource\.firstChild\s*\);/,
      'nextResource = ownerDocument.createElement("script");',
      'React DOM script-tag innerHTML bootstrap'
    );
    next = mustReplace(
      next,
      /domElement\.innerHTML = key;/g,
      'throw Error("innerHTML is disabled");',
      'React DOM dangerouslySetInnerHTML assignment'
    );
    return next;
  }

  throw new Error(`amo-safe-vendors: unknown kind ${kind}`);
}

/**
 * @param {string} id
 * @param {string} code
 * @returns {{ code: string, map: null } | null}
 */
export function transformAmoUnsafeVendor(id, code) {
  const kind = matchAmoUnsafeVendor(id);
  if (!kind) return null;
  return { code: rewriteAmoUnsafeVendor(kind, code), map: null };
}

/** @returns {import('vite').Plugin} */
export function amoSafeVendorsPlugin() {
  return {
    name: 'cykuza-amo-safe-vendors',
    transform(code, id) {
      return transformAmoUnsafeVendor(id, code);
    },
  };
}
