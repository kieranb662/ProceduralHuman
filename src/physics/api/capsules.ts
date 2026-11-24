import type { HumanoidRig } from "../../rigging/api/types.js";

/** Capsule collider parameters (meters), e.g. for RAPIER.ColliderDesc.capsule(halfHeight, radius). */
export interface CapsuleDescriptor {
  radius: number;
  halfHeight: number;
  /** Capsule center height above the character's feet. */
  centerOffsetY: number;
}

export interface PhysicsDescriptor {
  standingCapsule: CapsuleDescriptor;
  crouchingCapsule: CapsuleDescriptor;
  sittingCapsule: CapsuleDescriptor;
  eyeHeight: number;
  handSockets: HumanoidRig["handSockets"];
}

/** Physics-engine-agnostic collider data for the default adult body. */
export function createPhysicsDescriptor(rig: HumanoidRig): PhysicsDescriptor {
  return {
    standingCapsule: { radius: 0.28, halfHeight: 0.61, centerOffsetY: 0.89 },
    crouchingCapsule: { radius: 0.28, halfHeight: 0.33, centerOffsetY: 0.61 },
    sittingCapsule: { radius: 0.28, halfHeight: 0.39, centerOffsetY: 0.67 },
    eyeHeight: 1.666,
    handSockets: rig.handSockets,
  };
}
