import type { PhColorInput } from "../../ui/api/color-input.js";
import { defineElement, h, onDetail } from "../../ui/api/element.js";
import type { PhToggle } from "../../ui/api/toggle.js";
import { PhEditorElement } from "../../ui/editor/editor-element.js";
import type { ParameterEventDetail, PhParameterGroup } from "../../ui/editor/parameter-group.js";
import {
  anglesToLightPosition, lightPositionToAngles,
  type StudioLighting, type StudioLightingChanges,
} from "../api/studio-lighting.js";

/**
 * Studio lighting controls: environment and fill intensity, plus color, intensity and direction
 * (azimuth/elevation) for the key and rim lights. Set `el.lighting` to a createStudioLighting() rig.
 * Emits `ph-change` with `{ section: "lighting", settings }`.
 */
export class PhLightingEditor extends PhEditorElement<StudioLighting> {
  set lighting(lighting: StudioLighting) { this.bind(lighting); }
  get lighting() { return this.target; }

  render() {
    const rig = this.target, s = rig.settings;
    const update = (changes: StudioLightingChanges) => {
      rig.setSettings(changes);
      this.changed("lighting", { settings: rig.settings });
    };

    const ambient = h("ph-parameter-group") as PhParameterGroup;
    ambient.parameters = [
      { key: "environmentIntensity", label: "Environment reflections", min: 0, max: 2 },
      { key: "hemisphere", label: "Sky / ground fill", min: 0, max: 2 },
    ];
    ambient.values = { environmentIntensity: s.environmentIntensity, hemisphere: s.hemisphere.intensity };
    onDetail<ParameterEventDetail>(ambient, "input", (_detail, e) => update(e.detail.key === "hemisphere"
      ? { hemisphere: { intensity: e.detail.value } } : { environmentIntensity: e.detail.value }));

    const lightPanel = (which: "key" | "rim", heading: string) => {
      const light = s[which];
      const color = h("ph-color-input", { label: "Color", value: light.color }) as PhColorInput;
      color.addEventListener("input", () => update({ [which]: { color: color.value } }));
      const angles = lightPositionToAngles(light.position);
      const params = h("ph-parameter-group") as PhParameterGroup;
      params.parameters = [
        { key: "intensity", label: "Intensity", min: 0, max: 5 },
        { key: "azimuth", label: "Direction (azimuth)", min: -180, max: 180, step: 1, decimals: 0, unit: "°" },
        { key: "elevation", label: "Height (elevation)", min: -10, max: 90, step: 1, decimals: 0, unit: "°" },
      ];
      params.values = { intensity: light.intensity, azimuth: angles.azimuth, elevation: angles.elevation };
      onDetail<ParameterEventDetail>(params, "input", (_detail, e) => {
        if (e.detail.key === "intensity") return update({ [which]: { intensity: e.detail.value } });
        angles[e.detail.key as "azimuth" | "elevation"] = e.detail.value;
        update({ [which]: { position: anglesToLightPosition(angles.azimuth, angles.elevation, angles.distance) } });
      });
      const panel = h("ph-panel", { heading, framed: true }, color, params);
      if (which === "key") {
        const shadows = h("ph-toggle", { label: "Cast shadows", checked: s.key.castShadow }) as PhToggle;
        shadows.addEventListener("change", () => update({ key: { castShadow: shadows.checked } }));
        panel.append(shadows);
      }
      return panel;
    };

    this.clear();
    this.root.append(
      h("ph-panel", { heading: "Ambient" }, ambient),
      lightPanel("key", "Key light"),
      lightPanel("rim", "Rim light"),
    );
  }
}

export const registerLightingEditor = () => defineElement("ph-lighting-editor", PhLightingEditor);
