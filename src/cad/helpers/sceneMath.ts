import * as THREE from "three";
import {
  DEFAULT_CAMERA_POSITION,
  MIN_SCALE,
  MOVE_SNAP_INCREMENT,
  VIEW_DISTANCE,
} from "../constants";
import type {
  CameraState,
  DimensionOverlayArrow,
  MousePosition,
  SceneSelection,
  SceneSnapshot,
  TransformAxis,
  TransformFieldAxis,
  Vector3Tuple,
  ViewAction,
  WorkPlane,
  WorkPlaneEdgeId,
  WorkPlaneSubElementHighlight,
  WorkPlaneVertexId,
} from "../types";

// ============================================
// SCENE / SELECTION / DIMENSION HELPERS
// ============================================

export function snapToIncrement(
  value: number,
  increment = MOVE_SNAP_INCREMENT
) {
  return Math.round(value / increment) * increment;
}

export function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI;
}

export function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function createEmptyPlaneHighlight(): WorkPlaneSubElementHighlight {
  return {
    faceRole: null,
    selectedEdgeRoleById: {
      top: null,
      right: null,
      bottom: null,
      left: null,
    },
    selectedVertexRoleById: {
      topLeft: null,
      topRight: null,
      bottomRight: null,
      bottomLeft: null,
    },
  };
}

export function applyPlaneSelectionRole(
  highlight: WorkPlaneSubElementHighlight,
  selection: SceneSelection,
  planeId: string,
  role: "primary" | "secondary"
) {
  if (!selection || selection.objectKind !== "plane" || selection.objectId !== planeId) {
    return;
  }

  if (
    selection.selectionLevel === "object" ||
    selection.selectionLevel === "face"
  ) {
    highlight.faceRole = role;
    return;
  }

  if (selection.selectionLevel === "edge" && selection.subElementId) {
    highlight.selectedEdgeRoleById[selection.subElementId as WorkPlaneEdgeId] = role;
    return;
  }

  if (selection.selectionLevel === "vertex" && selection.subElementId) {
    highlight.selectedVertexRoleById[
      selection.subElementId as WorkPlaneVertexId
    ] = role;
  }
}

export function getPlaneSelectionHighlight(
  primarySelection: SceneSelection,
  secondarySelection: SceneSelection,
  planeId: string
) {
  const highlight = createEmptyPlaneHighlight();
  applyPlaneSelectionRole(highlight, primarySelection, planeId, "primary");
  applyPlaneSelectionRole(highlight, secondarySelection, planeId, "secondary");
  return highlight;
}

export function getPlaneBySelection(
  workPlanes: WorkPlane[],
  selection: SceneSelection
) {
  if (!selection || selection.objectKind !== "plane") return null;
  return workPlanes.find((plane) => plane.id === selection.objectId) ?? null;
}

export function createSelection(
  objectKind: "plane",
  objectId: string,
  selectionLevel: "object" | "face" | "edge" | "vertex",
  subElementId: string | null = null
) {
  return {
    objectKind,
    objectId,
    selectionLevel,
    subElementId,
  } as const;
}

export function getWorkPlaneVertexLocalPoint(
  plane: WorkPlane,
  vertexId: WorkPlaneVertexId
) {
  const halfWidth = plane.size.width / 2;
  const halfHeight = plane.size.height / 2;

  if (vertexId === "topLeft") return new THREE.Vector3(-halfWidth, halfHeight, 0);
  if (vertexId === "topRight") return new THREE.Vector3(halfWidth, halfHeight, 0);
  if (vertexId === "bottomRight") {
    return new THREE.Vector3(halfWidth, -halfHeight, 0);
  }

  return new THREE.Vector3(-halfWidth, -halfHeight, 0);
}

