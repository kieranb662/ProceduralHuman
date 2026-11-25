import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";

export function ensureUniformAttributes(rawGeo: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = rawGeo.index ? rawGeo : BufferGeometryUtils.mergeVertices(rawGeo);
  const count = geo.attributes.position.count;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) {
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (!geo.attributes.color) {
    const col = new Float32Array(count * 3);
    col.fill(1);
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  }
  if (!geo.attributes.faceSurface) {
    geo.setAttribute("faceSurface", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  }
  if (!geo.attributes.heightOffset) {
    geo.setAttribute("heightOffset", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  }
  return geo;
}

export function buildGeometryFromArrays(
  positions: number[], uvs: number[], colors: number[], skinIdx: number[], skinWgt: number[], indices: number[],
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIdx, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWgt, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function weldSeamNormals(geo: THREE.BufferGeometry, numRings: number, segs: number): void {
  const stride = segs + 1;
  const nAttr = geo.attributes.normal as THREE.BufferAttribute;
  const n0 = new THREE.Vector3();
  const n1 = new THREE.Vector3();
  for (let r = 0; r < numRings; r++) {
    const i0 = r * stride;
    const i1 = i0 + segs;
    n0.fromBufferAttribute(nAttr, i0);
    n1.fromBufferAttribute(nAttr, i1);
    n0.add(n1).normalize();
    nAttr.setXYZ(i0, n0.x, n0.y, n0.z);
    nAttr.setXYZ(i1, n0.x, n0.y, n0.z);
  }
  nAttr.needsUpdate = true;
}
