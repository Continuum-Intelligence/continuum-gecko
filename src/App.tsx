import { useEffect, useMemo, useRef, useState } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import "./index.css";

// ============================================
// TYPES
// ============================================

type PieAction = "origin" | "top" | "front" | "right" | "iso";
type ViewAction =
  | PieAction
  | "back"
  | "left"
  | "bottom";
type ToolPieAction = "none" | "createWorkPlane";
type TransformMode = "move" | "rotate" | "scale" | null;
type TransformAxis = "x" | "y" | "z" | null;
type Vector3Tuple = [number, number, number];
type SelectableObjectKind = "plane";
type SelectionLevel = "object" | "face" | "edge" | "vertex";
type WorkPlaneEdgeId = "top" | "right" | "bottom" | "left";
type WorkPlaneVertexId =
  | "topLeft"
  | "topRight"
  | "bottomRight"
  | "bottomLeft";

type MousePosition = {
  x: number;
  y: number;
};

type WorkPlane = {
  id: string;
  name: string;
  type: "plane";
  visible: boolean;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
  size: {
    width: number;
    height: number;
  };
};

type SceneSelection = {
  objectKind: SelectableObjectKind;
  objectId: string;
  selectionLevel: SelectionLevel;
  subElementId: string | null;
} | null;

type DistanceDimension = {
  id: string;
  kind: "distance";
  from: NonNullable<SceneSelection>;
  to: NonNullable<SceneSelection>;
  value: number;
};

type SceneSnapshot = {
  workPlanes: WorkPlane[];
  dimensions: DistanceDimension[];
  primarySelection: SceneSelection;
  secondarySelection: SceneSelection;
};

type SceneHistoryEntry = {
  id: string;
  label: string;
  snapshot: SceneSnapshot;
};

type ClipboardSceneObject =
  | {
      kind: "plane";
      plane: WorkPlane;
    }
  | null;

type TransformTarget = {
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
};

type TransformFieldGroup = "position" | "rotation" | "scale";
type TransformFieldAxis = "x" | "y" | "z";

type EditingTransformField = {
  group: TransformFieldGroup;
  axis: TransformFieldAxis;
} | null;

type TransformDragState = {
  mode: Exclude<TransformMode, null>;
  axis: Exclude<TransformAxis, null>;
  startMouse: MousePosition;
  startPosition: Vector3Tuple;
  startRotation: Vector3Tuple;
  startScale: Vector3Tuple;
  selection: NonNullable<SceneSelection>;
  startSnapshot: SceneSnapshot;
} | null;

type CameraState = {
  offset: THREE.Vector3;
  up: THREE.Vector3;
};

type WorkPlaneSubElementHighlight = {
  faceRole: "primary" | "secondary" | null;
  selectedEdgeRoleById: Record<WorkPlaneEdgeId, "primary" | "secondary" | null>;
  selectedVertexRoleById: Record<
    WorkPlaneVertexId,
    "primary" | "secondary" | null
  >;
};

type DimensionOverlayArrow = [MousePosition, MousePosition, MousePosition];

type DimensionOverlayItem = {
  id: string;
  start: MousePosition;
  end: MousePosition;
  label: MousePosition;
  value: number;
  fromArrow: DimensionOverlayArrow;
  toArrow: DimensionOverlayArrow;
};

// ============================================
// CONSTANTS
// ============================================

const WORLD_UP = new THREE.Vector3(0, 0, 1);
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(5, -5, 5);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);
const VIEW_DISTANCE = 8;
const MOVE_SNAP_INCREMENT = 0.1;
const ROTATION_SNAP_INCREMENT = 1;
const SCALE_SNAP_INCREMENT = 0.1;
const MIN_SCALE = 0.1;
const PIXEL_TO_MM = 0.1;
const PIXEL_TO_DEGREES = 0.5;
const PIXEL_TO_SCALE = 0.01;
const WORK_PLANE_FACE_ID = "face";
const WORK_PLANE_EDGE_IDS: WorkPlaneEdgeId[] = ["top", "right", "bottom", "left"];
const WORK_PLANE_VERTEX_IDS: WorkPlaneVertexId[] = [
  "topLeft",
  "topRight",
  "bottomRight",
  "bottomLeft",
];
const disableRaycast = () => null;
const nonSelectableProps = {
  raycast: disableRaycast,
} as unknown as Record<string, unknown>;

// ============================================
// SNAPSHOT / CLONE HELPERS
// ============================================

function cloneSelection(selection: SceneSelection): SceneSelection {
  return selection ? { ...selection } : null;
}

function cloneDistanceDimension(dimension: DistanceDimension): DistanceDimension {
  return {
    ...dimension,
    from: { ...dimension.from },
    to: { ...dimension.to },
  };
}

function cloneWorkPlane(plane: WorkPlane): WorkPlane {
  return {
    ...plane,
    position: [...plane.position] as Vector3Tuple,
    rotation: [...plane.rotation] as Vector3Tuple,
    scale: [...plane.scale] as Vector3Tuple,
    size: { ...plane.size },
  };
}

function cloneSceneSnapshot(snapshot: SceneSnapshot): SceneSnapshot {
  return {
    workPlanes: snapshot.workPlanes.map(cloneWorkPlane),
    dimensions: snapshot.dimensions.map(cloneDistanceDimension),
    primarySelection: cloneSelection(snapshot.primarySelection),
    secondarySelection: cloneSelection(snapshot.secondarySelection),
  };
}

function snapshotsEqual(a: SceneSnapshot, b: SceneSnapshot) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ============================================
// TRANSFORM / SNAP HELPERS
// ============================================