export function getWorkPlaneEdgeLocalPoints(
  plane: WorkPlane,
  edgeId: WorkPlaneEdgeId
): [THREE.Vector3, THREE.Vector3] {
  if (edgeId === "top") {
    return [
      getWorkPlaneVertexLocalPoint(plane, "topLeft"),
      getWorkPlaneVertexLocalPoint(plane, "topRight"),
    ];
  }

  if (edgeId === "right") {
    return [
      getWorkPlaneVertexLocalPoint(plane, "topRight"),
      getWorkPlaneVertexLocalPoint(plane, "bottomRight"),
    ];
  }

  if (edgeId === "bottom") {
    return [
      getWorkPlaneVertexLocalPoint(plane, "bottomLeft"),
      getWorkPlaneVertexLocalPoint(plane, "bottomRight"),
    ];
  }

  return [
    getWorkPlaneVertexLocalPoint(plane, "topLeft"),
    getWorkPlaneVertexLocalPoint(plane, "bottomLeft"),
  ];
}

export function getPlaneTransformMatrix(plane: WorkPlane) {
  const position = new THREE.Vector3(...plane.position);
  const rotation = new THREE.Euler(...plane.rotation);
  const quaternion = new THREE.Quaternion().setFromEuler(rotation);
  const scale = new THREE.Vector3(...plane.scale);

  return new THREE.Matrix4().compose(position, quaternion, scale);
}

export function getWorkPlaneWorldPoint(plane: WorkPlane, localPoint: THREE.Vector3) {
  return localPoint.clone().applyMatrix4(getPlaneTransformMatrix(plane));
}

export function getSelectionLocalAnchorPoint(
  selection: SceneSelection,
  workPlanes: WorkPlane[]
): THREE.Vector3 | null {
  const plane = getPlaneBySelection(workPlanes, selection);
  if (!plane || !selection) return null;

  if (
    selection.selectionLevel === "object" ||
    selection.selectionLevel === "face"
  ) {
    return new THREE.Vector3(0, 0, 0);
  }

  if (selection.selectionLevel === "edge" && selection.subElementId) {
    const [start, end] = getWorkPlaneEdgeLocalPoints(
      plane,
      selection.subElementId as WorkPlaneEdgeId
    );
    return start.clone().lerp(end, 0.5);
  }

  if (selection.selectionLevel === "vertex" && selection.subElementId) {
    return getWorkPlaneVertexLocalPoint(
      plane,
      selection.subElementId as WorkPlaneVertexId
    );
  }

  return null;
}

export function getSelectionAnchorPoint(
  selection: SceneSelection,
  workPlanes: WorkPlane[]
): THREE.Vector3 | null {
  const plane = getPlaneBySelection(workPlanes, selection);
  if (!plane || !selection) return null;

  if (
    selection.selectionLevel === "object" ||
    selection.selectionLevel === "face"
  ) {
    return getWorkPlaneWorldPoint(plane, new THREE.Vector3(0, 0, 0));
  }

  if (selection.selectionLevel === "edge" && selection.subElementId) {
    const [start, end] = getWorkPlaneEdgeLocalPoints(
      plane,
      selection.subElementId as WorkPlaneEdgeId
    );
    return getWorkPlaneWorldPoint(plane, start.clone().lerp(end, 0.5));
  }

  if (selection.selectionLevel === "vertex" && selection.subElementId) {
    return getWorkPlaneWorldPoint(
      plane,
      getWorkPlaneVertexLocalPoint(
        plane,
        selection.subElementId as WorkPlaneVertexId
      )
    );
  }

  return null;
}

export function getDistanceBetweenSelections(
  from: SceneSelection,
  to: SceneSelection,
  workPlanes: WorkPlane[]
) {
  const fromPoint = getSelectionAnchorPoint(from, workPlanes);
  const toPoint = getSelectionAnchorPoint(to, workPlanes);

  if (!fromPoint || !toPoint) return null;
  return fromPoint.distanceTo(toPoint);
}

