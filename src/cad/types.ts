// ============================================
// TYPES
// ============================================

export type PieAction = "origin" | "top" | "front" | "right" | "iso";

export type ViewAction = PieAction | "back" | "left" | "bottom";

export type ToolPieAction = "none" | "createWorkPlane";
export type SketchTool = "circle" | null;

export type TransformMode = "move" | "rotate" | "scale" | null;

export type TransformAxis = "x" | "y" | "z" | null;

export type Vector3Tuple = [number, number, number];

export type SelectableObjectKind = "plane";

export type SelectionLevel = "object" | "face" | "edge" | "vertex";

export type WorkPlaneEdgeId = "top" | "right" | "bottom" | "left";

export type WorkPlaneVertexId =
  | "topLeft"
  | "topRight"
  | "bottomRight"
  | "bottomLeft";

export type MousePosition = {
  x: number;
  y: number;
};

export type WorkPlane = {
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

export type SketchCircle = {
  id: string;
  name: string;
  planeId: string;
  center: [number, number];
  radius: number;
  planePosition: Vector3Tuple;
  planeRotation: Vector3Tuple;
  planeScale: Vector3Tuple;
};

export type SolidBody = {
  id: string;
  name: string;
  sourceSketchId: string;
  radius: number;
  depth: number;
  direction: 1 | -1;
  center: [number, number];
  planePosition: Vector3Tuple;
  planeRotation: Vector3Tuple;
  planeScale: Vector3Tuple;
};

export type SceneSelection = {
  objectKind: SelectableObjectKind;
  objectId: string;
  selectionLevel: SelectionLevel;
  subElementId: string | null;
} | null;

export type DistanceDimension = {
  id: string;
  kind: "distance";
  from: NonNullable<SceneSelection>;
  to: NonNullable<SceneSelection>;
  value: number;
};

export type SceneSnapshot = {
  workPlanes: WorkPlane[];
  sketchCircles: SketchCircle[];
  solidBodies: SolidBody[];
  dimensions: DistanceDimension[];
  primarySelection: SceneSelection;
  secondarySelection: SceneSelection;
};

export type SceneHistoryEntry = {
  id: string;
  label: string;
  snapshot: SceneSnapshot;
};

export type ClipboardSceneObject =
  | {
      kind: "plane";
      plane: WorkPlane;
    }
  | null;

export type TransformTarget = {
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
};

export type TransformFieldGroup = "position" | "rotation" | "scale";

export type TransformFieldAxis = "x" | "y" | "z";

export type EditingTransformField = {
  group: TransformFieldGroup;
  axis: TransformFieldAxis;
} | null;

export type TransformDragState = {
  mode: Exclude<TransformMode, null>;
  axis: Exclude<TransformAxis, null>;
  startMouse: MousePosition;
  startPosition: Vector3Tuple;
  startRotation: Vector3Tuple;
  startScale: Vector3Tuple;
  selection: NonNullable<SceneSelection>;
  startSnapshot: SceneSnapshot;
} | null;

export type CameraState = {
  offset: import("three").Vector3;
  up: import("three").Vector3;
};

export type WorkPlaneSubElementHighlight = {
  faceRole: "primary" | "secondary" | null;
  selectedEdgeRoleById: Record<WorkPlaneEdgeId, "primary" | "secondary" | null>;
  selectedVertexRoleById: Record<
    WorkPlaneVertexId,
    "primary" | "secondary" | null
  >;
};

export type DimensionOverlayArrow = [MousePosition, MousePosition, MousePosition];

export type DimensionOverlayItem = {
  id: string;
  start: MousePosition;
  end: MousePosition;
  label: MousePosition;
  value: number;
  fromArrow: DimensionOverlayArrow;
  toArrow: DimensionOverlayArrow;
};