function snapToIncrement(value: number, increment = MOVE_SNAP_INCREMENT) {
  return Math.round(value / increment) * increment;
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function createEmptyPlaneHighlight(): WorkPlaneSubElementHighlight {
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

function applyPlaneSelectionRole(
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

function getPlaneSelectionHighlight(
  primarySelection: SceneSelection,
  secondarySelection: SceneSelection,
  planeId: string
): WorkPlaneSubElementHighlight {
  const highlight = createEmptyPlaneHighlight();
  applyPlaneSelectionRole(highlight, primarySelection, planeId, "primary");
  applyPlaneSelectionRole(highlight, secondarySelection, planeId, "secondary");
  return highlight;
}

function getPlaneBySelection(
  workPlanes: WorkPlane[],
  selection: SceneSelection
) {
  if (!selection || selection.objectKind !== "plane") return null;
  return workPlanes.find((plane) => plane.id === selection.objectId) ?? null;
}

function createSelection(
  objectKind: SelectableObjectKind,
  objectId: string,
  selectionLevel: SelectionLevel,
  subElementId: string | null = null
): NonNullable<SceneSelection> {
  return {
    objectKind,
    objectId,
    selectionLevel,
    subElementId,
  };
}

function getWorkPlaneVertexLocalPoint(
  plane: WorkPlane,
  vertexId: WorkPlaneVertexId
): THREE.Vector3 {
  const halfWidth = plane.size.width / 2;
  const halfHeight = plane.size.height / 2;

  if (vertexId === "topLeft") return new THREE.Vector3(-halfWidth, halfHeight, 0);
  if (vertexId === "topRight") return new THREE.Vector3(halfWidth, halfHeight, 0);
  if (vertexId === "bottomRight") {
    return new THREE.Vector3(halfWidth, -halfHeight, 0);
  }

  return new THREE.Vector3(-halfWidth, -halfHeight, 0);
}

function getWorkPlaneEdgeLocalPoints(
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

function getPlaneTransformMatrix(plane: WorkPlane) {
  const position = new THREE.Vector3(...plane.position);
  const rotation = new THREE.Euler(...plane.rotation);
  const quaternion = new THREE.Quaternion().setFromEuler(rotation);
  const scale = new THREE.Vector3(...plane.scale);

  return new THREE.Matrix4().compose(position, quaternion, scale);
}

function getWorkPlaneWorldPoint(plane: WorkPlane, localPoint: THREE.Vector3) {
  return localPoint.clone().applyMatrix4(getPlaneTransformMatrix(plane));
}

function getSelectionAnchorPoint(
  selection: SceneSelection,
  workPlanes: WorkPlane[]
): THREE.Vector3 | null {
  const plane = getPlaneBySelection(workPlanes, selection);
  if (!plane || !selection) return null;

  if (selection.selectionLevel === "object" || selection.selectionLevel === "face") {
    return getWorkPlaneWorldPoint(plane, new THREE.Vector3(0, 0, 0));
  }

  if (selection.selectionLevel === "edge" && selection.subElementId) {
    const [start, end] = getWorkPlaneEdgeLocalPoints(
      plane,
      selection.subElementId as WorkPlaneEdgeId
    );

    return getWorkPlaneWorldPoint(
      plane,
      start.clone().lerp(end, 0.5)
    );
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

function getDistanceBetweenSelections(
  from: SceneSelection,
  to: SceneSelection,
  workPlanes: WorkPlane[]
) {
  const fromPoint = getSelectionAnchorPoint(from, workPlanes);
  const toPoint = getSelectionAnchorPoint(to, workPlanes);

  if (!fromPoint || !toPoint) return null;

  return fromPoint.distanceTo(toPoint);
}

function isDimensionEligibleSelection(selection: SceneSelection) {
  if (!selection) return false;
  if (selection.objectKind !== "plane") return false;

  return (
    selection.selectionLevel === "object" ||
    selection.selectionLevel === "face" ||
    selection.selectionLevel === "edge" ||
    selection.selectionLevel === "vertex"
  );
}

function areSelectionsEqual(a: SceneSelection, b: SceneSelection) {
  if (!a || !b) return false;

  return (
    a.objectKind === b.objectKind &&
    a.objectId === b.objectId &&
    a.selectionLevel === b.selectionLevel &&
    a.subElementId === b.subElementId
  );
}

function dimensionExists(
  dimensions: DistanceDimension[],
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

function formatSelectionLevel(selection: SceneSelection) {
  if (!selection) return "None";
  return selection.selectionLevel;
}

function projectWorldPointToScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  width: number,
  height: number
) {
  const projected = point.clone().project(camera);

  return {
    x: ((projected.x + 1) * width) / 2,
    y: ((-projected.y + 1) * height) / 2,
  };
}

function createOverlayArrow(
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

function getScaleDisplayBase(
  plane: WorkPlane | null,
  axis: TransformFieldAxis
) {
  if (!plane) return 1;
  if (axis === "x") return plane.size.width;
  if (axis === "y") return plane.size.height;
  return 1;
}

// ============================================
// CAMERA VIEW HELPERS
// ============================================

function snapVectorComponent(
  position: Vector3Tuple,
  axis: Exclude<TransformAxis, null>,
  value: number
): Vector3Tuple {
  if (axis === "x") return [snapToIncrement(value), position[1], position[2]];
  if (axis === "y") return [position[0], snapToIncrement(value), position[2]];
  return [position[0], position[1], snapToIncrement(value)];
}

function getViewPosition(action: ViewAction) {
  if (action === "top") return new THREE.Vector3(0, 0, VIEW_DISTANCE);
  if (action === "bottom") return new THREE.Vector3(0, 0, -VIEW_DISTANCE);
  if (action === "front") return new THREE.Vector3(0, -VIEW_DISTANCE, 0);
  if (action === "back") return new THREE.Vector3(0, VIEW_DISTANCE, 0);
  if (action === "right") return new THREE.Vector3(VIEW_DISTANCE, 0, 0);
  if (action === "left") return new THREE.Vector3(-VIEW_DISTANCE, 0, 0);
  return DEFAULT_CAMERA_POSITION.clone();
}

// ============================================
// CAMERA SYSTEM
// ============================================

function CameraSetup() {
  const { camera } = useThree();

  useEffect(() => {
    camera.up.copy(WORLD_UP);
    camera.lookAt(DEFAULT_CAMERA_TARGET);
  }, [camera]);

  return null;
}

// ============================================
// VIEWPORT HELPERS
// ============================================

function BaseGrid() {
  const extent = 250;
  const minorStep = 1;
  const majorStep = 10;
  const { minorPositions, majorPositions } = useMemo(() => {
    const minor: number[] = [];
    const major: number[] = [];

    for (let i = -extent; i <= extent; i += minorStep) {
      if (i % majorStep === 0) {
        major.push(i);
      } else {
        minor.push(i);
      }
    }

    return {
      minorPositions: minor,
      majorPositions: major,
    };
  }, []);

  return (
    <group>
      {minorPositions.map((i) => (
        <group key={`minor-${i}`}>
          <line {...nonSelectableProps}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([-extent, i, 0, extent, i, 0]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#e4e7eb" />
          </line>

          <line {...nonSelectableProps}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([i, -extent, 0, i, extent, 0]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#e4e7eb" />
          </line>
        </group>
      ))}

      {majorPositions.map((i) => (
        <group key={`major-${i}`}>
          <line {...nonSelectableProps}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([-extent, i, 0, extent, i, 0]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#9aa3af" />
          </line>

          <line {...nonSelectableProps}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([i, -extent, 0, i, extent, 0]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#9aa3af" />
          </line>
        </group>
      ))}
    </group>
  );
}

function Axes() {
  const extent = 250;

  return (
    <group>
      <line {...nonSelectableProps}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([-extent, 0, 0, extent, 0, 0]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#ff4d4f" />
      </line>

      <line {...nonSelectableProps}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, -extent, 0, 0, extent, 0]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#22c55e" />
      </line>

      <line {...nonSelectableProps}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, 0, -extent, 0, 0, extent]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#3b82f6" />
      </line>
    </group>
  );
}

function OriginMarker() {
  return (
    <mesh position={[0, 0, 0]} {...nonSelectableProps}>
      <sphereGeometry args={[0.03, 16, 16]} />
      <meshBasicMaterial color="#222222" />
    </mesh>
  );
}

// ============================================
// SCENE OBJECTS
// ============================================

function WorkPlaneMesh({
  plane,
  primarySelection,
  secondarySelection,
  onSelect,
}: {
  plane: WorkPlane;
  primarySelection: SceneSelection;
  secondarySelection: SceneSelection;
  onSelect: (selection: SceneSelection, additive: boolean) => void;
}) {
  const planeGeometry = useMemo(
    () => new THREE.PlaneGeometry(plane.size.width, plane.size.height),
    [plane.size.height, plane.size.width]
  );
  const outlineGeometry = useMemo(
    () => new THREE.EdgesGeometry(planeGeometry),
    [planeGeometry]
  );

  useEffect(() => {
    return () => {
      outlineGeometry.dispose();
      planeGeometry.dispose();
    };
  }, [outlineGeometry, planeGeometry]);

  const highlight = getPlaneSelectionHighlight(
    primarySelection,
    secondarySelection,
    plane.id
  );
  const edgeLineZOffset = 0.02;
  const edgeThickness = 3;
  const vertexRadius = 2.25;
  const getRoleColor = (role: "primary" | "secondary" | null) =>
    role === "secondary" ? "#f59e0b" : "#0f172a";
  const getFaceColor = (role: "primary" | "secondary" | null) =>
    role === "secondary" ? "#fbbf24" : "#38bdf8";

  const renderEdgeHitTarget = (edgeId: WorkPlaneEdgeId) => {
    const halfWidth = plane.size.width / 2;
    const halfHeight = plane.size.height / 2;
    const isHorizontal = edgeId === "top" || edgeId === "bottom";

    let position: Vector3Tuple = [0, halfHeight, 0];
    if (edgeId === "right") position = [halfWidth, 0, 0];
    if (edgeId === "bottom") position = [0, -halfHeight, 0];
    if (edgeId === "left") position = [-halfWidth, 0, 0];

    return (
      <mesh
        key={edgeId}
        position={position}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(
            createSelection("plane", plane.id, "edge", edgeId),
            event.shiftKey
          );
        }}
      >
        <boxGeometry
          args={[
            isHorizontal ? plane.size.width : edgeThickness * 2,
            isHorizontal ? edgeThickness * 2 : plane.size.height,
            0.8,
          ]}
        />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    );
  };

  const renderVertexHitTarget = (vertexId: WorkPlaneVertexId) => {
    const localPoint = getWorkPlaneVertexLocalPoint(plane, vertexId);

    return (
      <mesh
        key={vertexId}
        position={[localPoint.x, localPoint.y, localPoint.z]}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(
            createSelection("plane", plane.id, "vertex", vertexId),
            event.shiftKey
          );
        }}
      >
        <sphereGeometry args={[vertexRadius, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    );
  };

  return (
    <group position={plane.position} rotation={plane.rotation} scale={plane.scale}>
      <mesh
        renderOrder={1}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(
            createSelection("plane", plane.id, "face", WORK_PLANE_FACE_ID),
            event.shiftKey
          );
        }}
      >
        <primitive object={planeGeometry} attach="geometry" />
        <meshBasicMaterial
          color={highlight.faceRole ? getFaceColor(highlight.faceRole) : "#7dd3fc"}
          transparent
          opacity={highlight.faceRole ? 0.3 : 0.16}
          side={THREE.DoubleSide}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>

      <lineSegments position={[0, 0, 0.02]} renderOrder={2}>
        <primitive object={outlineGeometry} attach="geometry" />
        <lineBasicMaterial
          color={highlight.faceRole ? getRoleColor(highlight.faceRole) : "#7c8b9e"}
          transparent
          opacity={highlight.faceRole ? 0.95 : 0.68}
        />
      </lineSegments>

      {WORK_PLANE_EDGE_IDS.map((edgeId) => {
        const [start, end] = getWorkPlaneEdgeLocalPoints(plane, edgeId);
        const role = highlight.selectedEdgeRoleById[edgeId];
        const edgePoints = new Float32Array([
          start.x,
          start.y,
          edgeLineZOffset,
          end.x,
          end.y,
          edgeLineZOffset,
        ]);

        return (
          <group key={`edge-highlight-${edgeId}`}>
            <line {...nonSelectableProps}>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[edgePoints, 3]}
                />
              </bufferGeometry>
              <lineBasicMaterial
                color={getRoleColor(role)}
                transparent
                linewidth={8}
                opacity={role ? 0.92 : 0}
              />
            </line>
            {renderEdgeHitTarget(edgeId)}
          </group>
        );
      })}

      {WORK_PLANE_VERTEX_IDS.map((vertexId) => {
        const localPoint = getWorkPlaneVertexLocalPoint(plane, vertexId);
        const role = highlight.selectedVertexRoleById[vertexId];

        return (
          <group key={`vertex-highlight-${vertexId}`}>
            <mesh
              position={[localPoint.x, localPoint.y, edgeLineZOffset]}
              scale={role ? 1 : 0.85}
              {...nonSelectableProps}
            >
              <sphereGeometry args={[0.5, 16, 16]} />
              <meshBasicMaterial
                color={getRoleColor(role)}
                transparent
                opacity={role ? 0.95 : 0}
              />
            </mesh>
            {renderVertexHitTarget(vertexId)}
          </group>
        );
      })}
    </group>
  );
}

function WorkPlanes({
  workPlanes,
  primarySelection,
  secondarySelection,
  onSelect,
}: {
  workPlanes: WorkPlane[];
  primarySelection: SceneSelection;
  secondarySelection: SceneSelection;
  onSelect: (selection: SceneSelection, additive: boolean) => void;
}) {
  return (
    <>
      {workPlanes
        .filter((plane) => plane.visible)
        .map((plane) => (
          <WorkPlaneMesh
            key={plane.id}
            plane={plane}
            primarySelection={primarySelection}
            secondarySelection={secondarySelection}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

function DimensionOverlayTracker({
  dimensions,
  workPlanes,
  onOverlayChange,
}: {
  dimensions: DistanceDimension[];
  workPlanes: WorkPlane[];
  onOverlayChange: (items: DimensionOverlayItem[]) => void;
}) {
  const { camera, size } = useThree();
  const lastSerializedRef = useRef("");

  useFrame(() => {
    const nextItems = dimensions.flatMap((dimension) => {
      const fromPoint = getSelectionAnchorPoint(dimension.from, workPlanes);
      const toPoint = getSelectionAnchorPoint(dimension.to, workPlanes);

      if (!fromPoint || !toPoint) return [];

      const start = projectWorldPointToScreen(fromPoint, camera, size.width, size.height);
      const end = projectWorldPointToScreen(toPoint, camera, size.width, size.height);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.sqrt(dx * dx + dy * dy);

      if (length < 1) return [];

      const direction = { x: dx / length, y: dy / length };
      const midpoint = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2 - 18,
      };

      return [
        {
          id: dimension.id,
          start,
          end,
          label: midpoint,
          value: dimension.value,
          fromArrow: createOverlayArrow(start, direction, 12, 5),
          toArrow: createOverlayArrow(end, { x: -direction.x, y: -direction.y }, 12, 5),
        },
      ];
    });

    const serialized = JSON.stringify(nextItems);
    if (serialized === lastSerializedRef.current) return;

    lastSerializedRef.current = serialized;
    onOverlayChange(nextItems);
  });

  return null;
}

// ============================================
// TRANSFORM GIZMOS
// ============================================

function MoveAxisHandle({
  axis,
  color,
  hoveredAxis,
  activeAxis,
  onHover,
  onPointerDown,
}: {
  axis: Exclude<TransformAxis, null>;
  color: string;
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHover: (axis: TransformAxis) => void;
  onPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  const axisLength = 36;
  const coneOffset = axisLength / 2 + 3;
  const hasFocusAxis = hoveredAxis !== null || activeAxis !== null;
  const isActive = hoveredAxis === axis || activeAxis === axis;
  const opacity = isActive ? 1 : hasFocusAxis ? 0.24 : 0.92;
  const coneScale = isActive ? 1.22 : 1;
  const lineScale = isActive ? 1.08 : 1;

  let linePoints = new Float32Array([
    -axisLength / 2,
    0,
    0,
    axisLength / 2,
    0,
    0,
  ]);
  let conePosition: Vector3Tuple = [coneOffset, 0, 0];
  let coneRotation: Vector3Tuple = [0, 0, -Math.PI / 2];
  let hitPosition: Vector3Tuple = [axisLength / 4 + 2, 0, 0];
  let hitRotation: Vector3Tuple = [0, 0, -Math.PI / 2];

  if (axis === "y") {
    linePoints = new Float32Array([0, -axisLength / 2, 0, 0, axisLength / 2, 0]);
    conePosition = [0, coneOffset, 0];
    coneRotation = [0, 0, 0];
    hitPosition = [0, axisLength / 4 + 2, 0];
    hitRotation = [0, 0, 0];
  }

  if (axis === "z") {
    linePoints = new Float32Array([0, 0, -axisLength / 2, 0, 0, axisLength / 2]);
    conePosition = [0, 0, coneOffset];
    coneRotation = [Math.PI / 2, 0, 0];
    hitPosition = [0, 0, axisLength / 4 + 2];
    hitRotation = [Math.PI / 2, 0, 0];
  }

  return (
    <group>
      <line {...nonSelectableProps}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[linePoints, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={opacity} />
      </line>

      <mesh
        position={conePosition}
        rotation={coneRotation}
        scale={coneScale}
        {...nonSelectableProps}
      >
        <coneGeometry args={[1.4, 4, 16]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>

      <mesh
        position={hitPosition}
        rotation={hitRotation}
        scale={[lineScale, 1, 1]}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(axis);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          if (activeAxis !== axis) {
            onHover(null);
          }
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(axis, event);
        }}
      >
        <cylinderGeometry args={[4, 4, axisLength / 2 + 10, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function getAxisVisualState(
  axis: Exclude<TransformAxis, null>,
  hoveredAxis: TransformAxis,
  activeAxis: TransformAxis
) {
  const hasFocusAxis = hoveredAxis !== null || activeAxis !== null;
  const isActive = hoveredAxis === axis || activeAxis === axis;

  return {
    opacity: isActive ? 1 : hasFocusAxis ? 0.24 : 0.92,
    emphasisScale: isActive ? 1.18 : 1,
    lineScale: isActive ? 1.08 : 1,
  };
}

function MoveGizmo({
  hoveredAxis,
  activeAxis,
  onHoverAxis,
  onAxisPointerDown,
}: {
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHoverAxis: (axis: TransformAxis) => void;
  onAxisPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  return (
    <group>
      <MoveAxisHandle
        axis="x"
        color="#ff4d4f"
        hoveredAxis={hoveredAxis}
        activeAxis={activeAxis}
        onHover={onHoverAxis}
        onPointerDown={onAxisPointerDown}
      />
      <MoveAxisHandle
        axis="y"
        color="#22c55e"
        hoveredAxis={hoveredAxis}
        activeAxis={activeAxis}
        onHover={onHoverAxis}
        onPointerDown={onAxisPointerDown}
      />
      <MoveAxisHandle
        axis="z"
        color="#3b82f6"
        hoveredAxis={hoveredAxis}
        activeAxis={activeAxis}
        onHover={onHoverAxis}
        onPointerDown={onAxisPointerDown}
      />
    </group>
  );
}

function RotateAxisHandle({
  axis,
  color,
  hoveredAxis,
  activeAxis,
  onHover,
  onPointerDown,
}: {
  axis: Exclude<TransformAxis, null>;
  color: string;
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHover: (axis: TransformAxis) => void;
  onPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  const { opacity, emphasisScale } = getAxisVisualState(
    axis,
    hoveredAxis,
    activeAxis
  );

  let rotation: Vector3Tuple = [0, 0, 0];

  if (axis === "x") {
    rotation = [0, Math.PI / 2, 0];
  }

  if (axis === "y") {
    rotation = [Math.PI / 2, 0, 0];
  }

  return (
    <group>
      <mesh rotation={rotation} scale={emphasisScale} {...nonSelectableProps}>
        <torusGeometry args={[18, axis === hoveredAxis || axis === activeAxis ? 0.55 : 0.35, 18, 72]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
      <mesh
        rotation={rotation}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(axis);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          if (activeAxis !== axis) {
            onHover(null);
          }
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(axis, event);
        }}
      >
        <torusGeometry args={[18, 2.2, 18, 72]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function RotateGizmo({
  hoveredAxis,
  activeAxis,
  onHoverAxis,
  onAxisPointerDown,
}: {
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHoverAxis: (axis: TransformAxis) => void;
  onAxisPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  return (
    <group>
      <RotateAxisHandle
        axis="x"
        color="#ff4d4f"
        hoveredAxis={hoveredAxis}
        activeAxis={activeAxis}
        onHover={onHoverAxis}
        onPointerDown={onAxisPointerDown}
      />
      <RotateAxisHandle
        axis="y"
        color="#22c55e"
        hoveredAxis={hoveredAxis}
        activeAxis={activeAxis}
        onHover={onHoverAxis}
        onPointerDown={onAxisPointerDown}
      />
      <RotateAxisHandle
        axis="z"
        color="#3b82f6"
        hoveredAxis={hoveredAxis}
        activeAxis={activeAxis}
        onHover={onHoverAxis}
        onPointerDown={onAxisPointerDown}
      />
    </group>
  );
}

function ScaleAxisHandle({
  axis,
  color,
  hoveredAxis,
  activeAxis,
  onHover,
  onPointerDown,
}: {
  axis: Exclude<TransformAxis, null>;
  color: string;
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHover: (axis: TransformAxis) => void;
  onPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  const axisLength = 30;
  const handleOffset = axisLength / 2 + 2;
  const { opacity, emphasisScale } = getAxisVisualState(
    axis,
    hoveredAxis,
    activeAxis
  );

  let linePoints = new Float32Array([
    -axisLength / 2,
    0,
    0,
    axisLength / 2,
    0,
    0,
  ]);
  let handlePosition: Vector3Tuple = [handleOffset, 0, 0];
  let hitPosition: Vector3Tuple = [axisLength / 4 + 2, 0, 0];
  let hitRotation: Vector3Tuple = [0, 0, -Math.PI / 2];

  if (axis === "y") {
    linePoints = new Float32Array([0, -axisLength / 2, 0, 0, axisLength / 2, 0]);
    handlePosition = [0, handleOffset, 0];
    hitPosition = [0, axisLength / 4 + 2, 0];
    hitRotation = [0, 0, 0];
  }

  if (axis === "z") {
    linePoints = new Float32Array([0, 0, -axisLength / 2, 0, 0, axisLength / 2]);
    handlePosition = [0, 0, handleOffset];
    hitPosition = [0, 0, axisLength / 4 + 2];
    hitRotation = [Math.PI / 2, 0, 0];
  }

  return (
    <group>
      <line {...nonSelectableProps}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[linePoints, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={opacity} />
      </line>
      <mesh position={handlePosition} scale={emphasisScale} {...nonSelectableProps}>
        <boxGeometry args={[2.4, 2.4, 2.4]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
      <mesh
        position={hitPosition}
        rotation={hitRotation}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(axis);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          if (activeAxis !== axis) {
            onHover(null);
          }
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(axis, event);
        }}
      >
        <cylinderGeometry args={[4, 4, axisLength / 2 + 8, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function ScaleGizmo({
  hoveredAxis,
  activeAxis,
  onHoverAxis,
  onAxisPointerDown,
}: {
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHoverAxis: (axis: TransformAxis) => void;
  onAxisPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  return (
    <group>
      <ScaleAxisHandle
        axis="x"
        color="#ff4d4f"
        hoveredAxis={hoveredAxis}
        activeAxis={activeAxis}
        onHover={onHoverAxis}
        onPointerDown={onAxisPointerDown}
      />
      <ScaleAxisHandle
        axis="y"
        color="#22c55e"
        hoveredAxis={hoveredAxis}
        activeAxis={activeAxis}
        onHover={onHoverAxis}
        onPointerDown={onAxisPointerDown}
      />
      <ScaleAxisHandle
        axis="z"
        color="#3b82f6"
        hoveredAxis={hoveredAxis}
        activeAxis={activeAxis}
        onHover={onHoverAxis}
        onPointerDown={onAxisPointerDown}
      />
    </group>
  );
}

function TransformGizmo({
  mode,
  target,
  hoveredAxis,
  activeAxis,
  onHoverAxis,
  onAxisPointerDown,
}: {
  mode: TransformMode;
  target: TransformTarget | null;
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHoverAxis: (axis: TransformAxis) => void;
  onAxisPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  if (!mode || !target) return null;

  return (
    <group position={target.position} rotation={target.rotation}>
      {mode === "move" && (
        <MoveGizmo
          hoveredAxis={hoveredAxis}
          activeAxis={activeAxis}
          onHoverAxis={onHoverAxis}
          onAxisPointerDown={onAxisPointerDown}
        />
      )}
      {mode === "rotate" && (
        <RotateGizmo
          hoveredAxis={hoveredAxis}
          activeAxis={activeAxis}
          onHoverAxis={onHoverAxis}
          onAxisPointerDown={onAxisPointerDown}
        />
      )}
      {mode === "scale" && (
        <ScaleGizmo
          hoveredAxis={hoveredAxis}
          activeAxis={activeAxis}
          onHoverAxis={onHoverAxis}
          onAxisPointerDown={onAxisPointerDown}
        />
      )}
    </group>
  );
}

// ============================================
// MAIN SCENE
// ============================================

function CameraObserver({
  controlsRef,
  cameraStateRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  cameraStateRef: React.RefObject<CameraState>;
}) {
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    cameraStateRef.current.offset
      .copy(controls.object.position)
      .sub(controls.target);
    cameraStateRef.current.up.copy(controls.object.up);
  });

  return null;
}

function CameraAnimator({
  controlsRef,
  desiredPositionRef,
  desiredTargetRef,
  isAnimatingRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  desiredPositionRef: React.RefObject<THREE.Vector3>;
  desiredTargetRef: React.RefObject<THREE.Vector3>;
  isAnimatingRef: React.RefObject<boolean>;
}) {
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || !isAnimatingRef.current) return;

    const camera = controls.object;
    const desiredPosition = desiredPositionRef.current;
    const desiredTarget = desiredTargetRef.current;

    camera.position.lerp(desiredPosition, 0.12);
    controls.target.lerp(desiredTarget, 0.12);

    camera.up.copy(WORLD_UP);
    controls.update();

    const positionSettled =
      camera.position.distanceToSquared(desiredPosition) < 0.0001;
    const targetSettled =
      controls.target.distanceToSquared(desiredTarget) < 0.0001;

    if (positionSettled && targetSettled) {
      camera.position.copy(desiredPosition);
      controls.target.copy(desiredTarget);
      controls.update();
      isAnimatingRef.current = false;
    }
  });

  return null;
}

function Scene({
  controlsRef,
  desiredPositionRef,
  desiredTargetRef,
  isAnimatingRef,
  cameraStateRef,
  workPlanes,
  dimensions,
  primarySelection,
  secondarySelection,
  onSelectObject,
  onDimensionOverlayChange,
  transformMode,
  transformTarget,
  hoveredTransformAxis,
  transformDragState,
  onHoverTransformAxis,
  onTransformAxisPointerDown,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  desiredPositionRef: React.RefObject<THREE.Vector3>;
  desiredTargetRef: React.RefObject<THREE.Vector3>;
  isAnimatingRef: React.RefObject<boolean>;
  cameraStateRef: React.RefObject<CameraState>;
  workPlanes: WorkPlane[];
  dimensions: DistanceDimension[];
  primarySelection: SceneSelection;
  secondarySelection: SceneSelection;
  onSelectObject: (selection: SceneSelection, additive: boolean) => void;
  onDimensionOverlayChange: (items: DimensionOverlayItem[]) => void;
  transformMode: TransformMode;
  transformTarget: TransformTarget | null;
  hoveredTransformAxis: TransformAxis;
  transformDragState: TransformDragState;
  onHoverTransformAxis: (axis: TransformAxis) => void;
  onTransformAxisPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  return (
    <Canvas
      camera={{ position: [5, -5, 5], fov: 50, near: 0.1, far: 1000 }}
      style={{ background: "#f5f6f8" }}
      onPointerMissed={(event) => {
        onSelectObject(null, !!event.shiftKey);
      }}
    >
      <CameraSetup />
      <CameraAnimator
        controlsRef={controlsRef}
        desiredPositionRef={desiredPositionRef}
        desiredTargetRef={desiredTargetRef}
        isAnimatingRef={isAnimatingRef}
      />
      <CameraObserver
        controlsRef={controlsRef}
        cameraStateRef={cameraStateRef}
      />
      <ambientLight intensity={1} />
      <WorkPlanes
        workPlanes={workPlanes}
        primarySelection={primarySelection}
        secondarySelection={secondarySelection}
        onSelect={onSelectObject}
      />
      <DimensionOverlayTracker
        dimensions={dimensions}
        workPlanes={workPlanes}
        onOverlayChange={onDimensionOverlayChange}
      />
      <TransformGizmo
        mode={transformMode}
        target={transformTarget}
        hoveredAxis={hoveredTransformAxis}
        activeAxis={transformDragState?.axis ?? null}
        onHoverAxis={onHoverTransformAxis}
        onAxisPointerDown={onTransformAxisPointerDown}
      />
      <BaseGrid />
      <Axes />
      <OriginMarker />
      <OrbitControls
        ref={controlsRef}
        target={[0, 0, 0]}
        enabled={!transformDragState}
      />
    </Canvas>
  );
}

// ============================================
// RADIAL MENUS
// ============================================

function CameraPieMenu({
  center,
  selectedAction,
}: {
  center: MousePosition;
  selectedAction: PieAction;
}) {
  const radius = 72;

  const items: Array<{
    action: PieAction;
    label: string;
    x: number;
    y: number;
  }> = [
    { action: "top", label: "Top", x: 0, y: -radius },
    { action: "front", label: "Front", x: 0, y: radius },
    { action: "right", label: "Right", x: radius, y: 0 },
    { action: "iso", label: "Iso", x: radius * 0.7, y: -radius * 0.7 },
  ];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      <div
        className="camera-pie-surface"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y,
          width: 140,
          height: 140,
          borderRadius: "50%",
        }}
      />

      {items.map((item) => {
        const active = selectedAction === item.action;

        return (
          <div
            key={item.action}
            className="camera-pie-item"
            style={{
              position: "absolute",
              left: center.x + item.x,
              top: center.y + item.y,
              padding: "8px 12px",
              borderRadius: 999,
              background: active ? "#5f5f63" : "#2f2f33",
              border: active ? "1px solid #a8a8ad" : "1px solid #49494f",
              color: active ? "#f7f7f8" : "#d6d6d9",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              boxShadow: "0 8px 16px rgba(0,0,0,0.22)",
              animationDelay: `${80 + Math.abs(item.x) + Math.abs(item.y)}ms`,
            }}
          >
            {item.label}
          </div>
        );
      })}

      <div
        className="camera-pie-item camera-pie-center"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y,
          width: 58,
          height: 58,
          borderRadius: "50%",
          background: selectedAction === "origin" ? "#707076" : "#1f1f22",
          border:
            selectedAction === "origin"
              ? "1px solid #d8d8dc"
              : "1px solid #47474c",
          color: "#f3f3f4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.1,
          boxShadow: "0 10px 18px rgba(0,0,0,0.28)",
        }}
      >
        Focus
        <br />
        Origin
      </div>
    </div>
  );
}

function ToolsPieMenu({
  center,
  selectedAction,
}: {
  center: MousePosition;
  selectedAction: ToolPieAction;
}) {
  const radius = 72;
  const toolActive = selectedAction === "createWorkPlane";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      <div
        className="camera-pie-surface"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y,
          width: 140,
          height: 140,
          borderRadius: "50%",
        }}
      />

      <div
        className="camera-pie-item"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y - radius,
          padding: "8px 12px",
          borderRadius: 999,
          background: toolActive ? "#5f5f63" : "#2f2f33",
          border: toolActive ? "1px solid #a8a8ad" : "1px solid #49494f",
          color: toolActive ? "#f7f7f8" : "#d6d6d9",
          fontSize: 13,
          fontWeight: 600,
          whiteSpace: "nowrap",
          boxShadow: "0 8px 16px rgba(0,0,0,0.22)",
          animationDelay: "120ms",
        }}
      >
        Create Work Plane
      </div>

      <div
        className="camera-pie-item camera-pie-center"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y,
          width: 58,
          height: 58,
          borderRadius: "50%",
          background: "#1f1f22",
          border: "1px solid #47474c",
          color: "#f3f3f4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.1,
          boxShadow: "0 10px 18px rgba(0,0,0,0.28)",
        }}
      >
        Tools
      </div>
    </div>
  );
}

function TransformPieMenu({
  center,
  selectedMode,
}: {
  center: MousePosition;
  selectedMode: TransformMode;
}) {
  const radius = 72;

  const items: Array<{
    mode: Exclude<TransformMode, null>;
    label: string;
    x: number;
    y: number;
  }> = [
    { mode: "move", label: "Move", x: 0, y: -radius },
    { mode: "rotate", label: "Rotate", x: radius, y: 0 },
    { mode: "scale", label: "Scale", x: 0, y: radius },
  ];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      <div
        className="camera-pie-surface"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y,
          width: 140,
          height: 140,
          borderRadius: "50%",
        }}
      />

      {items.map((item) => {
        const active = selectedMode === item.mode;

        return (
          <div
            key={item.mode}
            className="camera-pie-item"
            style={{
              position: "absolute",
              left: center.x + item.x,
              top: center.y + item.y,
              padding: "8px 12px",
              borderRadius: 999,
              background: active ? "#5f5f63" : "#2f2f33",
              border: active ? "1px solid #a8a8ad" : "1px solid #49494f",
              color: active ? "#f7f7f8" : "#d6d6d9",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              boxShadow: "0 8px 16px rgba(0,0,0,0.22)",
              animationDelay: `${80 + Math.abs(item.x) + Math.abs(item.y)}ms`,
            }}
          >
            {item.label}
          </div>
        );
      })}

      <div
        className="camera-pie-item camera-pie-center"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y,
          width: 58,
          height: 58,
          borderRadius: "50%",
          background: "#1f1f22",
          border: "1px solid #47474c",
          color: "#f3f3f4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.1,
          boxShadow: "0 10px 18px rgba(0,0,0,0.28)",
        }}
      >
        Xform
      </div>
    </div>
  );
}

// ============================================
// VIEW CUBE
// ============================================

function FaceLabel({
  text,
  normal,
  up,
  fontSize,
  color,
}: {
  text: string;
  normal: [number, number, number];
  up: [number, number, number];
  fontSize: number;
  color: string;
}) {
  const { position, quaternion } = useMemo(() => {
    const normalVector = new THREE.Vector3(...normal).normalize();
    const upVector = new THREE.Vector3(...up).normalize();
    const rightVector = new THREE.Vector3()
      .crossVectors(upVector, normalVector)
      .normalize();
    const correctedUp = new THREE.Vector3()
      .crossVectors(normalVector, rightVector)
      .normalize();
    const matrix = new THREE.Matrix4().makeBasis(
      rightVector,
      correctedUp,
      normalVector
    );

    return {
      position: normalVector.clone().multiplyScalar(0.67),
      quaternion: new THREE.Quaternion().setFromRotationMatrix(matrix),
    };
  }, [color, fontSize, normal, text, up]);

  return (
    <Text
      position={position}
      quaternion={quaternion}
      fontSize={fontSize}
      color={color}
      anchorX="center"
      anchorY="middle"
    >
      {text}
    </Text>
  );
}

function OrientationCubeScene({
  cameraStateRef,
  onViewSelect,
}: {
  cameraStateRef: React.RefObject<CameraState>;
  onViewSelect: (action: ViewAction) => void;
}) {
  const { camera } = useThree();

  const handleCubeClick = (event: ThreeEvent<PointerEvent>) => {
    if (event.faceIndex == null) return;

    const face = Math.floor(event.faceIndex / 2);

    if (face === 0) onViewSelect("right");
    if (face === 1) onViewSelect("left");
    if (face === 2) onViewSelect("back");
    if (face === 3) onViewSelect("front");
    if (face === 4) onViewSelect("top");
    if (face === 5) onViewSelect("bottom");
  };

  useFrame(() => {
    const offset = cameraStateRef.current.offset;
    if (offset.lengthSq() === 0) return;

    const direction = offset.clone().normalize().multiplyScalar(4.5);
    camera.position.copy(direction);
    camera.up.copy(cameraStateRef.current.up).normalize();
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  });

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 6]} intensity={0.9} />
      <group>
        <mesh onClick={handleCubeClick}>
          <boxGeometry args={[1.2, 1.2, 1.2]} />
          <meshStandardMaterial
            color="#303036"
            metalness={0.08}
            roughness={0.82}
          />
        </mesh>
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(1.2, 1.2, 1.2)]} />
          <lineBasicMaterial color="#8f8f95" />
        </lineSegments>

        <FaceLabel
          text="FRONT"
          normal={[0, -1, 0]}
          up={[0, 0, 1]}
          fontSize={0.16}
          color="#f4f4f5"
        />
        <FaceLabel
          text="BACK"
          normal={[0, 1, 0]}
          up={[0, 0, 1]}
          fontSize={0.16}
          color="#dadade"
        />
        <FaceLabel
          text="RIGHT"
          normal={[1, 0, 0]}
          up={[0, 0, 1]}
          fontSize={0.14}
          color="#dadade"
        />
        <FaceLabel
          text="LEFT"
          normal={[-1, 0, 0]}
          up={[0, 0, 1]}
          fontSize={0.14}
          color="#dadade"
        />
        <FaceLabel
          text="TOP"
          normal={[0, 0, 1]}
          up={[0, 1, 0]}
          fontSize={0.16}
          color="#f4f4f5"
        />
        <FaceLabel
          text="BTM"
          normal={[0, 0, -1]}
          up={[0, -1, 0]}
          fontSize={0.13}
          color="#c8c8cc"
        />

        <group position={[-0.95, -0.95, -0.95]}>
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([0, 0, 0, 0.72, 0, 0]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#ef4444" />
          </line>
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([0, 0, 0, 0, 0.72, 0]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#22c55e" />
          </line>
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([0, 0, 0, 0, 0, 0.72]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#3b82f6" />
          </line>

          <Text
            position={[0.83, 0, 0]}
            fontSize={0.16}
            color="#ef4444"
            anchorX="center"
            anchorY="middle"
          >
            X
          </Text>
          <Text
            position={[0, 0.83, 0]}
            fontSize={0.16}
            color="#22c55e"
            anchorX="center"
            anchorY="middle"
          >
            Y
          </Text>
          <Text
            position={[0, 0, 0.83]}
            fontSize={0.16}
            color="#3b82f6"
            anchorX="center"
            anchorY="middle"
          >
            Z
          </Text>
        </group>
      </group>
    </>
  );
}

function ViewCubeOverlay({
  cameraStateRef,
  onViewSelect,
}: {
  cameraStateRef: React.RefObject<CameraState>;
  onViewSelect: (action: ViewAction) => void;
}) {
  return (
    <div className="view-cube-overlay">
      <div className="view-cube-overlay__cube">
        <Canvas
          camera={{ position: [0, 0, 4.5], fov: 32, near: 0.1, far: 20 }}
          gl={{ alpha: true, antialias: true }}
        >
          <OrientationCubeScene
            cameraStateRef={cameraStateRef}
            onViewSelect={onViewSelect}
          />
        </Canvas>
      </div>
    </div>
  );
}

// ============================================
// INSPECTOR / HISTORY / WARNINGS
// ============================================

function InspectorWindow({
  collapsed,
  onToggleCollapsed,
  primarySelection,
  secondarySelection,
  selectedObjectName,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  onStartRenaming,
  onCommitRename,
  onCancelRename,
  editingTransformField,
  transformFieldDraft,
  onTransformFieldDraftChange,
  onStartTransformFieldEdit,
  onCommitTransformFieldEdit,
  onCancelTransformFieldEdit,
  transformTarget,
  transformMode,
  onSetTransformMode,
  selectedPlane,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  primarySelection: SceneSelection;
  secondarySelection: SceneSelection;
  selectedObjectName: string | null;
  isRenaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onStartRenaming: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  editingTransformField: EditingTransformField;
  transformFieldDraft: string;
  onTransformFieldDraftChange: (value: string) => void;
  onStartTransformFieldEdit: (
    group: TransformFieldGroup,
    axis: TransformFieldAxis
  ) => void;
  onCommitTransformFieldEdit: () => void;
  onCancelTransformFieldEdit: () => void;
  transformTarget: TransformTarget | null;
  transformMode: TransformMode;
  onSetTransformMode: (mode: TransformMode) => void;
  selectedPlane: WorkPlane | null;
}) {
  const modeButtons: Array<{ mode: Exclude<TransformMode, null>; label: string }> = [
    { mode: "move", label: "Move" },
    { mode: "rotate", label: "Rotate" },
    { mode: "scale", label: "Scale" },
  ];

  const hasSelection = !!primarySelection && !!transformTarget;

  const formatValue = (value: number) => value.toFixed(1);

  const renderTransformValueCard = (
    group: TransformFieldGroup,
    axis: TransformFieldAxis,
    value: number | null
  ) => {
    const displayValue =
      value === null
        ? null
        : group === "scale"
          ? value * getScaleDisplayBase(selectedPlane, axis)
          : value;
    const isEditing =
      editingTransformField?.group === group &&
      editingTransformField.axis === axis;

    return (
      <div
        className="inspector-window__value-card"
        onDoubleClick={() => {
          if (value !== null) {
            onStartTransformFieldEdit(group, axis);
          }
        }}
      >
        <span>{axis.toUpperCase()}</span>
        {isEditing ? (
          <input
            autoFocus
            className="inspector-window__value-input"
            onBlur={onCommitTransformFieldEdit}
            onChange={(event) => onTransformFieldDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onCommitTransformFieldEdit();
              }

              if (event.key === "Escape") {
                onCancelTransformFieldEdit();
              }
            }}
            value={transformFieldDraft}
          />
        ) : (
          <strong>{displayValue !== null ? formatValue(displayValue) : "--"}</strong>
        )}
      </div>
    );
  };

  return (
    <>
      <button
        className={`inspector-tab${collapsed ? " inspector-tab--visible" : ""}`}
        onClick={onToggleCollapsed}
        type="button"
        aria-label="Expand inspector"
      >
        Inspector
      </button>

      <div className={`inspector-window${collapsed ? " inspector-window--hidden" : ""}`}>
      <div className="inspector-window__header">
        <div>
          <div className="inspector-window__eyebrow">Inspector</div>
          {isRenaming ? (
            <input
              autoFocus
              className="inspector-window__title-input"
              onBlur={onCommitRename}
              onChange={(event) => onRenameDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onCommitRename();
                }

                if (event.key === "Escape") {
                  onCancelRename();
                }
              }}
              value={renameDraft}
            />
          ) : (
            <div
              className="inspector-window__title"
              onDoubleClick={() => {
                if (selectedObjectName) {
                  onStartRenaming();
                }
              }}
            >
              {selectedObjectName ?? "No Selection"}
            </div>
          )}
        </div>
        <button
          className="inspector-window__toggle"
          onClick={onToggleCollapsed}
          type="button"
          aria-label="Collapse inspector"
        >
          {"<"}
        </button>
      </div>

      <div className="inspector-window__body">
        <div className="inspector-window__section">
          <div className="inspector-window__section-title">Transform</div>
          <div className="inspector-window__mode-row">
            {modeButtons.map((button) => (
              <button
                key={button.mode}
                className={`inspector-window__mode-button${
                  transformMode === button.mode ? " inspector-window__mode-button--active" : ""
                }`}
                disabled={!hasSelection}
                onClick={() =>
                  onSetTransformMode(
                    transformMode === button.mode ? null : button.mode
                  )
                }
                type="button"
              >
                {button.label}
              </button>
            ))}
          </div>
        </div>

        <div className="inspector-window__section">
          <div className="inspector-window__section-title">Selection</div>
          <div className="inspector-window__meta-row">
            <span>Type</span>
            <span>{primarySelection?.objectKind ?? "None"}</span>
          </div>
          <div className="inspector-window__meta-row">
            <span>Level</span>
            <span>{primarySelection?.selectionLevel ?? "None"}</span>
          </div>
          <div className="inspector-window__meta-row">
            <span>Primary</span>
            <span>{formatSelectionLevel(primarySelection)}</span>
          </div>
          <div className="inspector-window__meta-row">
            <span>Secondary</span>
            <span>{formatSelectionLevel(secondarySelection)}</span>
          </div>
          <div className="inspector-window__meta-row">
            <span>Mode</span>
            <span>{transformMode ?? "None"}</span>
          </div>
          <div className="inspector-window__meta-row">
            <span>Hint</span>
            <span>Shift+Select, then D</span>
          </div>
        </div>

        <div className="inspector-window__section">
          <div className="inspector-window__section-title">Position</div>
          <div className="inspector-window__grid">
            {renderTransformValueCard(
              "position",
              "x",
              transformTarget ? transformTarget.position[0] : null
            )}
            {renderTransformValueCard(
              "position",
              "y",
              transformTarget ? transformTarget.position[1] : null
            )}
            {renderTransformValueCard(
              "position",
              "z",
              transformTarget ? transformTarget.position[2] : null
            )}
          </div>
        </div>

        <div className="inspector-window__section">
          <div className="inspector-window__section-title">Rotation</div>
          <div className="inspector-window__grid">
            {renderTransformValueCard(
              "rotation",
              "x",
              transformTarget ? transformTarget.rotation[0] : null
            )}
            {renderTransformValueCard(
              "rotation",
              "y",
              transformTarget ? transformTarget.rotation[1] : null
            )}
            {renderTransformValueCard(
              "rotation",
              "z",
              transformTarget ? transformTarget.rotation[2] : null
            )}
          </div>
        </div>

        <div className="inspector-window__section">
          <div className="inspector-window__section-title">Scale</div>
          <div className="inspector-window__grid">
            {renderTransformValueCard(
              "scale",
              "x",
              transformTarget ? transformTarget.scale[0] : null
            )}
            {renderTransformValueCard(
              "scale",
              "y",
              transformTarget ? transformTarget.scale[1] : null
            )}
            {renderTransformValueCard(
              "scale",
              "z",
              transformTarget ? transformTarget.scale[2] : null
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

function ViewportWarning({ message }: { message: string }) {
  return <div className="viewport-warning">{message}</div>;
}

function DimensionOverlay({
  items,
  onEditDimension,
}: {
  items: DimensionOverlayItem[];
  onEditDimension: (dimensionId: string, currentValue: number) => void;
}) {
  if (items.length === 0) return null;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 18,
      }}
    >
      {items.map((item) => (
        <g key={item.id}>
          <line
            x1={item.start.x}
            y1={item.start.y}
            x2={item.end.x}
            y2={item.end.y}
            stroke="#111827"
            strokeWidth="1.8"
          />
          <polygon
            points={item.fromArrow.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="#111827"
          />
          <polygon
            points={item.toArrow.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="#111827"
          />
          <text
            x={item.label.x}
            y={item.label.y}
            fill="#111827"
            fontSize="13"
            fontWeight="600"
            textAnchor="middle"
            style={{ pointerEvents: "auto", cursor: "text", userSelect: "none" }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onEditDimension(item.id, item.value);
            }}
          >
            {`${item.value.toFixed(1)} mm`}
          </text>
        </g>
      ))}
    </svg>
  );
}

function HistoryWindow({
  collapsed,
  onToggleCollapsed,
  historyEntries,
  historyIndex,
  onSelectHistoryIndex,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  historyEntries: SceneHistoryEntry[];
  historyIndex: number;
  onSelectHistoryIndex: (index: number) => void;
}) {
  return (
    <>
      <button
        className={`history-tab${collapsed ? " history-tab--visible" : ""}`}
        onClick={onToggleCollapsed}
        type="button"
        aria-label="Expand history"
      >
        History
      </button>

      <div className={`history-window${collapsed ? " history-window--hidden" : ""}`}>
        <div className="history-window__header">
          <div>
            <div className="history-window__eyebrow">History</div>
            <div className="history-window__title">Edit Timeline</div>
          </div>
          <button
            className="history-window__toggle"
            onClick={onToggleCollapsed}
            type="button"
            aria-label="Collapse history"
          >
            {"<"}
          </button>
        </div>

        <div className="history-window__body">
          {historyEntries.map((entry, index) => (
            <button
              key={entry.id}
              className={`history-window__entry${
                index === historyIndex ? " history-window__entry--active" : ""
              }${index > historyIndex ? " history-window__entry--future" : ""}`}
              onClick={() => onSelectHistoryIndex(index)}
              type="button"
            >
              <span className="history-window__entry-index">{index}</span>
              <span className="history-window__entry-label">{entry.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ============================================
// APP
// ============================================

function App() {
  // --------------------------------------------
  // Refs
  // --------------------------------------------

  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const desiredPositionRef = useRef(DEFAULT_CAMERA_POSITION.clone());
  const desiredTargetRef = useRef(DEFAULT_CAMERA_TARGET.clone());
  const isAnimatingRef = useRef(false);
  const pieOpenRef = useRef(false);
  const pieCancelledRef = useRef(false);
  const toolsPieOpenRef = useRef(false);
  const toolsPieCancelledRef = useRef(false);
  const transformPieOpenRef = useRef(false);
  const transformPieCancelledRef = useRef(false);
  const cameraStateRef = useRef<CameraState>({
    offset: DEFAULT_CAMERA_POSITION.clone(),
    up: WORLD_UP.clone(),
  });
  const workPlanesRef = useRef<WorkPlane[]>([]);
  const dimensionsRef = useRef<DistanceDimension[]>([]);
  const primarySelectionRef = useRef<SceneSelection>(null);
  const secondarySelectionRef = useRef<SceneSelection>(null);
  const workPlaneIdCounterRef = useRef(1);
  const dimensionIdCounterRef = useRef(1);
  const historyEntryIdCounterRef = useRef(1);

  // --------------------------------------------
  // UI State
  // --------------------------------------------

  const [mouse, setMouse] = useState<MousePosition>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });

  const [pieOpen, setPieOpen] = useState(false);
  const [pieCenter, setPieCenter] = useState<MousePosition>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
  const [selectedAction, setSelectedAction] = useState<PieAction>("origin");
  const [toolsPieOpen, setToolsPieOpen] = useState(false);
  const [toolsPieCenter, setToolsPieCenter] = useState<MousePosition>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
  const [selectedToolAction, setSelectedToolAction] =
    useState<ToolPieAction>("none");
  const [transformPieOpen, setTransformPieOpen] = useState(false);
  const [transformPieCenter, setTransformPieCenter] = useState<MousePosition>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
  const [hoveredTransformMode, setHoveredTransformMode] =
    useState<TransformMode>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>(null);
  const [hoveredTransformAxis, setHoveredTransformAxis] =
    useState<TransformAxis>(null);
  const [transformDragState, setTransformDragState] =
    useState<TransformDragState>(null);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true);
  const [viewportWarning, setViewportWarning] = useState<string | null>(null);
  const [isRenamingObject, setIsRenamingObject] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingTransformField, setEditingTransformField] =
    useState<EditingTransformField>(null);
  const [transformFieldDraft, setTransformFieldDraft] = useState("");
  const [historyEntries, setHistoryEntries] = useState<SceneHistoryEntry[]>([
    {
      id: "history-0",
      label: "Initial",
      snapshot: cloneSceneSnapshot({
        workPlanes: [],
        dimensions: [],
        primarySelection: null,
        secondarySelection: null,
      }),
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [clipboardObject, setClipboardObject] = useState<ClipboardSceneObject>(null);
  const [dimensionOverlayItems, setDimensionOverlayItems] = useState<
    DimensionOverlayItem[]
  >([]);

  // --------------------------------------------
  // Scene State
  // --------------------------------------------

  const [workPlanes, setWorkPlanes] = useState<WorkPlane[]>([]);
  const [dimensions, setDimensions] = useState<DistanceDimension[]>([]);
  const [selectedObject, setSelectedObject] = useState<SceneSelection>(null);
  const [secondarySelection, setSecondarySelection] =
    useState<SceneSelection>(null);

  // --------------------------------------------
  // Snapshot / History Helpers
  // --------------------------------------------

  const getCurrentSceneSnapshot = (): SceneSnapshot =>
    cloneSceneSnapshot({
      workPlanes: workPlanesRef.current,
      dimensions: dimensionsRef.current,
      primarySelection: primarySelectionRef.current,
      secondarySelection: secondarySelectionRef.current,
    });

  const applySceneSnapshot = (snapshot: SceneSnapshot) => {
    const nextSnapshot = cloneSceneSnapshot(snapshot);
    setWorkPlanes(nextSnapshot.workPlanes);
    setDimensions(nextSnapshot.dimensions);
    setSelectedObject(nextSnapshot.primarySelection);
    setSecondarySelection(nextSnapshot.secondarySelection);
  };

  const commitSceneMutation = (
    label: string,
    mutate: (snapshot: SceneSnapshot) => SceneSnapshot
  ) => {
    const currentSnapshot = getCurrentSceneSnapshot();
    const nextSnapshot = cloneSceneSnapshot(mutate(cloneSceneSnapshot(currentSnapshot)));

    if (snapshotsEqual(currentSnapshot, nextSnapshot)) {
      return;
    }

    const nextEntry: SceneHistoryEntry = {
      id: `history-${historyEntryIdCounterRef.current}`,
      label,
      snapshot: nextSnapshot,
    };
    historyEntryIdCounterRef.current += 1;

    setHistoryEntries((existingEntries) => [
      ...existingEntries.slice(0, historyIndex + 1),
      nextEntry,
    ]);
    setHistoryIndex((currentIndex) => currentIndex + 1);
    applySceneSnapshot(nextSnapshot);
  };

  const nextWorkPlaneId = () => {
    const nextId = `work-plane-${workPlaneIdCounterRef.current}`;
    workPlaneIdCounterRef.current += 1;
    return nextId;
  };

  const nextDimensionId = () => {
    const nextId = `dimension-${dimensionIdCounterRef.current}`;
    dimensionIdCounterRef.current += 1;
    return nextId;
  };

  // --------------------------------------------
  // Camera / View Actions
  // --------------------------------------------

  const animateCameraTo = (
    nextPosition: THREE.Vector3,
    nextTarget = DEFAULT_CAMERA_TARGET.clone()
  ) => {
    desiredPositionRef.current.copy(nextPosition);
    desiredTargetRef.current.copy(nextTarget);
    isAnimatingRef.current = true;
  };

  const applyView = (action: ViewAction) => {
    animateCameraTo(getViewPosition(action));
  };

  // --------------------------------------------
  // Scene Mutations
  // --------------------------------------------

  const applyToolAction = (action: ToolPieAction) => {
    if (action !== "createWorkPlane") return;

    commitSceneMutation("Create Work Plane", (snapshot) => {
      const nextPlane: WorkPlane = {
        id: nextWorkPlaneId(),
        name: `Work Plane ${snapshot.workPlanes.length + 1}`,
        type: "plane",
        visible: true,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        size: { width: 100, height: 100 },
      };

      return {
        ...snapshot,
        workPlanes: [...snapshot.workPlanes, nextPlane],
        primarySelection: createSelection("plane", nextPlane.id, "object"),
        secondarySelection: null,
      };
    });
  };

  const updateSceneObjectPosition = (
    selection: NonNullable<SceneSelection>,
    position: Vector3Tuple
  ) => {
    if (selection.objectKind === "plane") {
      setWorkPlanes((existingPlanes) =>
        existingPlanes.map((plane) =>
          plane.id === selection.objectId ? { ...plane, position } : plane
        )
      );
    }
  };

  const updateSceneObjectRotation = (
    selection: NonNullable<SceneSelection>,
    rotation: Vector3Tuple
  ) => {
    if (selection.objectKind === "plane") {
      setWorkPlanes((existingPlanes) =>
        existingPlanes.map((plane) =>
          plane.id === selection.objectId ? { ...plane, rotation } : plane
        )
      );
    }
  };

  const updateSceneObjectScale = (
    selection: NonNullable<SceneSelection>,
    scale: Vector3Tuple
  ) => {
    if (selection.objectKind === "plane") {
      setWorkPlanes((existingPlanes) =>
        existingPlanes.map((plane) =>
          plane.id === selection.objectId ? { ...plane, scale } : plane
        )
      );
    }
  };

  const deleteSelectedObject = (selection: NonNullable<SceneSelection>) => {
    commitSceneMutation("Delete Object", (snapshot) => {
      if (selection.objectKind === "plane") {
        return {
          ...snapshot,
          workPlanes: snapshot.workPlanes.filter(
            (plane) => plane.id !== selection.objectId
          ),
          dimensions: snapshot.dimensions.filter(
            (dimension) =>
              dimension.from.objectId !== selection.objectId &&
              dimension.to.objectId !== selection.objectId
          ),
          primarySelection:
            snapshot.primarySelection?.objectId === selection.objectId
              ? null
              : snapshot.primarySelection,
          secondarySelection:
            snapshot.secondarySelection?.objectId === selection.objectId
              ? null
              : snapshot.secondarySelection,
        };
      }

      return snapshot;
    });
  };

  const renameSelectedObject = (selection: NonNullable<SceneSelection>, name: string) => {
    commitSceneMutation("Rename Object", (snapshot) => {
      if (selection.objectKind === "plane") {
        return {
          ...snapshot,
          workPlanes: snapshot.workPlanes.map((plane) =>
            plane.id === selection.objectId ? { ...plane, name } : plane
          ),
        };
      }

      return snapshot;
    });
  };

  const copySelectedObject = (selection: NonNullable<SceneSelection>) => {
    if (selection.objectKind === "plane") {
      const plane = workPlanesRef.current.find(
        (item) => item.id === selection.objectId
      );

      if (plane) {
        setClipboardObject({
          kind: "plane",
          plane: cloneWorkPlane(plane),
        });
      }
    }
  };

  const pasteClipboardObject = () => {
    if (!clipboardObject) return;

    commitSceneMutation("Paste Object", (snapshot) => {
      if (clipboardObject.kind === "plane") {
        const pastedPlane: WorkPlane = {
          ...cloneWorkPlane(clipboardObject.plane),
          id: nextWorkPlaneId(),
          name: `${clipboardObject.plane.name} Copy`,
          position: [
            clipboardObject.plane.position[0] + 10,
            clipboardObject.plane.position[1] + 10,
            clipboardObject.plane.position[2],
          ],
        };

        return {
          ...snapshot,
          workPlanes: [...snapshot.workPlanes, pastedPlane],
          primarySelection: createSelection("plane", pastedPlane.id, "object"),
          secondarySelection: null,
        };
      }

      return snapshot;
    });
  };

  const cutSelectedObject = (selection: NonNullable<SceneSelection>) => {
    copySelectedObject(selection);
    deleteSelectedObject(selection);
  };

  const createDistanceDimension = (
    from: NonNullable<SceneSelection>,
    to: NonNullable<SceneSelection>
  ) => {
    if (!isDimensionEligibleSelection(from) || !isDimensionEligibleSelection(to)) {
      return false;
    }

    if (areSelectionsEqual(from, to)) {
      return false;
    }

    if (dimensionExists(dimensionsRef.current, from, to)) {
      return false;
    }

    const value = getDistanceBetweenSelections(from, to, workPlanesRef.current);
    if (value === null) return false;

    commitSceneMutation("Create Distance Dimension", (snapshot) => ({
      ...snapshot,
      dimensions: [
        ...snapshot.dimensions,
        {
          id: nextDimensionId(),
          kind: "distance",
          from: cloneSelection(from) as NonNullable<SceneSelection>,
          to: cloneSelection(to) as NonNullable<SceneSelection>,
          value,
        },
      ],
      primarySelection: cloneSelection(snapshot.primarySelection),
      secondarySelection: cloneSelection(snapshot.secondarySelection),
    }));

    return true;
  };

  // --------------------------------------------
  // History Navigation
  // --------------------------------------------

  const undoScene = () => {
    if (historyIndex <= 0) return;

    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    applySceneSnapshot(historyEntries[nextIndex].snapshot);
  };

  const redoScene = () => {
    if (historyIndex >= historyEntries.length - 1) return;

    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    applySceneSnapshot(historyEntries[nextIndex].snapshot);
  };

  // --------------------------------------------
  // Derived Selection Data
  // --------------------------------------------

  const transformTarget = useMemo<TransformTarget | null>(() => {
    if (!selectedObject) return null;

    if (selectedObject.objectKind === "plane") {
      const plane = workPlanes.find(
        (item) => item.id === selectedObject.objectId
      );
      if (!plane) return null;

      return {
        position: plane.position,
        rotation: plane.rotation,
        scale: plane.scale,
      };
    }

    return null;
  }, [selectedObject, workPlanes]);

  const selectedPlane = useMemo(() => {
    if (!selectedObject || selectedObject.objectKind !== "plane") return null;
    return workPlanes.find((plane) => plane.id === selectedObject.objectId) ?? null;
  }, [selectedObject, workPlanes]);

  const selectedObjectName = useMemo(() => {
    if (!selectedObject) return null;

    if (selectedObject.objectKind === "plane") {
      return (
        workPlanes.find((plane) => plane.id === selectedObject.objectId)?.name ??
        null
      );
    }

    return null;
  }, [selectedObject, workPlanes]);

  // --------------------------------------------
  // Ref Synchronization
  // --------------------------------------------

  useEffect(() => {
    workPlanesRef.current = workPlanes;
  }, [workPlanes]);

  useEffect(() => {
    dimensionsRef.current = dimensions;
  }, [dimensions]);

  useEffect(() => {
    primarySelectionRef.current = selectedObject;
  }, [selectedObject]);

  useEffect(() => {
    secondarySelectionRef.current = secondarySelection;
  }, [secondarySelection]);

  // --------------------------------------------
  // Transform Drag Lifecycle
  // --------------------------------------------

  useEffect(() => {
    if (!transformDragState) return;

    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - transformDragState.startMouse.x;
      const deltaY = event.clientY - transformDragState.startMouse.y;

      if (transformDragState.mode === "move") {
        let nextValue = 0;

        if (transformDragState.axis === "x") {
          nextValue =
            transformDragState.startPosition[0] + deltaX * PIXEL_TO_MM;
        }

        if (transformDragState.axis === "y") {
          nextValue =
            transformDragState.startPosition[1] + deltaX * PIXEL_TO_MM;
        }

        if (transformDragState.axis === "z") {
          nextValue =
            transformDragState.startPosition[2] - deltaY * PIXEL_TO_MM;
        }

        updateSceneObjectPosition(
          transformDragState.selection,
          snapVectorComponent(
            transformDragState.startPosition,
            transformDragState.axis,
            nextValue
          )
        );
      }

      if (transformDragState.mode === "rotate") {
        const nextRotation = [...transformDragState.startRotation] as Vector3Tuple;
        const axisIndex =
          transformDragState.axis === "x"
            ? 0
            : transformDragState.axis === "y"
              ? 1
              : 2;
        const deltaDegrees =
          transformDragState.axis === "x"
            ? -deltaY * PIXEL_TO_DEGREES
            : deltaX * PIXEL_TO_DEGREES;
        const startDegrees = radiansToDegrees(
          transformDragState.startRotation[axisIndex]
        );

        nextRotation[axisIndex] = degreesToRadians(
          snapToIncrement(startDegrees + deltaDegrees, ROTATION_SNAP_INCREMENT)
        );

        updateSceneObjectRotation(transformDragState.selection, nextRotation);
      }

      if (transformDragState.mode === "scale") {
        const nextScale = [...transformDragState.startScale] as Vector3Tuple;
        const axisIndex =
          transformDragState.axis === "x"
            ? 0
            : transformDragState.axis === "y"
              ? 1
              : 2;
        const deltaScale =
          transformDragState.axis === "z"
            ? -deltaY * PIXEL_TO_SCALE
            : deltaX * PIXEL_TO_SCALE;

        nextScale[axisIndex] = Math.max(
          MIN_SCALE,
          snapToIncrement(
            transformDragState.startScale[axisIndex] + deltaScale,
            SCALE_SNAP_INCREMENT
          )
        );

        updateSceneObjectScale(transformDragState.selection, nextScale);
      }
    };

    const handleMouseUp = () => {
      const currentSnapshot = getCurrentSceneSnapshot();

      if (!snapshotsEqual(transformDragState.startSnapshot, currentSnapshot)) {
        const nextEntry: SceneHistoryEntry = {
          id: `history-${historyEntryIdCounterRef.current}`,
          label:
            transformDragState.mode === "move"
              ? "Move Object"
              : transformDragState.mode === "rotate"
                ? "Rotate Object"
                : "Scale Object",
          snapshot: currentSnapshot,
        };
        historyEntryIdCounterRef.current += 1;

        setHistoryEntries((existingEntries) => [
          ...existingEntries.slice(0, historyIndex + 1),
          nextEntry,
        ]);
        setHistoryIndex((currentIndex) => currentIndex + 1);
      }

      setTransformDragState(null);
      setHoveredTransformAxis(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [transformDragState, historyIndex]);

  // --------------------------------------------
  // UI Side Effects
  // --------------------------------------------

  useEffect(() => {
    if (!viewportWarning) return;

    const timeoutId = window.setTimeout(() => {
      setViewportWarning(null);
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [viewportWarning]);

  useEffect(() => {
    pieOpenRef.current = pieOpen;
  }, [pieOpen]);

  useEffect(() => {
    toolsPieOpenRef.current = toolsPieOpen;
  }, [toolsPieOpen]);

  useEffect(() => {
    transformPieOpenRef.current = transformPieOpen;
  }, [transformPieOpen]);

  // --------------------------------------------
  // Selection / Mode Cleanup
  // --------------------------------------------

  useEffect(() => {
    if (selectedObject) return;

    setTransformMode(null);
    setTransformPieOpen(false);
    transformPieCancelledRef.current = false;
    setHoveredTransformAxis(null);
    setTransformDragState(null);
    setSecondarySelection(null);
    setIsRenamingObject(false);
    setRenameDraft("");
    setEditingTransformField(null);
    setTransformFieldDraft("");
  }, [selectedObject]);

  useEffect(() => {
    setHoveredTransformAxis(null);

    setTransformDragState((currentDragState) => {
      if (!currentDragState) return null;
      if (transformMode === currentDragState.mode) return currentDragState;
      return null;
    });
  }, [transformMode]);

  // --------------------------------------------
  // Global Input Handling
  // --------------------------------------------

  useEffect(() => {
    const updateCameraSelectionFromMouse = (
      center: MousePosition,
      current: MousePosition
    ) => {
      const dx = current.x - center.x;
      const dy = current.y - center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 28) {
        setSelectedAction("origin");
        return;
      }

      const angle = Math.atan2(dy, dx);
      const deg = (angle * 180) / Math.PI;

      if (deg >= -80 && deg < -10) {
        setSelectedAction("iso");
      } else if (deg >= -45 && deg < 45) {
        setSelectedAction("right");
      } else if (deg >= 45 && deg < 135) {
        setSelectedAction("front");
      } else if (deg >= -135 && deg < -45) {
        setSelectedAction("top");
      } else {
        setSelectedAction("origin");
      }
    };

    const updateToolSelectionFromMouse = (
      center: MousePosition,
      current: MousePosition
    ) => {
      const dx = current.x - center.x;
      const dy = current.y - center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 28) {
        setSelectedToolAction("none");
        return;
      }

      const angle = Math.atan2(dy, dx);
      const deg = (angle * 180) / Math.PI;

      if (deg >= -150 && deg < -30) {
        setSelectedToolAction("createWorkPlane");
      } else {
        setSelectedToolAction("none");
      }
    };

    const updateTransformSelectionFromMouse = (
      center: MousePosition,
      current: MousePosition
    ) => {
      const dx = current.x - center.x;
      const dy = current.y - center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 28) {
        setHoveredTransformMode(null);
        return;
      }

      const angle = Math.atan2(dy, dx);
      const deg = (angle * 180) / Math.PI;

      if (deg >= -135 && deg < -45) {
        setHoveredTransformMode("move");
      } else if (deg >= -45 && deg < 45) {
        setHoveredTransformMode("rotate");
      } else if (deg >= 45 && deg < 135) {
        setHoveredTransformMode("scale");
      } else {
        setHoveredTransformMode(null);
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      const nextMouse = { x: event.clientX, y: event.clientY };
      setMouse(nextMouse);

      if (pieOpenRef.current) {
        updateCameraSelectionFromMouse(pieCenter, nextMouse);
      }

      if (toolsPieOpenRef.current) {
        updateToolSelectionFromMouse(toolsPieCenter, nextMouse);
      }

      if (transformPieOpenRef.current) {
        updateTransformSelectionFromMouse(transformPieCenter, nextMouse);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const inspectorInputActive =
        isRenamingObject ||
        editingTransformField !== null ||
        (activeElement instanceof HTMLElement &&
          activeElement.closest(".inspector-window") !== null &&
          (activeElement.tagName === "INPUT" ||
            activeElement.tagName === "TEXTAREA"));

      if (
        event.key === "Escape" &&
        (pieOpenRef.current || toolsPieOpenRef.current || transformPieOpenRef.current)
      ) {
        pieCancelledRef.current = true;
        toolsPieCancelledRef.current = true;
        transformPieCancelledRef.current = true;
        setPieOpen(false);
        setToolsPieOpen(false);
        setTransformPieOpen(false);
        return;
      }

      if (event.repeat) return;

      const modifierPressed = event.metaKey || event.ctrlKey;

      if (modifierPressed && !inspectorInputActive && !transformDragState) {
        const key = event.key.toLowerCase();

        if (key === "z") {
          event.preventDefault();
          undoScene();
          return;
        }

        if (key === "y") {
          event.preventDefault();
          redoScene();
          return;
        }

        if (key === "c") {
          event.preventDefault();
          if (selectedObject) {
            copySelectedObject(selectedObject);
          }
          return;
        }

        if (key === "v") {
          event.preventDefault();
          pasteClipboardObject();
          return;
        }

        if (key === "x") {
          event.preventDefault();
          if (selectedObject) {
            cutSelectedObject(selectedObject);
          }
          return;
        }
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !transformDragState &&
        !inspectorInputActive
      ) {
        event.preventDefault();

        if (selectedObject) {
          deleteSelectedObject(selectedObject);
        } else {
          setViewportWarning("No object selected");
        }

        return;
      }

      if (
        event.key.toLowerCase() === "z" &&
        !toolsPieOpenRef.current &&
        !transformPieOpenRef.current &&
        !transformDragState
      ) {
        setPieCenter(mouse);
        setSelectedAction("origin");
        pieCancelledRef.current = false;
        setPieOpen(true);
      }

      if (
        event.key === "/" &&
        !pieOpenRef.current &&
        !transformPieOpenRef.current &&
        !transformDragState
      ) {
        event.preventDefault();
        setToolsPieCenter(mouse);
        setSelectedToolAction("none");
        toolsPieCancelledRef.current = false;
        setToolsPieOpen(true);
      }

      if (
        event.key === "`" &&
        selectedObject &&
        !pieOpenRef.current &&
        !toolsPieOpenRef.current &&
        !transformDragState
      ) {
        setTransformPieCenter(mouse);
        setHoveredTransformMode(transformMode);
        transformPieCancelledRef.current = false;
        setTransformPieOpen(true);
        return;
      }

      if (
        event.key.toLowerCase() === "d" &&
        !pieOpenRef.current &&
        !toolsPieOpenRef.current &&
        !transformPieOpenRef.current &&
        !transformDragState &&
        !inspectorInputActive
      ) {
        event.preventDefault();

        if (
          !isDimensionEligibleSelection(selectedObject) ||
          !isDimensionEligibleSelection(secondarySelection)
        ) {
          setViewportWarning("Select two references");
          return;
        }

        if (areSelectionsEqual(selectedObject, secondarySelection)) {
          setViewportWarning("References must be different");
          return;
        }

        if (dimensionExists(dimensionsRef.current, selectedObject, secondarySelection)) {
          setViewportWarning("Dimension already exists");
          return;
        }

        const created = createDistanceDimension(
          selectedObject as NonNullable<SceneSelection>,
          secondarySelection as NonNullable<SceneSelection>
        );

        if (created) {
          setViewportWarning("Distance dimension created");
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "z") {
        const shouldApplyView = pieOpenRef.current && !pieCancelledRef.current;

        setPieOpen(false);
        pieCancelledRef.current = false;

        if (shouldApplyView) {
          applyView(selectedAction);
        }
      }

      if (event.key === "/") {
        event.preventDefault();
        const shouldApplyTool =
          toolsPieOpenRef.current && !toolsPieCancelledRef.current;

        setToolsPieOpen(false);
        toolsPieCancelledRef.current = false;

        if (shouldApplyTool) {
          applyToolAction(selectedToolAction);
        }
      }

      if (event.key === "`") {
        const shouldApplyTransform =
          transformPieOpenRef.current &&
          !transformPieCancelledRef.current &&
          selectedObject;

        setTransformPieOpen(false);
        transformPieCancelledRef.current = false;

        if (shouldApplyTransform) {
          setTransformMode(hoveredTransformMode);
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    mouse,
    pieCenter,
    selectedAction,
    toolsPieCenter,
    selectedToolAction,
    transformPieCenter,
    hoveredTransformMode,
    selectedObject,
    secondarySelection,
    transformMode,
    transformDragState,
  ]);

  // --------------------------------------------
  // Render
  // --------------------------------------------

  const handleSceneSelection = (selection: SceneSelection, additive: boolean) => {
    if (!selection) {
      if (!additive) {
        setSelectedObject(null);
        setSecondarySelection(null);
      }
      return;
    }

    if (additive) {
      if (!isDimensionEligibleSelection(selection)) return;
      if (areSelectionsEqual(selection, selectedObject)) return;
      if (areSelectionsEqual(selection, secondarySelection)) return;

      setSecondarySelection(cloneSelection(selection));
      return;
    }

    const isSameAsPrimary = areSelectionsEqual(selection, selectedObject);
    setSelectedObject(selection);

    if (!isSameAsPrimary) {
      setSecondarySelection(null);
    }
  };

  return (
    <div className="app-shell">
      <Scene
        controlsRef={controlsRef}
        desiredPositionRef={desiredPositionRef}
        desiredTargetRef={desiredTargetRef}
        isAnimatingRef={isAnimatingRef}
        cameraStateRef={cameraStateRef}
        workPlanes={workPlanes}
        dimensions={dimensions}
        primarySelection={selectedObject}
        secondarySelection={secondarySelection}
        onSelectObject={handleSceneSelection}
        onDimensionOverlayChange={setDimensionOverlayItems}
        transformMode={transformMode}
        transformTarget={transformTarget}
        hoveredTransformAxis={hoveredTransformAxis}
        transformDragState={transformDragState}
        onHoverTransformAxis={setHoveredTransformAxis}
        onTransformAxisPointerDown={(axis, event) => {
          if (
            !transformMode ||
            !selectedObject ||
            !transformTarget
          ) {
            return;
          }

          event.stopPropagation();
          setHoveredTransformAxis(axis);
          setTransformDragState({
            mode: transformMode,
            axis,
            startMouse: { x: event.clientX, y: event.clientY },
            startPosition: [...transformTarget.position] as Vector3Tuple,
            startRotation: [...transformTarget.rotation] as Vector3Tuple,
            startScale: [...transformTarget.scale] as Vector3Tuple,
            selection: selectedObject,
            startSnapshot: getCurrentSceneSnapshot(),
          });
        }}
      />

      <DimensionOverlay
        items={dimensionOverlayItems}
        onEditDimension={(dimensionId, currentValue) => {
          const nextValueText = window.prompt(
            "Set distance dimension (mm)",
            currentValue.toFixed(1)
          );

          if (nextValueText == null) return;

          const nextValue = Number(nextValueText);
          if (Number.isNaN(nextValue) || nextValue <= 0) {
            setViewportWarning("Enter a valid dimension");
            return;
          }

          commitSceneMutation("Edit Distance Dimension", (snapshot) => ({
            ...snapshot,
            dimensions: snapshot.dimensions.map((dimension) =>
              dimension.id === dimensionId
                ? { ...dimension, value: nextValue }
              : dimension
            ),
          }));
        }}
      />

      <ViewCubeOverlay
        cameraStateRef={cameraStateRef}
        onViewSelect={applyView}
      />

      <InspectorWindow
        collapsed={inspectorCollapsed}
        onToggleCollapsed={() => setInspectorCollapsed((current) => !current)}
        primarySelection={selectedObject}
        secondarySelection={secondarySelection}
        selectedObjectName={selectedObjectName}
        isRenaming={isRenamingObject}
        renameDraft={renameDraft}
        onRenameDraftChange={setRenameDraft}
        onStartRenaming={() => {
          if (!selectedObjectName) return;

          setRenameDraft(selectedObjectName);
          setIsRenamingObject(true);
        }}
        onCommitRename={() => {
          if (!selectedObject) {
            setIsRenamingObject(false);
            setRenameDraft("");
            return;
          }

          const nextName = renameDraft.trim();

          if (nextName) {
            renameSelectedObject(selectedObject, nextName);
          }

          setIsRenamingObject(false);
          setRenameDraft("");
        }}
        onCancelRename={() => {
          setIsRenamingObject(false);
          setRenameDraft("");
        }}
        editingTransformField={editingTransformField}
        transformFieldDraft={transformFieldDraft}
        onTransformFieldDraftChange={setTransformFieldDraft}
        onStartTransformFieldEdit={(group, axis) => {
          if (!transformTarget) return;

          const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
          const scaleBase = getScaleDisplayBase(selectedPlane, axis);
          const source =
            group === "position"
              ? transformTarget.position
              : group === "rotation"
                ? transformTarget.rotation
                : transformTarget.scale;

          setEditingTransformField({ group, axis });
          setTransformFieldDraft(
            String(group === "scale" ? transformTarget.scale[axisIndex] * scaleBase : source[axisIndex])
          );
        }}
        onCommitTransformFieldEdit={() => {
          if (!selectedObject || !transformTarget || !editingTransformField) {
            setEditingTransformField(null);
            setTransformFieldDraft("");
            return;
          }

          const nextValue = Number(transformFieldDraft);

          if (Number.isNaN(nextValue)) {
            setEditingTransformField(null);
            setTransformFieldDraft("");
            return;
          }

          const axisIndex =
            editingTransformField.axis === "x"
              ? 0
              : editingTransformField.axis === "y"
                ? 1
                : 2;

          if (editingTransformField.group === "position") {
            const nextPosition = [...transformTarget.position] as Vector3Tuple;
            nextPosition[axisIndex] = nextValue;
            commitSceneMutation("Edit Position", (snapshot) => ({
              ...snapshot,
              workPlanes: snapshot.workPlanes.map((plane) =>
                plane.id === selectedObject.objectId
                  ? { ...plane, position: nextPosition }
                  : plane
              ),
            }));
          }

          if (editingTransformField.group === "rotation") {
            const nextRotation = [...transformTarget.rotation] as Vector3Tuple;
            nextRotation[axisIndex] = nextValue;
            commitSceneMutation("Edit Rotation", (snapshot) => ({
              ...snapshot,
              workPlanes: snapshot.workPlanes.map((plane) =>
                plane.id === selectedObject.objectId
                  ? { ...plane, rotation: nextRotation }
                  : plane
              ),
            }));
          }

          if (editingTransformField.group === "scale") {
            const nextScale = [...transformTarget.scale] as Vector3Tuple;
            const scaleBase = getScaleDisplayBase(selectedPlane, editingTransformField.axis);
            nextScale[axisIndex] = Math.max(MIN_SCALE, nextValue / scaleBase);
            commitSceneMutation("Edit Scale", (snapshot) => ({
              ...snapshot,
              workPlanes: snapshot.workPlanes.map((plane) =>
                plane.id === selectedObject.objectId
                  ? { ...plane, scale: nextScale }
                  : plane
              ),
            }));
          }

          setEditingTransformField(null);
          setTransformFieldDraft("");
        }}
        onCancelTransformFieldEdit={() => {
          setEditingTransformField(null);
          setTransformFieldDraft("");
        }}
        transformTarget={transformTarget}
        transformMode={transformMode}
        onSetTransformMode={setTransformMode}
        selectedPlane={selectedPlane}
      />

      <HistoryWindow
        collapsed={historyCollapsed}
        onToggleCollapsed={() => setHistoryCollapsed((current) => !current)}
        historyEntries={historyEntries}
        historyIndex={historyIndex}
        onSelectHistoryIndex={(index) => {
          setHistoryIndex(index);
          applySceneSnapshot(historyEntries[index].snapshot);
        }}
      />

      {pieOpen && (
        <CameraPieMenu center={pieCenter} selectedAction={selectedAction} />
      )}
      {toolsPieOpen && (
        <ToolsPieMenu
          center={toolsPieCenter}
          selectedAction={selectedToolAction}
        />
      )}
      {transformPieOpen && (
        <TransformPieMenu
          center={transformPieCenter}
          selectedMode={hoveredTransformMode}
        />
      )}
      {viewportWarning && <ViewportWarning message={viewportWarning} />}
    </div>
  );
}

export default App;
