import type * as THREE from "three";

/** The subset of OrbitControls (or compatible controls) that viewport editors use. */
export interface ViewportControls {
  enabled: boolean;
  target: THREE.Vector3;
  mouseButtons: { LEFT?: THREE.MOUSE | null; MIDDLE?: THREE.MOUSE | null; RIGHT?: THREE.MOUSE | null };
  update(): unknown;
}

/** What a viewport-aware editor needs from the host's 3D view. */
export interface EditorViewport {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  /** Optional camera controls; disabled during brush strokes and remapped while sculpting. */
  controls?: ViewportControls;
  /** Scene that receives editor overlays such as the brush cursor. */
  scene: THREE.Scene;
}
