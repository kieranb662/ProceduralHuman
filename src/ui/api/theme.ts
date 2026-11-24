/**
 * Theme tokens. Override any of these custom properties on a ph- element or an ancestor
 * (e.g. `ph-materials-editor { --ph-accent: hotpink; }`) to restyle every component.
 */
export const PH_THEME_TOKENS = {
  "--ph-font": `"Inter", system-ui, -apple-system, sans-serif`,
  "--ph-font-size": "12px",
  "--ph-text": "#e2e8f0",
  "--ph-muted": "#94a3b8",
  "--ph-surface": "rgba(15, 23, 42, 0.85)",
  "--ph-surface-raised": "#1e293b",
  "--ph-surface-sunken": "rgba(2, 6, 23, 0.5)",
  "--ph-border": "#334155",
  "--ph-accent": "#38bdf8",
  "--ph-accent-hover": "#7dd3fc",
  "--ph-accent-text": "#020617",
  "--ph-danger": "#f87171",
  "--ph-radius": "12px",
  "--ph-radius-sm": "8px",
  "--ph-gap": "8px",
} as const;

const tokenFallbacks = Object.entries(PH_THEME_TOKENS)
  .map(([name, value]) => `${name.replace("--ph-", "--_")}: var(${name}, ${value});`).join("\n    ");

/** Base styles shared by every component: resolved tokens (as --_name), typography and focus rings. */
export const BASE_STYLES = `
  :host {
    ${tokenFallbacks}
    font-family: var(--_font);
    font-size: var(--_font-size);
    color: var(--_text);
    box-sizing: border-box;
  }
  :host([hidden]) { display: none !important; }
  *, *::before, *::after { box-sizing: inherit; }
  :focus-visible { outline: 2px solid var(--_accent); outline-offset: 2px; }
  button, input, select, textarea { font: inherit; color: inherit; }
`;
