import * as THREE from "three";
import type { BaseAnimation } from "../../animations/api/names.js";
import type { CapsuleDescriptor, PhysicsDescriptor } from "./capsules.js";

/** The collider capsule matching a base animation stance. */
export function capsuleForStance(descriptor: PhysicsDescriptor, stance: BaseAnimation): CapsuleDescriptor {
  return stance === "crouching" ? descriptor.crouchingCapsule
    : stance === "sitting" ? descriptor.sittingCapsule
      : descriptor.standingCapsule;
}

/** The capsule as a Rapier collider snippet plus summary numbers. */
export function describeCapsule(capsule: CapsuleDescriptor, stance: string): string {
  const totalH = (capsule.halfHeight * 2 + capsule.radius * 2).toFixed(2);
  return `Rapier Capsule (${stance}):\nRAPIER.ColliderDesc.capsule(${capsule.halfHeight.toFixed(2)}, ${capsule.radius.toFixed(2)})\n` +
    `Center Y = ${capsule.centerOffsetY.toFixed(2)}m | Total H = ${totalH}m`;
}

/** Wireframe capsule for visualizing a collider. Dispose its geometry and material when replaced. */
export function createCapsuleDebugMesh(capsule: CapsuleDescriptor): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(capsule.radius, capsule.halfHeight * 2, 10, 20),
    new THREE.MeshBasicMaterial({ color: 0x34d399, wireframe: true, transparent: true, opacity: 0.55 }),
  );
  mesh.name = "PhysicsCapsuleDebug";
  mesh.position.y = capsule.centerOffsetY;
  return mesh;
}
