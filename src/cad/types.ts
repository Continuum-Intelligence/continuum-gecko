// ============================================
// TYPES
// ============================================

export type PieAction = "origin" | "top" | "front" | "right" | "iso";

export type ViewAction = PieAction | "back" | "left" | "bottom";

export type ToolPieAction = "none" | "createWorkPlane";
export type SketchTool = "circle" | "rectangle" | null;
export type SketchProfileType = "circle" | "rectangle";
export type BodyFaceId = "top" | "bottom" | "side";
export type BooleanOperation = "union" | "subtract" | "intersect";

export type TransformMode = "move" | "rotate" | "scale" | null;

export type TransformAxis = "x" | "y" | "z" | null;

export type Vector3Tuple = [number, number, number];

export type BodyTransform = {
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
};

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
  profileType: "circle";
  planeId: string;
  center: [number, number];
  radius: number;
  planePosition: Vector3Tuple;
  planeRotation: Vector3Tuple;
  planeScale: Vector3Tuple;
};

export type SketchRectangle = {
  id: string;
  name: string;
  profileType: "rectangle";
  planeId: string;
  center: [number, number];
  width: number;
  height: number;
  planePosition: Vector3Tuple;
  planeRotation: Vector3Tuple;
  planeScale: Vector3Tuple;
};

export type SketchProfile = SketchCircle | SketchRectangle;

export type MeshGeometryData = {
  positions: number[];
  normals: number[];
  indices: number[];
};

export type SolidBody = {
  id: string;
  name: string;
  isVisible?: boolean;
  sourceSketchId?: string | null;
  sourceBooleanFeatureId?: string | null;
  profileType: SketchProfileType | "mesh";
  radius?: number;
  width?: number;
  height?: number;
  meshData?: MeshGeometryData;
  depth: number;
  direction: 1 | -1;
  center: [number, number];
  planePosition: Vector3Tuple;
  planeRotation: Vector3Tuple;
  planeScale: Vector3Tuple;
  transform: BodyTransform;
};

export type CadEntitySelection =
  | { kind: "profile"; profileId: string }
  | { kind: "body"; bodyId: string }
  | { kind: "face"; bodyId: string; faceId: BodyFaceId }
  | null;

export type SketchFeature = {
  id: string;
  name: string;
  planeId: string;
  profileIds: string[];
};

export type ExtrudeFeature = {
  id: string;
  name: string;
  sourceProfileId: string;
  bodyId: string;
  depth: number;
  direction: 1 | -1;
};

export type BooleanFeature = {
  id: string;
  name: string;
  targetBodyId: string;
  toolBodyId: string;
  operation: BooleanOperation;
  resultBodyId: string;
};

export type FeatureOrderItem = {
  kind: "sketch" | "extrude" | "boolean";
  id: string;
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
  sketchRectangles: SketchRectangle[];
  sketchFeatures: SketchFeature[];
  solidBodies: SolidBody[];
  extrudeFeatures: ExtrudeFeature[];
  booleanFeatures: BooleanFeature[];
  featureOrder: FeatureOrderItem[];
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
