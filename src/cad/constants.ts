import * as THREE from "three";
import type { WorkPlaneEdgeId, WorkPlaneVertexId } from "./types";

// ============================================
// CONSTANTS
// ============================================

export const WORLD_UP = new THREE.Vector3(0, 0, 1);
export const DEFAULT_CAMERA_POSITION = new THREE.Vector3(5, -5, 5);
export const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);
export const VIEW_DISTANCE = 8;

export const MOVE_SNAP_INCREMENT = 0.1;
export const ROTATION_SNAP_INCREMENT = 1;
export const SCALE_SNAP_INCREMENT = 0.1;
export const MIN_SCALE = 0.1;
export const PIXEL_TO_MM = 0.1;
export const PIXEL_TO_DEGREES = 0.5;
export const PIXEL_TO_SCALE = 0.01;

export const WORK_PLANE_FACE_ID = "face";
export const WORK_PLANE_EDGE_IDS: WorkPlaneEdgeId[] = [
  "top",
  "right",
  "bottom",
  "left",
];
export const WORK_PLANE_VERTEX_IDS: WorkPlaneVertexId[] = [
  "topLeft",
  "topRight",
  "bottomRight",
  "bottomLeft",
];

const disableRaycast = () => null;

export const nonSelectableProps = {
  raycast: disableRaycast,
} as unknown as Record<string, unknown>;