export function isDimensionEligibleSelection(selection: SceneSelection) {
  if (!selection) return false;
  if (selection.objectKind !== "plane") return false;

  return (
    selection.selectionLevel === "object" ||
    selection.selectionLevel === "face" ||
    selection.selectionLevel === "edge" ||
    selection.selectionLevel === "vertex"
  );
}

export function areSelectionsEqual(a: SceneSelection, b: SceneSelection) {
  if (!a || !b) return false;

  return (
    a.objectKind === b.objectKind &&
    a.objectId === b.objectId &&
    a.selectionLevel === b.selectionLevel &&
    a.subElementId === b.subElementId
  );
}

export function dimensionExists(
  dimensions: { from: SceneSelection; to: SceneSelection }[],
  from: SceneSelection,
  to: SceneSelection
) {
  return dimensions.some(
    (dimension) =>
      (areSelectionsEqual(dimension.from, from) &&
        areSelectionsEqual(dimension.to, to)) ||
      (areSelectionsEqual(dimension.from, to) &&
        areSelectionsEqual(dimension.to, from))
  );
}

export function formatSelectionLevel(selection: SceneSelection) {
  if (!selection) return "None";
  return selection.selectionLevel;
}

export function projectWorldPointToScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  width: number,
  height: number
): MousePosition {
  const projected = point.clone().project(camera);

  return {
    x: ((projected.x + 1) * width) / 2,
    y: ((-projected.y + 1) * height) / 2,
  };
}

export function createOverlayArrow(
  tip: MousePosition,
  direction: { x: number; y: number },
  length: number,
  width: number
): DimensionOverlayArrow {
  const base = {
    x: tip.x + direction.x * length,
    y: tip.y + direction.y * length,
  };
  const perpendicular = {
    x: -direction.y,
    y: direction.x,
  };

  return [
    tip,
    {
      x: base.x + perpendicular.x * width,
      y: base.y + perpendicular.y * width,
    },
    {
      x: base.x - perpendicular.x * width,
      y: base.y - perpendicular.y * width,
    },
  ];
}

export function getScaleDisplayBase(
  plane: WorkPlane | null,
  axis: TransformFieldAxis
) {
  if (!plane) return 1;
  if (axis === "x") return plane.size.width;
  if (axis === "y") return plane.size.height;
  return 1;
}

export function snapVectorComponent(
  position: Vector3Tuple,
  axis: Exclude<TransformAxis, null>,
  value: number
): Vector3Tuple {
  if (axis === "x") return [snapToIncrement(value), position[1], position[2]];
  if (axis === "y") return [position[0], snapToIncrement(value), position[2]];
  return [position[0], position[1], snapToIncrement(value)];
}

export function getViewPosition(action: ViewAction) {
  if (action === "top") return new THREE.Vector3(0, 0, VIEW_DISTANCE);
  if (action === "bottom") return new THREE.Vector3(0, 0, -VIEW_DISTANCE);
  if (action === "front") return new THREE.Vector3(0, -VIEW_DISTANCE, 0);
  if (action === "back") return new THREE.Vector3(0, VIEW_DISTANCE, 0);
  if (action === "right") return new THREE.Vector3(VIEW_DISTANCE, 0, 0);
  if (action === "left") return new THREE.Vector3(-VIEW_DISTANCE, 0, 0);
  return DEFAULT_CAMERA_POSITION.clone();
}

export function movePlaneInSnapshot(
  snapshot: SceneSnapshot,
  planeId: string,
  nextPosition: Vector3Tuple
) {
  return {
    ...snapshot,
    workPlanes: snapshot.workPlanes.map((plane) =>
      plane.id === planeId ? { ...plane, position: nextPosition } : plane
    ),
  };
}

export function clampScale(value: number) {
  return Math.max(MIN_SCALE, value);
}

export function getCameraStateFromTarget(
  position: THREE.Vector3,
  target: THREE.Vector3,
  up: THREE.Vector3
): CameraState {
  return {
    offset: position.clone().sub(target),
    up: up.clone(),
  };
}
