import { registerButton } from "./api/button.js";
import { registerColorInput } from "./api/color-input.js";
import { registerPanel } from "./api/panel.js";
import { registerSegmented } from "./api/segmented.js";
import { registerSelect } from "./api/select.js";
import { registerSlider } from "./api/slider.js";
import { registerStatus } from "./api/status.js";
import { registerTabs } from "./api/tabs.js";
import { registerToggle } from "./api/toggle.js";
import { registerCodeExport } from "./editor/code-export.js";
import { registerParameterGroup } from "./editor/parameter-group.js";

/** Defines every ph-* UI element (idempotent; no-op outside a browser). */
export function registerUiElements(): void {
  registerButton();
  registerColorInput();
  registerPanel();
  registerSegmented();
  registerSelect();
  registerSlider();
  registerStatus();
  registerTabs();
  registerToggle();
  registerCodeExport();
  registerParameterGroup();
}
