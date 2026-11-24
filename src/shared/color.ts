/** "#rrggbb" to [r, g, b] in 0..255. */
export const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
