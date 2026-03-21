import type {
  DistanceDimension,
  SketchCircle,
  SceneSelection,
  SceneSnapshot,
  SolidBody,
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

export function cloneSketchCircle(circle: SketchCircle): SketchCircle {
  return {
    ...circle,
    center: [...circle.center],
    planePosition: [...circle.planePosition],
    planeRotation: [...circle.planeRotation],
    planeScale: [...circle.planeScale],
  };
}

export function cloneSolidBody(body: SolidBody): SolidBody {
  return {
    ...body,
    center: [...body.center],
    planePosition: [...body.planePosition],
    planeRotation: [...body.planeRotation],
    planeScale: [...body.planeScale],
  };
}

export function cloneSceneSnapshot(snapshot: SceneSnapshot): SceneSnapshot {
  return {
    workPlanes: snapshot.workPlanes.map(cloneWorkPlane),
    sketchCircles: snapshot.sketchCircles.map(cloneSketchCircle),
    solidBodies: snapshot.solidBodies.map(cloneSolidBody),
    dimensions: snapshot.dimensions.map(cloneDistanceDimension),
    primarySelection: cloneSelection(snapshot.primarySelection),
    secondarySelection: cloneSelection(snapshot.secondarySelection),
  };
}

export function snapshotsEqual(a: SceneSnapshot, b: SceneSnapshot) {
  return JSON.stringify(a) === JSON.stringify(b);
}
