// ============================================
// TYPES
// ============================================

export type PieAction = "origin" | "top" | "front" | "right" | "iso";

export type ViewAction = PieAction | "back" | "left" | "bottom";

export type ToolPieAction = "none" | "createWorkPlane";
export type SketchTool = "circle" | "rectangle" | null;
export type SketchProfileType = "circle" | "rectangle";
export type BodyFaceId = "top" | "bottom" | "side";
export type FilletEdgeId =
  | "top-front"
  | "top-back"
  | "top-left"
  | "top-right"
  | "bottom-front"
  | "bottom-back"
  | "bottom-left"
  | "bottom-right"
  | "vertical-front-left"
  | "vertical-front-right"
  | "vertical-back-left"
  | "vertical-back-right";
export type BooleanOperation = "union" | "subtract" | "intersect";

export type TransformMode = "move" | "rotate" | "scale" | null;

export type TransformAxis = "x" | "y" | "z" | null;

export type Vector3Tuple = [number, number, number];

export type SnapKind =
  | "origin"
  | "grid"
  | "body-center"
  | "ground"
  | "face";

export type SnapSettings = {
  enabled: boolean;
  grid: boolean;
  origin: boolean;
  body: boolean;
};

export type SnapVisualHint = {
  kind: SnapKind;
  label: string;
  point: Vector3Tuple;
  from?: Vector3Tuple;
};

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
  | {
      kind: "sketch-curve";
      profileId: string;
      profileType: SketchProfileType;
      curveKind: "circle" | "rectangle-edge";
      edgeId?: "top" | "right" | "bottom" | "left";
    }
  | { kind: "body"; bodyId: string }
  | { kind: "face"; bodyId: string; faceId: BodyFaceId }
  | { kind: "edge"; bodyId: string; edgeId: FilletEdgeId }
  | null;

export type SketchFeature = {
  id: string;
  name: string;
  planeId: string;
  profileIds: string[];
  order: number;
  dependencies: string[];
  parameters: {
    planeId: string;
    profileIds: string[];
  };
};

export type ExtrudeFeature = {
  id: string;
  name: string;
  sourceProfileId: string;
  bodyId: string;
  depth: number;
  direction: 1 | -1;
  order: number;
  dependencies: string[];
  parameters: {
    sourceProfileId: string;
    depth: number;
    direction: 1 | -1;
  };
};

export type BooleanFeature = {
  id: string;
  name: string;
  targetBodyId: string;
  toolBodyId: string;
  operation: BooleanOperation;
  resultBodyId: string;
  order: number;
  dependencies: string[];
  parameters: {
    targetBodyId: string;
    toolBodyId: string;
    operation: BooleanOperation;
  };
};

export type FilletFeature = {
  id: string;
  name: string;
  bodyId: string;
  edgeId: FilletEdgeId;
  radius: number;
  status: "ok" | "invalid";
  order: number;
  dependencies: string[];
  parameters: {
    edgeId: FilletEdgeId;
    radius: number;
  };
};

export type HoleFeature = {
  id: string;
  name: string;
  bodyId: string;
  faceId: BodyFaceId;
  center: Vector3Tuple;
  normal: Vector3Tuple;
  diameter: number;
  depth: number;
  status: "ok" | "invalid";
  order: number;
  dependencies: string[];
  parameters: {
    faceId: BodyFaceId;
    diameter: number;
    depth: number;
  };
};

export type FeatureOrderItem = {
  kind: "sketch" | "extrude" | "boolean" | "fillet" | "hole";
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
  filletFeatures: FilletFeature[];
  holeFeatures: HoleFeature[];
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
