import * as THREE from "three";
import type { WorkPlane } from "../../cad/types";
import type { PlaneSketchStroke, SketchPoint2D } from "./types";

// ============================================
// HELPERS
// ============================================

export function planeLocalPointToVector3(
  point: SketchPoint2D,
  zOffset = 0.04
): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, zOffset);
}

export function buildPlaneSketchLinePoints(
  stroke: PlaneSketchStroke,
  zOffset = 0.04
) {
  return new Float32Array(
    stroke.points.flatMap((point) => [point.x, point.y, zOffset])
  );
}

export function getPlaneSketchWorldPoints(
  plane: WorkPlane,
  stroke: PlaneSketchStroke,
  zOffset = 0.04
) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...plane.rotation)
  );
  const scale = new THREE.Vector3(...plane.scale);
  matrix.compose(new THREE.Vector3(...plane.position), quaternion, scale);

  return stroke.points.map((point) =>
    planeLocalPointToVector3(point, zOffset).applyMatrix4(matrix)
  );
}
