import type {
  DistanceDimension,
  SceneSelection,
  SceneSnapshot,
  WorkPlane,
} from "../types";

// ============================================
// HISTORY HELPERS
// ============================================

export function cloneSelection(selection: SceneSelection): SceneSelection {
  return selection ? { ...selection } : null;
}

export function cloneDistanceDimension(
  dimension: DistanceDimension
): DistanceDimension {
  return {
    ...dimension,
    from: { ...dimension.from },
    to: { ...dimension.to },
  };
}

export function cloneWorkPlane(plane: WorkPlane): WorkPlane {
  return {
    ...plane,
    position: [...plane.position],
    rotation: [...plane.rotation],
    scale: [...plane.scale],
    size: { ...plane.size },
  };
}

export function cloneSceneSnapshot(snapshot: SceneSnapshot): SceneSnapshot {
  return {
    workPlanes: snapshot.workPlanes.map(cloneWorkPlane),
    dimensions: snapshot.dimensions.map(cloneDistanceDimension),
    primarySelection: cloneSelection(snapshot.primarySelection),
    secondarySelection: cloneSelection(snapshot.secondarySelection),
  };
}

export function snapshotsEqual(a: SceneSnapshot, b: SceneSnapshot) {
  return JSON.stringify(a) === JSON.stringify(b);
}
