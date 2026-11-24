import type { ProceduralCharacter } from "../../humans/types.js";
import { defineElement, h } from "../../ui/api/element.js";
import type { PhSegmented } from "../../ui/api/segmented.js";
import type { PhToggle } from "../../ui/api/toggle.js";
import { PhEditorElement } from "../../ui/editor/editor-element.js";
import { HAND_GESTURE_LABELS, HAND_GESTURES, type HandGesture } from "../api/hand-gestures.js";
import { ANIMATION_LABELS, BASE_ANIMATIONS, FACE_EXPRESSIONS } from "../api/names.js";

const UPPER_STATES = ["none", "waving", "holding", "reaching"] as const;
const HAND_STATES = [...Object.keys(HAND_GESTURES), "auto"] as HandGesture[];
const FACE_STATES = ["neutral", ...FACE_EXPRESSIONS.filter((f) => f !== "blinking")] as const;

/**
 * Animation layer controls: base locomotion, upper-body overlay, hand gestures, facial expression,
 * blink and the automatic blink/gaze toggles. Set `el.character`; read `el.autoBlink` / `el.autoGaze`
 * when calling character.update(). Emits `ph-change` with `{ section: "animations", layer, value }`.
 */
export class PhAnimationEditor extends PhEditorElement<ProceduralCharacter> {
  private blinkToggle: PhToggle | null = null;
  private gazeToggle: PhToggle | null = null;

  set character(character: ProceduralCharacter) { this.bind(character); }
  get character() { return this.target; }

  get autoBlink() { return this.blinkToggle?.checked ?? true; }
  get autoGaze() { return this.gazeToggle?.checked ?? true; }

  render() {
    const c = this.target, state = c.animationState;
    const group = <T extends string>(label: string, values: readonly T[], labels: Record<string, string>, value: string, columns: number, apply: (v: T) => void) => {
      const seg = h("ph-segmented", { label, columns }) as PhSegmented;
      seg.options = values.map((v) => ({ value: v, label: labels[v] }));
      seg.value = value;
      seg.addEventListener("change", () => {
        apply(seg.value as T);
        this.changed("animations", { layer: label, value: seg.value });
      });
      return seg;
    };
    const gestures = c.handGestures;
    const blink = h("ph-button", { block: true, variant: "primary" }, "Trigger Blink");
    blink.addEventListener("click", () => c.triggerBlink());
    this.blinkToggle = h("ph-toggle", { label: "Auto blink", checked: true }) as PhToggle;
    this.gazeToggle = h("ph-toggle", { label: "Auto gaze", checked: true }) as PhToggle;

    this.clear();
    this.root.append(
      h("ph-panel", { heading: "Base Locomotion & Stance" },
        group("base", BASE_ANIMATIONS, ANIMATION_LABELS, state.base, 3, (v) => c.setBaseAnimation(v))),
      h("ph-panel", { heading: "Upper-Body Overlays (Layered)" },
        group("upper", UPPER_STATES, ANIMATION_LABELS, state.upper, 2, (v) => c.setUpperAnimation(v)),
        h("div", { style: "color:var(--_muted);font-size:11px;margin-top:4px" }, "Hand gesture"),
        group("hands", HAND_STATES, HAND_GESTURE_LABELS, gestures.L === gestures.R ? gestures.L : "", 3, (v) => c.setHandGesture(v))),
      h("ph-panel", { heading: "Facial Expressions (FACS)" },
        h("div", { style: "display:flex;gap:16px" }, this.gazeToggle, this.blinkToggle),
        group("face", FACE_STATES, ANIMATION_LABELS, state.face, 3, (v) => c.setFaceExpression(v)),
        blink),
    );
  }
}

export const registerAnimationEditor = () => defineElement("ph-animation-editor", PhAnimationEditor);
