import type {
  SnapKind,
  SnapSettings,
  SnapVisualHint,
  TransformAxis,
  Vector3Tuple,
} from "../types";

type MoveSnapBodyMetrics = {
  id: string;
  center: Vector3Tuple;
  minZ: number;
  maxZ: number;
};

type MoveSnapState = {
  selectedBodyId: string;
  startPosition: Vector3Tuple;
  startCenter: Vector3Tuple;
  startMinZ: number;
  startMaxZ: number;
  otherBodies: MoveSnapBodyMetrics[];
};

type Candidate = {
  kind: SnapKind;
  rank: number;
  offset: number;
  label: string;
  point: Vector3Tuple;
  from?: Vector3Tuple;
};

const DEFAULT_GRID_INCREMENT = 10;
const SKETCH_ORIGIN_THRESHOLD = 4;
const SKETCH_GRID_THRESHOLD = 3;
const MOVE_ORIGIN_THRESHOLD = 3;
const MOVE_GRID_THRESHOLD = 2;
const MOVE_CENTER_THRESHOLD = 3;
const MOVE_GROUND_THRESHOLD = 2;
const MOVE_FACE_THRESHOLD = 2;

const AXIS_INDEX: Record<Exclude<TransformAxis, null>, 0 | 1 | 2> = {
  x: 0,
  y: 1,
  z: 2,
};

function toWorldHint(candidate: Candidate): SnapVisualHint {
  return {
    kind: candidate.kind,
    label: candidate.label,
    point: candidate.point,
    from: candidate.from,
  };
}

function snapScalar(value: number, increment: number) {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

function chooseCandidate(candidates: Candidate[]) {
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return Math.abs(a.offset) - Math.abs(b.offset);
  });
  return candidates[0];
}

export function createMoveSnapState({
  selectedBodyId,
  selectedStartPosition,
  selectedStartCenter,
  selectedStartMinZ,
  selectedStartMaxZ,
  bodies,
}: {
  selectedBodyId: string;
  selectedStartPosition: Vector3Tuple;
  selectedStartCenter: Vector3Tuple;
  selectedStartMinZ: number;
  selectedStartMaxZ: number;
  bodies: MoveSnapBodyMetrics[];
}): MoveSnapState {
  return {
    selectedBodyId,
    startPosition: selectedStartPosition,
    startCenter: selectedStartCenter,
    startMinZ: selectedStartMinZ,
    startMaxZ: selectedStartMaxZ,
    otherBodies: bodies.filter((body) => body.id !== selectedBodyId),
  };
}

export function resolveSketchSnap({
  localPoint,
  settings,
  gridIncrement = DEFAULT_GRID_INCREMENT,
}: {
  localPoint: [number, number];
  settings: SnapSettings;
  gridIncrement?: number;
}) {
  if (!settings.enabled) {
    return {
      point: localPoint,
      hint: null as { kind: SnapKind; label: string; localPoint: [number, number] } | null,
    };
  }

  const candidates: Array<{
    kind: SnapKind;
    rank: number;
    label: string;
    localPoint: [number, number];
    distance: number;
  }> = [];

  if (settings.origin) {
    const originDistance = Math.hypot(localPoint[0], localPoint[1]);
    if (originDistance <= SKETCH_ORIGIN_THRESHOLD) {
      candidates.push({
        kind: "origin",
        rank: 0,
        label: "Origin",
        localPoint: [0, 0],
        distance: originDistance,
      });
    }
  }

  if (settings.grid) {
    const snappedGrid: [number, number] = [
      snapScalar(localPoint[0], gridIncrement),
      snapScalar(localPoint[1], gridIncrement),
    ];
    const gridDistance = Math.hypot(
      localPoint[0] - snappedGrid[0],
      localPoint[1] - snappedGrid[1]
    );
    if (gridDistance <= SKETCH_GRID_THRESHOLD) {
      candidates.push({
        kind: "grid",
        rank: 1,
        label: "Grid",
        localPoint: snappedGrid,
        distance: gridDistance,
      });
    }
  }

  if (candidates.length === 0) {
    return { point: localPoint, hint: null };
  }

  candidates.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.distance - b.distance;
  });
  const best = candidates[0];
  return {
    point: best.localPoint,
    hint: {
      kind: best.kind,
      label: best.label,
      localPoint: best.localPoint,
    },
  };
}

