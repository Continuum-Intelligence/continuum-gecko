import type { PlaneSketch, PlaneSketchStroke, SketchPoint2D } from "./types";

// ============================================
// HELPERS
// ============================================

export function clonePlaneSketches(sketches: PlaneSketch[]) {
  return sketches.map((sketch) => ({
    ...sketch,
    strokes: sketch.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
    })),
  }));
}

export function getPlaneSketch(
  sketches: PlaneSketch[],
  planeId: string | null
): PlaneSketch | null {
  if (!planeId) {
    return null;
  }

  return sketches.find((sketch) => sketch.planeId === planeId) ?? null;
}

export function getPlaneSketchStrokes(
  sketches: PlaneSketch[],
  planeId: string | null
): PlaneSketchStroke[] {
  return getPlaneSketch(sketches, planeId)?.strokes ?? [];
}

export function upsertPlaneSketchStrokes(
  sketches: PlaneSketch[],
  planeId: string,
  nextStrokes: PlaneSketchStroke[]
) {
  const nextSketches = clonePlaneSketches(sketches);
  const existingIndex = nextSketches.findIndex((sketch) => sketch.planeId === planeId);
  const existing = existingIndex >= 0 ? nextSketches[existingIndex] : null;

  if (existing) {
    if (nextStrokes.length === 0) {
      nextSketches.splice(existingIndex, 1);
      return nextSketches;
    }

    existing.strokes = nextStrokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
    }));
    return nextSketches;
  }

  if (nextStrokes.length === 0) {
    return nextSketches;
  }

  return [
    ...nextSketches,
    {
      planeId,
      strokes: nextStrokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => ({ ...point })),
      })),
    },
  ];
}

export function removePlaneSketchesForMissingPlanes(
  sketches: PlaneSketch[],
  planeIds: string[]
) {
  const planeIdSet = new Set(planeIds);
  return sketches.filter((sketch) => planeIdSet.has(sketch.planeId));
}

export function findStrokeById(
  sketches: PlaneSketch[],
  strokeId: number
): { planeId: string; stroke: PlaneSketchStroke } | null {
  for (const sketch of sketches) {
    const stroke = sketch.strokes.find((item) => item.id === strokeId);
    if (stroke) {
      return { planeId: sketch.planeId, stroke };
    }
  }

  return null;
}

export function renameStrokeInSketches(
  sketches: PlaneSketch[],
  strokeId: number,
  nextName: string
) {
  return clonePlaneSketches(sketches).map((sketch) => ({
    ...sketch,
    strokes: sketch.strokes.map((stroke) =>
      stroke.id === strokeId ? { ...stroke, name: nextName } : stroke
    ),
  }));
}

export function deleteStrokeFromSketches(
  sketches: PlaneSketch[],
  strokeId: number
) {
  return clonePlaneSketches(sketches).flatMap((sketch) => {
    const nextStrokes = sketch.strokes.filter((stroke) => stroke.id !== strokeId);
    if (nextStrokes.length === 0) {
      return [];
    }

    return [{ ...sketch, strokes: nextStrokes }];
  });
}

export function boardPointToPlaneLocal(
  point: SketchPoint2D,
  boardWidth: number,
  boardHeight: number
): SketchPoint2D {
  const halfBoardWidth = boardWidth / 2;
  const halfBoardHeight = boardHeight / 2;

  return {
    x: point.x - halfBoardWidth,
    y: halfBoardHeight - point.y,
  };
}

export function planeLocalPointToBoard(
  point: SketchPoint2D,
  boardWidth: number,
  boardHeight: number
): SketchPoint2D {
  const halfBoardWidth = boardWidth / 2;
  const halfBoardHeight = boardHeight / 2;

  return {
    x: point.x + halfBoardWidth,
    y: halfBoardHeight - point.y,
  };
}