export function resolveMoveSnap({
  axis,
  rawPosition,
  settings,
  state,
  gridIncrement = 0.1,
}: {
  axis: Exclude<TransformAxis, null>;
  rawPosition: Vector3Tuple;
  settings: SnapSettings;
  state: MoveSnapState;
  gridIncrement?: number;
}) {
  if (!settings.enabled) {
    return { position: rawPosition, hint: null as SnapVisualHint | null };
  }

  const axisIndex = AXIS_INDEX[axis];
  const delta =
    rawPosition[axisIndex] - state.startPosition[axisIndex];
  const center: Vector3Tuple = [...state.startCenter] as Vector3Tuple;
  center[axisIndex] += delta;
  const minZ = state.startMinZ + (axis === "z" ? delta : 0);
  const maxZ = state.startMaxZ + (axis === "z" ? delta : 0);

  const candidates: Candidate[] = [];

  if (settings.grid) {
    const target = snapScalar(rawPosition[axisIndex], gridIncrement);
    const offset = target - rawPosition[axisIndex];
    if (Math.abs(offset) <= MOVE_GRID_THRESHOLD) {
      const point: Vector3Tuple = [...center] as Vector3Tuple;
      point[axisIndex] = target;
      candidates.push({
        kind: "grid",
        rank: axis === "z" ? 4 : 2,
        offset,
        label: "Grid",
        point,
      });
    }
  }

  if (settings.origin) {
    const originOffset = -center[axisIndex];
    if (Math.abs(originOffset) <= MOVE_ORIGIN_THRESHOLD) {
      candidates.push({
        kind: "origin",
        rank: axis === "z" ? 3 : 1,
        offset: originOffset,
        label: "Origin Center",
        point: [0, 0, 0],
        from: [...center] as Vector3Tuple,
      });
    }
  }

  if (settings.body) {
    for (const body of state.otherBodies) {
      const centerOffset = body.center[axisIndex] - center[axisIndex];
      if (Math.abs(centerOffset) <= MOVE_CENTER_THRESHOLD) {
        candidates.push({
          kind: "body-center",
          rank: axis === "z" ? 2 : 0,
          offset: centerOffset,
          label: "Center to Center",
          point: body.center,
          from: [...center] as Vector3Tuple,
        });
      }
    }

    if (axis === "z") {
      const groundOffset = -minZ;
      if (Math.abs(groundOffset) <= MOVE_GROUND_THRESHOLD) {
        candidates.push({
          kind: "ground",
          rank: 0,
          offset: groundOffset,
          label: "Ground",
          point: [center[0], center[1], 0],
          from: [center[0], center[1], minZ],
        });
      }

      for (const body of state.otherBodies) {
        const faceOffsets = [
          body.minZ - minZ,
          body.maxZ - minZ,
          body.minZ - maxZ,
          body.maxZ - maxZ,
        ];
        for (const faceOffset of faceOffsets) {
          if (Math.abs(faceOffset) > MOVE_FACE_THRESHOLD) continue;
          const targetZ = Math.abs(body.minZ - minZ - faceOffset) < 1e-6
            ? body.minZ
            : Math.abs(body.maxZ - minZ - faceOffset) < 1e-6
              ? body.maxZ
              : Math.abs(body.minZ - maxZ - faceOffset) < 1e-6
                ? body.minZ
                : body.maxZ;
          candidates.push({
            kind: "face",
            rank: 1,
            offset: faceOffset,
            label: "Face Flush",
            point: [body.center[0], body.center[1], targetZ],
            from: [center[0], center[1], minZ],
          });
        }
      }
    }
  }

  const winner = chooseCandidate(candidates);
  if (!winner) {
    return { position: rawPosition, hint: null };
  }

  const snappedPosition = [...rawPosition] as Vector3Tuple;
  snappedPosition[axisIndex] += winner.offset;
  return {
    position: snappedPosition,
    hint: toWorldHint(winner),
  };
}
