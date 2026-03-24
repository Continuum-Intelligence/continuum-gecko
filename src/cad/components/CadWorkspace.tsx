import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import {
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
  MIN_SCALE,
  PIXEL_TO_MM,
  WORLD_UP,
} from "../constants";
import {
  CameraPieMenu,
  DimensionOverlay,
  HistoryWindow,
  InspectorWindow,
  ToolsWindow,
  ToolsPieMenu,
  TransformPieMenu,
  UndoRedoOverlay,
  ViewportWarning,
} from "./ui/Overlays";
import { Scene3D, ViewCubeOverlay } from "./scene/Scene3D";
import {
  cloneSelection,
  cloneSceneSnapshot,
  snapshotsEqual,
} from "../helpers/history";
import {
  areSelectionsEqual,
  clampScale,
  createSelection,
  dimensionExists,
  getDistanceBetweenSelections,
  getPlaneBySelection,
  getScaleDisplayBase,
  getSelectionAnchorPoint,
  getSelectionLocalAnchorPoint,
  snapToIncrement,
  getViewPosition,
  isDimensionEligibleSelection,
  movePlaneInSnapshot,
} from "../helpers/sceneMath";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useTransformDrag } from "../hooks/useTransformDrag";
import type {
  BooleanFeature,
  BooleanOperation,
  CameraState,
  ClipboardSceneObject,
  DimensionOverlayItem,
  DistanceDimension,
  EditingTransformField,
  BodyFaceId,
  CadEntitySelection,
  ExtrudeFeature,
  FeatureOrderItem,
  MousePosition,
  PieAction,
  SketchCircle,
  SketchProfile,
  SketchRectangle,
  SketchFeature,
  SketchTool,
  SceneHistoryEntry,
  SceneSelection,
  SceneSnapshot,
  SolidBody,
  ToolPieAction,
  TransformAxis,
  TransformDragState,
  TransformMode,
  TransformTarget,
  Vector3Tuple,
  ViewAction,
  WorkPlane,
} from "../types";
import type {
  CadHierarchyState,
  HierarchyRenameRequest,
  HierarchySelectionRequest,
} from "../../shared/hierarchy/types";
import type { PlaneSketch } from "../../shared/sketch/types";
import { exportObjectToStl } from "../../utils/exportSTL";
import { buildBooleanMeshData, meshDataEqual } from "../utils/booleanCSG";

// ============================================
// APP
// ============================================

function CadWorkspace({
  isActive,
  planeSketches,
  onStateChange,
  renameRequest,
  selectionRequest,
}: {
  isActive: boolean;
  planeSketches: PlaneSketch[];
  onStateChange?: (state: CadHierarchyState) => void;
  renameRequest?: HierarchyRenameRequest | null;
  selectionRequest?: HierarchySelectionRequest | null;
}) {
  // --------------------------------------------
  // Refs
  // --------------------------------------------

  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const mouseRef = useRef<MousePosition>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
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
  const sketchCircleIdCounterRef = useRef(1);
  const solidBodyIdCounterRef = useRef(1);
  const sketchFeatureIdCounterRef = useRef(1);
  const extrudeFeatureIdCounterRef = useRef(1);
  const booleanFeatureIdCounterRef = useRef(1);
  const exportRootRef = useRef<THREE.Group | null>(null);
  const selectedPlaneFocusRef = useRef<WorkPlane | null>(null);
  const selectedSketchFocusRef = useRef<SketchProfile | null>(null);
  const selectedSolidFocusRef = useRef<SolidBody | null>(null);
  const sketchPreviewRafRef = useRef<number | null>(null);
  const pendingSketchRadiusRef = useRef<number | null>(null);
  const pendingSketchRectangleRef = useRef<{
    width: number;
    height: number;
  } | null>(null);
  const extrudePreviewRafRef = useRef<number | null>(null);
  const pendingExtrudeSignedDepthRef = useRef<number | null>(null);

  // --------------------------------------------
  // UI State
  // --------------------------------------------

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
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [toolsCollapsed, setToolsCollapsed] = useState(true);
  const [toolsFlow, setToolsFlow] = useState<
    "home" | "sketch" | "extrude" | "boolean" | "move"
  >(
    "home"
  );
  const [sketchPlaneSelectionMode, setSketchPlaneSelectionMode] = useState(false);
  const [clipboardObject, setClipboardObject] =
    useState<ClipboardSceneObject>(null);
  const [dimensionOverlayItems, setDimensionOverlayItems] = useState<
    DimensionOverlayItem[]
  >([]);

  // --------------------------------------------
  // Scene State
  // --------------------------------------------

  const [workPlanes, setWorkPlanes] = useState<WorkPlane[]>([]);
  const [sketchCircles, setSketchCircles] = useState<SketchCircle[]>([]);
  const [sketchRectangles, setSketchRectangles] = useState<SketchRectangle[]>([]);
  const [sketchFeatures, setSketchFeatures] = useState<SketchFeature[]>([]);
  const [solidBodies, setSolidBodies] = useState<SolidBody[]>([]);
  const [extrudeFeatures, setExtrudeFeatures] = useState<ExtrudeFeature[]>([]);
  const [booleanFeatures, setBooleanFeatures] = useState<BooleanFeature[]>([]);
  const [featureOrder, setFeatureOrder] = useState<FeatureOrderItem[]>([]);
  const [dimensions, setDimensions] = useState<DistanceDimension[]>([]);
  const [selectedObject, setSelectedObject] = useState<SceneSelection>(null);
  const [secondarySelection, setSecondarySelection] =
    useState<SceneSelection>(null);
  const [circlePreview, setCirclePreview] = useState<{
    planeId: string;
    planePosition: Vector3Tuple;
    planeRotation: Vector3Tuple;
    planeScale: Vector3Tuple;
    center: [number, number];
    radius: number;
    dragging: boolean;
  } | null>(null);
  const [rectanglePreview, setRectanglePreview] = useState<{
    planeId: string;
    planePosition: Vector3Tuple;
    planeRotation: Vector3Tuple;
    planeScale: Vector3Tuple;
    center: [number, number];
    width: number;
    height: number;
    dragging: boolean;
  } | null>(null);
  const [historyEntries, setHistoryEntries] = useState<SceneHistoryEntry[]>([
    {
      id: "history-0",
      label: "Initial",
      snapshot: cloneSceneSnapshot({
        workPlanes: [],
        sketchCircles: [],
        sketchRectangles: [],
        sketchFeatures: [],
        solidBodies: [],
        extrudeFeatures: [],
        booleanFeatures: [],
        featureOrder: [],
        dimensions: [],
        primarySelection: null,
        secondarySelection: null,
      }),
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [sketchModeActive, setSketchModeActive] = useState(false);
  const [activeSketchTool, setActiveSketchTool] = useState<SketchTool>(null);
  const [selectedSketchCircleId, setSelectedSketchCircleId] = useState<string | null>(null);
  const [selectedSolidBodyId, setSelectedSolidBodyId] = useState<string | null>(null);
  const [selectedSolidFace, setSelectedSolidFace] = useState<{
    bodyId: string;
    faceId: BodyFaceId;
  } | null>(null);
  const [entitySelection, setEntitySelection] = useState<CadEntitySelection>(null);
  const [selectedFeatureNode, setSelectedFeatureNode] = useState<{
    kind: "sketch" | "extrude" | "boolean";
    id: string;
  } | null>(null);
  const [circleRadiusDraft, setCircleRadiusDraft] = useState("12");
  const [circleDiameterDraft, setCircleDiameterDraft] = useState("24");
  const [rectangleWidthDraft, setRectangleWidthDraft] = useState("24");
  const [rectangleHeightDraft, setRectangleHeightDraft] = useState("16");
  const [extrudeDepthDraft, setExtrudeDepthDraft] = useState("20");
  const [booleanTargetBodyId, setBooleanTargetBodyId] = useState<string | null>(null);
  const [booleanToolBodyId, setBooleanToolBodyId] = useState<string | null>(null);
  const [booleanOperation, setBooleanOperation] =
    useState<BooleanOperation>("union");
  const [booleanModeActive, setBooleanModeActive] = useState(false);
  const [booleanStep, setBooleanStep] = useState<"idle" | "pick-base" | "pick-tool" | "ready">(
    "idle"
  );
  const [booleanPreviewMeshData, setBooleanPreviewMeshData] = useState<
    SolidBody["meshData"] | null
  >(null);
  const [activeSketchPlane, setActiveSketchPlane] = useState<{
    id: string;
    sourceKind: "workplane" | "face";
    sourceBodyId?: string;
    sourceFaceId?: BodyFaceId;
    name: string;
    position: Vector3Tuple;
    rotation: Vector3Tuple;
    scale: Vector3Tuple;
  } | null>(null);
  const [moveReferenceBodyId, setMoveReferenceBodyId] = useState<string | null>(null);
  const [moveHoveredAxis, setMoveHoveredAxis] = useState<TransformAxis>(null);
  const [moveDragState, setMoveDragState] = useState<{
    axis: Exclude<TransformAxis, null>;
    startMouse: MousePosition;
    startPosition: Vector3Tuple;
    startSnapshot: SceneSnapshot;
  } | null>(null);
  const [movePositionDraft, setMovePositionDraft] = useState({
    x: "0.00",
    y: "0.00",
    z: "0.00",
  });
  const [extrudeModeArmed, setExtrudeModeArmed] = useState(false);
  const [extrudePreview, setExtrudePreview] = useState<{
    sourceSketchId: string;
    sourceProfileType: "circle" | "rectangle";
    planePosition: Vector3Tuple;
    planeRotation: Vector3Tuple;
    planeScale: Vector3Tuple;
    center: [number, number];
    radius?: number;
    width?: number;
    height?: number;
    depth: number;
    direction: 1 | -1;
  } | null>(null);

  // --------------------------------------------
  // Snapshot / History Helpers
  // --------------------------------------------

  const getCurrentSceneSnapshot = useCallback(
    (): SceneSnapshot =>
      cloneSceneSnapshot({
        workPlanes: workPlanesRef.current,
        sketchCircles,
        sketchRectangles,
        sketchFeatures,
        solidBodies,
        extrudeFeatures,
        booleanFeatures,
        featureOrder,
        dimensions: dimensionsRef.current,
        primarySelection: primarySelectionRef.current,
        secondarySelection: secondarySelectionRef.current,
      }),
    [
      extrudeFeatures,
      booleanFeatures,
      featureOrder,
      sketchCircles,
      sketchRectangles,
      sketchFeatures,
      solidBodies,
    ]
  );

  const applySceneSnapshot = useCallback((snapshot: SceneSnapshot) => {
    const nextSnapshot = cloneSceneSnapshot(snapshot);
    setWorkPlanes(nextSnapshot.workPlanes);
    setSketchCircles(nextSnapshot.sketchCircles);
    setSketchRectangles(nextSnapshot.sketchRectangles);
    setSketchFeatures(nextSnapshot.sketchFeatures);
    setSolidBodies(nextSnapshot.solidBodies);
    setExtrudeFeatures(nextSnapshot.extrudeFeatures);
    setBooleanFeatures(nextSnapshot.booleanFeatures ?? []);
    setFeatureOrder(nextSnapshot.featureOrder);
    setDimensions(nextSnapshot.dimensions);
    setSelectedObject(nextSnapshot.primarySelection);
    setSecondarySelection(nextSnapshot.secondarySelection);
  }, []);

  const commitSceneMutation = useCallback(
    (label: string, mutate: (snapshot: SceneSnapshot) => SceneSnapshot) => {
      const currentSnapshot = getCurrentSceneSnapshot();
      const nextSnapshot = cloneSceneSnapshot(
        mutate(cloneSceneSnapshot(currentSnapshot))
      );

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
    },
    [applySceneSnapshot, getCurrentSceneSnapshot, historyIndex]
  );

  const nextWorkPlaneId = useCallback(() => {
    const nextId = `work-plane-${workPlaneIdCounterRef.current}`;
    workPlaneIdCounterRef.current += 1;
    return nextId;
  }, []);

  const nextDimensionId = useCallback(() => {
    const nextId = `dimension-${dimensionIdCounterRef.current}`;
    dimensionIdCounterRef.current += 1;
    return nextId;
  }, []);

  const nextSketchCircleId = useCallback(() => {
    const nextId = `sketch-circle-${sketchCircleIdCounterRef.current}`;
    sketchCircleIdCounterRef.current += 1;
    return nextId;
  }, []);

  const nextSolidBodyId = useCallback(() => {
    const nextId = `solid-body-${solidBodyIdCounterRef.current}`;
    solidBodyIdCounterRef.current += 1;
    return nextId;
  }, []);

  const nextSketchFeatureId = useCallback(() => {
    const nextId = `sketch-feature-${sketchFeatureIdCounterRef.current}`;
    sketchFeatureIdCounterRef.current += 1;
    return nextId;
  }, []);

  const nextExtrudeFeatureId = useCallback(() => {
    const nextId = `extrude-feature-${extrudeFeatureIdCounterRef.current}`;
    extrudeFeatureIdCounterRef.current += 1;
    return nextId;
  }, []);

  const nextBooleanFeatureId = useCallback(() => {
    const nextId = `boolean-feature-${booleanFeatureIdCounterRef.current}`;
    booleanFeatureIdCounterRef.current += 1;
    return nextId;
  }, []);

  // --------------------------------------------
  // Camera / View Actions
  // --------------------------------------------

  const animateCameraTo = useCallback(
    (
      nextPosition: THREE.Vector3,
      nextTarget = DEFAULT_CAMERA_TARGET.clone()
    ) => {
      desiredPositionRef.current.copy(nextPosition);
      desiredTargetRef.current.copy(nextTarget);
      isAnimatingRef.current = true;
    },
    []
  );

  const applyView = useCallback(
    (action: ViewAction) => {
      const focusTarget = new THREE.Vector3(0, 0, 0);
      let focusExtent = 24;
      const focusSolid = selectedSolidFocusRef.current;
      const focusSketch = selectedSketchFocusRef.current;
      const focusPlane = selectedPlaneFocusRef.current;

      if (focusSolid) {
        const bodyWidth =
          focusSolid.profileType === "rectangle"
            ? focusSolid.width ?? 1
            : (focusSolid.radius ?? 0.5) * 2;
        const bodyHeight =
          focusSolid.profileType === "rectangle"
            ? focusSolid.height ?? 1
            : (focusSolid.radius ?? 0.5) * 2;
        focusTarget.set(
          focusSolid.planePosition[0] + focusSolid.center[0],
          focusSolid.planePosition[1] + focusSolid.center[1],
          focusSolid.planePosition[2]
        );
        focusExtent = Math.max(
          18,
          bodyWidth * 1.35,
          bodyHeight * 1.35,
          focusSolid.depth * 1.5
        );
      } else if (focusSketch) {
        const sketchExtent =
          focusSketch.profileType === "circle"
            ? focusSketch.radius * 2.8
            : Math.max(focusSketch.width, focusSketch.height) * 2.2;
        focusTarget.set(
          focusSketch.planePosition[0] + focusSketch.center[0],
          focusSketch.planePosition[1] + focusSketch.center[1],
          focusSketch.planePosition[2]
        );
        focusExtent = Math.max(16, sketchExtent);
      } else if (focusPlane) {
        focusTarget.set(...focusPlane.position);
        focusExtent = Math.max(
          22,
          focusPlane.size.width * focusPlane.scale[0] * 0.6,
          focusPlane.size.height * focusPlane.scale[1] * 0.6
        );
      }

      const baseDirection = getViewPosition(action).normalize();
      animateCameraTo(
        focusTarget.clone().addScaledVector(baseDirection, focusExtent),
        focusTarget
      );
    },
    [animateCameraTo]
  );

  // --------------------------------------------
  // Scene Mutations
  // --------------------------------------------

  const applyToolAction = useCallback(
    (action: ToolPieAction) => {
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
    },
    [commitSceneMutation, nextWorkPlaneId]
  );

  const updateSceneObjectPosition = useCallback(
    (selection: NonNullable<SceneSelection>, position: Vector3Tuple) => {
      if (selection.objectKind !== "plane") return;

      setWorkPlanes((existingPlanes) =>
        existingPlanes.map((plane) =>
          plane.id === selection.objectId ? { ...plane, position } : plane
        )
      );
    },
    []
  );

  const updateSceneObjectRotation = useCallback(
    (selection: NonNullable<SceneSelection>, rotation: Vector3Tuple) => {
      if (selection.objectKind !== "plane") return;

      setWorkPlanes((existingPlanes) =>
        existingPlanes.map((plane) =>
          plane.id === selection.objectId ? { ...plane, rotation } : plane
        )
      );
    },
    []
  );

  const updateSceneObjectScale = useCallback(
    (selection: NonNullable<SceneSelection>, scale: Vector3Tuple) => {
      if (selection.objectKind !== "plane") return;

      setWorkPlanes((existingPlanes) =>
        existingPlanes.map((plane) =>
          plane.id === selection.objectId ? { ...plane, scale } : plane
        )
      );
    },
    []
  );

  const deleteSelectedObject = useCallback(
    (selection: NonNullable<SceneSelection>) => {
      commitSceneMutation("Delete Object", (snapshot) => {
        if (selection.objectKind !== "plane") return snapshot;
        const removedCircleIds = snapshot.sketchCircles
          .filter((circle) => circle.planeId === selection.objectId)
          .map((circle) => circle.id);
        const removedRectangleIds = snapshot.sketchRectangles
          .filter((rectangle) => rectangle.planeId === selection.objectId)
          .map((rectangle) => rectangle.id);
        const removedProfileIds = [...removedCircleIds, ...removedRectangleIds];
        const removedBodyIds = snapshot.solidBodies
          .filter(
            (body) =>
              !!body.sourceSketchId && removedProfileIds.includes(body.sourceSketchId)
          )
          .map((body) => body.id);
        const removedSketchFeatureIds = snapshot.sketchFeatures
          .filter((feature) =>
            feature.profileIds.some((profileId) => removedProfileIds.includes(profileId))
          )
          .map((feature) => feature.id);
        const removedExtrudeFeatureIds = snapshot.extrudeFeatures
          .filter(
            (feature) =>
              removedProfileIds.includes(feature.sourceProfileId) ||
              removedBodyIds.includes(feature.bodyId)
          )
          .map((feature) => feature.id);
        const removedBooleanFeatureIds = snapshot.booleanFeatures
          .filter(
            (feature) =>
              removedBodyIds.includes(feature.targetBodyId) ||
              removedBodyIds.includes(feature.toolBodyId) ||
              removedBodyIds.includes(feature.resultBodyId)
          )
          .map((feature) => feature.id);
        const removedBooleanResultBodyIds = snapshot.booleanFeatures
          .filter((feature) => removedBooleanFeatureIds.includes(feature.id))
          .map((feature) => feature.resultBodyId);
        const allRemovedBodyIds = [...removedBodyIds, ...removedBooleanResultBodyIds];

        return {
          ...snapshot,
          workPlanes: snapshot.workPlanes.filter(
            (plane) => plane.id !== selection.objectId
          ),
          sketchCircles: snapshot.sketchCircles.filter(
            (circle) => circle.planeId !== selection.objectId
          ),
          sketchRectangles: snapshot.sketchRectangles.filter(
            (rectangle) => rectangle.planeId !== selection.objectId
          ),
          sketchFeatures: snapshot.sketchFeatures.filter(
            (feature) => !removedSketchFeatureIds.includes(feature.id)
          ),
          solidBodies: snapshot.solidBodies.filter((body) => {
            if (allRemovedBodyIds.includes(body.id)) return false;
            const sourceCircle = snapshot.sketchCircles.find(
              (circle) => circle.id === body.sourceSketchId
            );
            const sourceRectangle = snapshot.sketchRectangles.find(
              (rectangle) => rectangle.id === body.sourceSketchId
            );
            const sourcePlaneId = sourceCircle?.planeId ?? sourceRectangle?.planeId;
            return sourcePlaneId !== selection.objectId;
          }),
          extrudeFeatures: snapshot.extrudeFeatures.filter(
            (feature) => !removedExtrudeFeatureIds.includes(feature.id)
          ),
          booleanFeatures: snapshot.booleanFeatures.filter(
            (feature) => !removedBooleanFeatureIds.includes(feature.id)
          ),
          featureOrder: snapshot.featureOrder.filter((featureRef) => {
            if (featureRef.kind === "sketch") {
              return !removedSketchFeatureIds.includes(featureRef.id);
            }
            if (featureRef.kind === "extrude") {
              return !removedExtrudeFeatureIds.includes(featureRef.id);
            }
            return !removedBooleanFeatureIds.includes(featureRef.id);
          }),
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
      });
    },
    [commitSceneMutation]
  );

  const renameSelectedObject = useCallback(
    (selection: NonNullable<SceneSelection>, name: string) => {
      commitSceneMutation("Rename Object", (snapshot) => {
        if (selection.objectKind !== "plane") return snapshot;

        return {
          ...snapshot,
          workPlanes: snapshot.workPlanes.map((plane) =>
            plane.id === selection.objectId ? { ...plane, name } : plane
          ),
        };
      });
    },
    [commitSceneMutation]
  );

  const copySelectedObject = useCallback(
    (selection: NonNullable<SceneSelection>) => {
      if (selection.objectKind !== "plane") return;

      const plane = workPlanesRef.current.find(
        (item) => item.id === selection.objectId
      );

      if (!plane) return;

      setClipboardObject({
        kind: "plane",
        plane: {
          ...plane,
          position: [...plane.position],
          rotation: [...plane.rotation],
          scale: [...plane.scale],
          size: { ...plane.size },
        },
      });
    },
    []
  );

  const pasteClipboardObject = useCallback(() => {
    if (!clipboardObject) return;

    commitSceneMutation("Paste Object", (snapshot) => {
      if (clipboardObject.kind !== "plane") return snapshot;

      const pastedPlane: WorkPlane = {
        ...clipboardObject.plane,
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
    });
  }, [clipboardObject, commitSceneMutation, nextWorkPlaneId]);

  const cutSelectedObject = useCallback(
    (selection: NonNullable<SceneSelection>) => {
      copySelectedObject(selection);
      deleteSelectedObject(selection);
    },
    [copySelectedObject, deleteSelectedObject]
  );

  const createDistanceDimension = useCallback(
    (from: NonNullable<SceneSelection>, to: NonNullable<SceneSelection>) => {
      if (!isDimensionEligibleSelection(from) || !isDimensionEligibleSelection(to)) {
        return false;
      }
      if (areSelectionsEqual(from, to)) return false;
      if (dimensionExists(dimensionsRef.current, from, to)) return false;

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
      }));

      return true;
    },
    [commitSceneMutation, nextDimensionId]
  );

  const editDistanceDimension = useCallback(
    (dimensionId: string, currentValue: number) => {
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

      const dimension = dimensionsRef.current.find((item) => item.id === dimensionId);
      if (!dimension) {
        setViewportWarning("Dimension not found");
        return;
      }

      const fromPlane = getPlaneBySelection(workPlanesRef.current, dimension.from);
      const toPlane = getPlaneBySelection(workPlanesRef.current, dimension.to);
      const fromPoint = getSelectionAnchorPoint(dimension.from, workPlanesRef.current);
      const toPoint = getSelectionAnchorPoint(dimension.to, workPlanesRef.current);

      if (!fromPlane || !toPlane || !fromPoint || !toPoint) {
        setViewportWarning("Unable to resolve dimension references");
        return;
      }

      if (dimension.from.objectId === dimension.to.objectId) {
        const localFrom = getSelectionLocalAnchorPoint(
          dimension.from,
          workPlanesRef.current
        );
        const localTo = getSelectionLocalAnchorPoint(
          dimension.to,
          workPlanesRef.current
        );

        if (!localFrom || !localTo) {
          setViewportWarning("Unable to resolve same-plane references");
          return;
        }

        const localDelta = localTo.clone().sub(localFrom);
        const usesX = Math.abs(localDelta.x) > 0.0001;
        const usesY = Math.abs(localDelta.y) > 0.0001;

        if (!usesX && !usesY) {
          setViewportWarning("Zero-length dimensions are not editable");
          return;
        }

        commitSceneMutation("Edit Distance Dimension", (snapshot) => {
          const plane = snapshot.workPlanes.find((item) => item.id === fromPlane.id);
          if (!plane) return snapshot;

          const nextScale = [...plane.scale] as Vector3Tuple;
          const currentMeasured = getDistanceBetweenSelections(
            dimension.from,
            dimension.to,
            snapshot.workPlanes
          );

          if (!currentMeasured || currentMeasured <= 0) return snapshot;

          const uniformFactor = nextValue / currentMeasured;

          if (usesX && usesY) {
            nextScale[0] = clampScale(nextScale[0] * uniformFactor);
            nextScale[1] = clampScale(nextScale[1] * uniformFactor);
          } else if (usesX) {
            nextScale[0] = clampScale(nextValue / Math.abs(localDelta.x));
          } else if (usesY) {
            nextScale[1] = clampScale(nextValue / Math.abs(localDelta.y));
          }

          return {
            ...snapshot,
            workPlanes: snapshot.workPlanes.map((item) =>
              item.id === plane.id ? { ...item, scale: nextScale } : item
            ),
          };
        });

        return;
      }

      const direction = toPoint.clone().sub(fromPoint);
      const currentDistance = direction.length();

      if (currentDistance === 0) {
        setViewportWarning("Zero-length dimensions are not editable");
        return;
      }

      const delta = direction
        .normalize()
        .multiplyScalar(nextValue - currentDistance);
      const nextPlanePosition: Vector3Tuple = [
        toPlane.position[0] + delta.x,
        toPlane.position[1] + delta.y,
        toPlane.position[2] + delta.z,
      ];

      commitSceneMutation("Edit Distance Dimension", (snapshot) =>
        movePlaneInSnapshot(snapshot, toPlane.id, nextPlanePosition)
      );
    },
    [commitSceneMutation]
  );

  const selectedPlane = useMemo(() => {
    if (!selectedObject || selectedObject.objectKind !== "plane") return null;
    return workPlanes.find((plane) => plane.id === selectedObject.objectId) ?? null;
  }, [selectedObject, workPlanes]);

  const selectedSketchCircle = useMemo(
    () => sketchCircles.find((circle) => circle.id === selectedSketchCircleId) ?? null,
    [selectedSketchCircleId, sketchCircles]
  );
  const selectedSketchRectangle = useMemo(
    () =>
      sketchRectangles.find((rectangle) => rectangle.id === selectedSketchCircleId) ??
      null,
    [selectedSketchCircleId, sketchRectangles]
  );
  const selectedSketchProfile = selectedSketchCircle ?? selectedSketchRectangle;
  const getBodyTransform = useCallback(
    (body: SolidBody) =>
      body.transform ?? {
        position: [0, 0, 0] as Vector3Tuple,
        rotation: [0, 0, 0] as Vector3Tuple,
        scale: [1, 1, 1] as Vector3Tuple,
      },
    []
  );
  const selectedSolidBody = useMemo(
    () => solidBodies.find((body) => body.id === selectedSolidBodyId) ?? null,
    [selectedSolidBodyId, solidBodies]
  );
  const selectedSolidBodyTransform = useMemo(
    () => (selectedSolidBody ? getBodyTransform(selectedSolidBody) : null),
    [getBodyTransform, selectedSolidBody]
  );
  const visibleSolidBodies = useMemo(
    () => solidBodies.filter((body) => body.isVisible !== false),
    [solidBodies]
  );
  const consumedProfileIds = useMemo(
    () =>
      new Set(
        solidBodies
          .filter((body) => body.isVisible === false && !!body.sourceSketchId)
          .map((body) => body.sourceSketchId as string)
      ),
    [solidBodies]
  );
  const sceneSketchCircles = useMemo(
    () => sketchCircles.filter((circle) => !consumedProfileIds.has(circle.id)),
    [consumedProfileIds, sketchCircles]
  );
  const sceneSketchRectangles = useMemo(
    () => sketchRectangles.filter((rect) => !consumedProfileIds.has(rect.id)),
    [consumedProfileIds, sketchRectangles]
  );
  const sketchProfiles = useMemo(
    () =>
      [...sketchCircles, ...sketchRectangles].map((profile) => ({
        id: profile.id,
        name: profile.name,
        profileType: profile.profileType,
        hasExtrusion: solidBodies.some((body) => body.sourceSketchId === profile.id),
      })),
    [sketchCircles, sketchRectangles, solidBodies]
  );
  const bodyItems = useMemo(
    () =>
      visibleSolidBodies.map((body) => ({
        id: body.id,
        name: body.name,
      })),
    [visibleSolidBodies]
  );
  const booleanTargetBody = useMemo(
    () => solidBodies.find((body) => body.id === booleanTargetBodyId) ?? null,
    [booleanTargetBodyId, solidBodies]
  );
  const booleanToolBody = useMemo(
    () => solidBodies.find((body) => body.id === booleanToolBodyId) ?? null,
    [booleanToolBodyId, solidBodies]
  );
  const featureTree = useMemo(
    () =>
      featureOrder
        .map((featureRef) => {
          if (featureRef.kind === "sketch") {
            const sketchFeature = sketchFeatures.find(
              (feature) => feature.id === featureRef.id
            );
            if (!sketchFeature) return null;
            return {
              kind: "sketch" as const,
              id: sketchFeature.id,
              name: sketchFeature.name,
              children: sketchFeature.profileIds
                .map((profileId) => {
                  const profile = sketchCircles.find((circle) => circle.id === profileId);
                  const rectangle = sketchRectangles.find(
                    (item) => item.id === profileId
                  );
                  const profileEntity = profile ?? rectangle;
                  if (!profileEntity) return null;
                  return {
                    id: profileEntity.id,
                    name: profileEntity.name,
                  };
                })
                .filter((child): child is { id: string; name: string } => !!child),
            };
          }

          if (featureRef.kind === "extrude") {
            const extrudeFeature = extrudeFeatures.find(
              (feature) => feature.id === featureRef.id
            );
            if (!extrudeFeature) return null;
            return {
              kind: "extrude" as const,
              id: extrudeFeature.id,
              name: extrudeFeature.name,
              sourceProfileId: extrudeFeature.sourceProfileId,
            };
          }

          const booleanFeature = booleanFeatures.find(
            (feature) => feature.id === featureRef.id
          );
          if (!booleanFeature) return null;
          return {
            kind: "boolean" as const,
            id: booleanFeature.id,
            name: booleanFeature.name,
            operation: booleanFeature.operation,
          };
        })
        .filter(
          (
            item
          ): item is
            | {
                kind: "sketch";
                id: string;
                name: string;
                children: { id: string; name: string }[];
              }
            | {
                kind: "extrude";
                id: string;
                name: string;
                sourceProfileId: string;
              }
            | {
                kind: "boolean";
                id: string;
                name: string;
                operation: BooleanOperation;
              } => !!item
        ),
    [
      booleanFeatures,
      extrudeFeatures,
      featureOrder,
      sketchCircles,
      sketchRectangles,
      sketchFeatures,
    ]
  );

  const canExportStl = visibleSolidBodies.length > 0;
  const extrudeModeActive = extrudeModeArmed || extrudePreview !== null;
  const planeSelectionEnabled =
    toolsFlow === "sketch" && sketchPlaneSelectionMode;

  useEffect(() => {
    selectedPlaneFocusRef.current = selectedPlane;
  }, [selectedPlane]);

  useEffect(() => {
    selectedSketchFocusRef.current = selectedSketchProfile;
  }, [selectedSketchProfile]);

  useEffect(() => {
    selectedSolidFocusRef.current = selectedSolidBody;
  }, [selectedSolidBody]);

  const parsePositiveNumber = useCallback((value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }, []);

  const buildBodyMatrix = useCallback(
    (body: SolidBody) => {
      const transform = getBodyTransform(body);
      const transformMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(...transform.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation)),
        new THREE.Vector3(...transform.scale)
      );
      const planeMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(...body.planePosition),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...body.planeRotation)),
        new THREE.Vector3(...body.planeScale)
      );
      const localMatrix = new THREE.Matrix4();
      if (body.profileType === "circle") {
        localMatrix.compose(
          new THREE.Vector3(
            body.center[0],
            body.center[1],
            ((body.direction ?? 1) * body.depth) / 2
          ),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
          new THREE.Vector3(1, 1, 1)
        );
      } else if (body.profileType === "rectangle") {
        localMatrix.compose(
          new THREE.Vector3(
            body.center[0],
            body.center[1],
            ((body.direction ?? 1) * body.depth) / 2
          ),
          new THREE.Quaternion(),
          new THREE.Vector3(1, 1, 1)
        );
      } else {
        localMatrix.identity();
      }

      return transformMatrix.multiply(planeMatrix.multiply(localMatrix));
    },
    [getBodyTransform]
  );

  const createSketchPlaneFromBodyFace = useCallback(
    (body: SolidBody, faceId: BodyFaceId) => {
      const transform = getBodyTransform(body);
      const transformMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(...transform.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation)),
        new THREE.Vector3(...transform.scale)
      );
      const planeMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(...body.planePosition),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...body.planeRotation)),
        new THREE.Vector3(...body.planeScale)
      );

      const centerX = body.center[0];
      const centerY = body.center[1];
      const topZ = (body.direction ?? 1) * body.depth;
      const bottomZ = 0;
      let faceLocalPosition = new THREE.Vector3(centerX, centerY, topZ);
      let faceLocalQuaternion = new THREE.Quaternion();

      if (faceId === "bottom") {
        faceLocalPosition = new THREE.Vector3(centerX, centerY, bottomZ);
        faceLocalQuaternion.setFromEuler(new THREE.Euler(Math.PI, 0, 0));
      }

      if (faceId === "side") {
        const sideOffset =
          body.profileType === "circle"
            ? Math.max(0.1, body.radius ?? 0.1)
            : Math.max(0.1, (body.width ?? 0.1) / 2);
        const sideMidZ = ((body.direction ?? 1) * body.depth) / 2;
        faceLocalPosition = new THREE.Vector3(centerX + sideOffset, centerY, sideMidZ);
        faceLocalQuaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
      }

      const faceMatrix = new THREE.Matrix4()
        .makeRotationFromQuaternion(faceLocalQuaternion)
        .setPosition(faceLocalPosition);
      const worldMatrix = new THREE.Matrix4()
        .multiplyMatrices(transformMatrix, planeMatrix)
        .multiply(faceMatrix);

      const worldPosition = new THREE.Vector3();
      const worldQuaternion = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      worldMatrix.decompose(worldPosition, worldQuaternion, worldScale);

      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuaternion);
      worldPosition.add(normal.multiplyScalar(0.02));

      return {
        id: `face-plane-${body.id}-${faceId}`,
        sourceKind: "face" as const,
        sourceBodyId: body.id,
        sourceFaceId: faceId,
        name: `${faceId[0].toUpperCase()}${faceId.slice(1)} Face of ${body.name}`,
        position: [worldPosition.x, worldPosition.y, worldPosition.z] as Vector3Tuple,
        rotation: new THREE.Euler().setFromQuaternion(worldQuaternion).toArray().slice(0, 3) as Vector3Tuple,
        scale: [Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z)] as Vector3Tuple,
      };
    },
    [getBodyTransform]
  );

  const getBodyWorldBounds = useCallback(
    (body: SolidBody) => {
      const matrix = buildBodyMatrix(body);
      let geometry: THREE.BufferGeometry | null = null;

      if (body.profileType === "circle") {
        geometry = new THREE.CylinderGeometry(
          Math.max(0.1, body.radius ?? 0.1),
          Math.max(0.1, body.radius ?? 0.1),
          Math.max(0.1, body.depth),
          48
        );
      } else if (body.profileType === "rectangle") {
        geometry = new THREE.BoxGeometry(
          Math.max(0.1, body.width ?? 0.1),
          Math.max(0.1, body.height ?? 0.1),
          Math.max(0.1, body.depth)
        );
      } else if (body.meshData) {
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(body.meshData.positions, 3)
        );
        geometry.setAttribute(
          "normal",
          new THREE.Float32BufferAttribute(body.meshData.normals, 3)
        );
        geometry.setIndex(body.meshData.indices);
      }

      if (!geometry) return null;
      geometry.applyMatrix4(matrix);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox?.clone() ?? null;
      geometry.dispose();
      return box;
    },
    [buildBodyMatrix]
  );

  const updateBodyTransformPosition = useCallback((bodyId: string, position: Vector3Tuple) => {
    setSolidBodies((existingBodies) =>
      existingBodies.map((body) => {
        if (body.id !== bodyId) return body;
        const transform = getBodyTransform(body);
        return {
          ...body,
          transform: {
            ...transform,
            position: [...position] as Vector3Tuple,
          },
        };
      })
    );
  }, [getBodyTransform]);

  const applyCircleRadiusDraft = useCallback((nextRadiusText: string) => {
    setCircleRadiusDraft(nextRadiusText);
    const nextRadius = parsePositiveNumber(nextRadiusText);
    if (nextRadius !== null) {
      setCircleDiameterDraft((nextRadius * 2).toFixed(2));
      if (selectedSketchCircleId) {
        setSketchCircles((existingCircles) =>
          existingCircles.map((circle) =>
            circle.id === selectedSketchCircleId
              ? { ...circle, radius: nextRadius }
              : circle
          )
        );
        setExtrudePreview((current) =>
          current &&
          current.sourceSketchId === selectedSketchCircleId &&
          current.sourceProfileType === "circle"
            ? { ...current, radius: nextRadius }
            : current
        );
      }
    }
  }, [parsePositiveNumber, selectedSketchCircleId]);

  const applyCircleDiameterDraft = useCallback((nextDiameterText: string) => {
    setCircleDiameterDraft(nextDiameterText);
    const nextDiameter = parsePositiveNumber(nextDiameterText);
    if (nextDiameter !== null) {
      const nextRadius = nextDiameter / 2;
      setCircleRadiusDraft(nextRadius.toFixed(2));
      if (selectedSketchCircleId) {
        setSketchCircles((existingCircles) =>
          existingCircles.map((circle) =>
            circle.id === selectedSketchCircleId
              ? { ...circle, radius: nextRadius }
              : circle
          )
        );
        setExtrudePreview((current) =>
          current &&
          current.sourceSketchId === selectedSketchCircleId &&
          current.sourceProfileType === "circle"
            ? { ...current, radius: nextRadius }
            : current
        );
      }
    }
  }, [parsePositiveNumber, selectedSketchCircleId]);

  const applyRectangleWidthDraft = useCallback((nextWidthText: string) => {
    setRectangleWidthDraft(nextWidthText);
    const nextWidth = parsePositiveNumber(nextWidthText);
    if (nextWidth === null || !selectedSketchCircleId) return;

    setSketchRectangles((existingRectangles) =>
      existingRectangles.map((rectangle) =>
        rectangle.id === selectedSketchCircleId
          ? { ...rectangle, width: nextWidth }
          : rectangle
      )
    );
    setExtrudePreview((current) =>
      current &&
      current.sourceSketchId === selectedSketchCircleId &&
      current.sourceProfileType === "rectangle"
        ? { ...current, width: nextWidth }
        : current
    );
  }, [parsePositiveNumber, selectedSketchCircleId]);

  const applyRectangleHeightDraft = useCallback((nextHeightText: string) => {
    setRectangleHeightDraft(nextHeightText);
    const nextHeight = parsePositiveNumber(nextHeightText);
    if (nextHeight === null || !selectedSketchCircleId) return;

    setSketchRectangles((existingRectangles) =>
      existingRectangles.map((rectangle) =>
        rectangle.id === selectedSketchCircleId
          ? { ...rectangle, height: nextHeight }
          : rectangle
      )
    );
    setExtrudePreview((current) =>
      current &&
      current.sourceSketchId === selectedSketchCircleId &&
      current.sourceProfileType === "rectangle"
        ? { ...current, height: nextHeight }
        : current
    );
  }, [parsePositiveNumber, selectedSketchCircleId]);

  const createCircleSketch = useCallback(
    (
      center: [number, number],
      radius: number,
      plane: {
        id: string;
        position: Vector3Tuple;
        rotation: Vector3Tuple;
        scale: Vector3Tuple;
      },
      label = "Create Circle Sketch"
    ) => {
      commitSceneMutation(label, (snapshot) => {
        const nextCircle: SketchCircle = {
          id: nextSketchCircleId(),
          name: `Circle ${snapshot.sketchCircles.length + 1}`,
          profileType: "circle",
          planeId: plane.id,
          center,
          radius,
          planePosition: [...plane.position] as Vector3Tuple,
          planeRotation: [...plane.rotation] as Vector3Tuple,
          planeScale: [...plane.scale] as Vector3Tuple,
        };
        const nextSketchFeature: SketchFeature = {
          id: nextSketchFeatureId(),
          name: `Sketch ${snapshot.sketchFeatures.length + 1}`,
          planeId: plane.id,
          profileIds: [nextCircle.id],
        };

        return {
          ...snapshot,
          sketchCircles: [...snapshot.sketchCircles, nextCircle],
          sketchFeatures: [...snapshot.sketchFeatures, nextSketchFeature],
          featureOrder: [
            ...snapshot.featureOrder,
            { kind: "sketch", id: nextSketchFeature.id },
          ],
        };
      });
    },
    [commitSceneMutation, nextSketchCircleId, nextSketchFeatureId]
  );

  const createRectangleSketch = useCallback(
    (
      center: [number, number],
      width: number,
      height: number,
      plane: {
        id: string;
        position: Vector3Tuple;
        rotation: Vector3Tuple;
        scale: Vector3Tuple;
      },
      label = "Create Rectangle Sketch"
    ) => {
      commitSceneMutation(label, (snapshot) => {
        const nextRectangle: SketchRectangle = {
          id: nextSketchCircleId(),
          name: `Rectangle ${snapshot.sketchRectangles.length + 1}`,
          profileType: "rectangle",
          planeId: plane.id,
          center,
          width,
          height,
          planePosition: [...plane.position] as Vector3Tuple,
          planeRotation: [...plane.rotation] as Vector3Tuple,
          planeScale: [...plane.scale] as Vector3Tuple,
        };
        const nextSketchFeature: SketchFeature = {
          id: nextSketchFeatureId(),
          name: `Sketch ${snapshot.sketchFeatures.length + 1}`,
          planeId: plane.id,
          profileIds: [nextRectangle.id],
        };

        return {
          ...snapshot,
          sketchRectangles: [...snapshot.sketchRectangles, nextRectangle],
          sketchFeatures: [...snapshot.sketchFeatures, nextSketchFeature],
          featureOrder: [
            ...snapshot.featureOrder,
            { kind: "sketch", id: nextSketchFeature.id },
          ],
        };
      });
    },
    [commitSceneMutation, nextSketchCircleId, nextSketchFeatureId]
  );

  const beginExtrudePreviewForSketch = useCallback(
    (profile: SketchProfile) => {
      const depthValue = parsePositiveNumber(extrudeDepthDraft) ?? 20;
      setExtrudePreview({
        sourceSketchId: profile.id,
        sourceProfileType: profile.profileType,
        planePosition: [...profile.planePosition] as Vector3Tuple,
        planeRotation: [...profile.planeRotation] as Vector3Tuple,
        planeScale: [...profile.planeScale] as Vector3Tuple,
        center: [...profile.center] as [number, number],
        radius: profile.profileType === "circle" ? profile.radius : undefined,
        width: profile.profileType === "rectangle" ? profile.width : undefined,
        height: profile.profileType === "rectangle" ? profile.height : undefined,
        depth: Math.max(0.1, depthValue),
        direction: 1,
      });
      setSelectedSolidBodyId(null);
      setExtrudeModeArmed(true);
    },
    [extrudeDepthDraft, parsePositiveNumber]
  );

  const handleStartCircleFromClick = useCallback(() => {
    if (!activeSketchPlane) {
      setViewportWarning("Select a plane or face to sketch");
      return;
    }

    setSketchModeActive(true);
    setActiveSketchTool("circle");
    setCirclePreview(null);
    setRectanglePreview(null);
  }, [activeSketchPlane]);

  const handleStartRectangleFromClick = useCallback(() => {
    if (!activeSketchPlane) {
      setViewportWarning("Select a plane or face to sketch");
      return;
    }

    setSketchModeActive(true);
    setActiveSketchTool("rectangle");
    setCirclePreview(null);
    setRectanglePreview(null);
  }, [activeSketchPlane]);

  const handleFinalizeCirclePreview = useCallback(() => {
    if (!circlePreview || !activeSketchPlane) return;
    if (circlePreview.radius <= 0) return;

    createCircleSketch(
      [0, 0],
      circlePreview.radius,
      {
        id: activeSketchPlane.id,
        position: activeSketchPlane.position,
        rotation: activeSketchPlane.rotation,
        scale: activeSketchPlane.scale,
      },
      "Create Circle Sketch"
    );
    setSelectedSketchCircleId(`sketch-circle-${sketchCircleIdCounterRef.current - 1}`);
    setCirclePreview(null);
    setActiveSketchTool(null);
  }, [activeSketchPlane, circlePreview, createCircleSketch]);

  const handleFinalizeRectanglePreview = useCallback(() => {
    if (!rectanglePreview || !activeSketchPlane) return;
    if (rectanglePreview.width <= 0 || rectanglePreview.height <= 0) return;

    createRectangleSketch(
      rectanglePreview.center,
      rectanglePreview.width,
      rectanglePreview.height,
      {
        id: activeSketchPlane.id,
        position: activeSketchPlane.position,
        rotation: activeSketchPlane.rotation,
        scale: activeSketchPlane.scale,
      },
      "Create Rectangle Sketch"
    );
    setSelectedSketchCircleId(`sketch-circle-${sketchCircleIdCounterRef.current - 1}`);
    setRectanglePreview(null);
    setActiveSketchTool(null);
  }, [activeSketchPlane, createRectangleSketch, rectanglePreview]);

  const handleExtrudeSelectedSketch = useCallback(() => {
    const depthValue = parsePositiveNumber(extrudeDepthDraft);
    if (depthValue === null) {
      setViewportWarning("Enter a valid extrusion depth");
      return;
    }

    setExtrudeModeArmed(true);
    setSelectedSolidBodyId(null);
    if (selectedSketchProfile) {
      beginExtrudePreviewForSketch(selectedSketchProfile);
    } else {
      setViewportWarning("Extrude mode active: select a profile");
    }
  }, [
    beginExtrudePreviewForSketch,
    extrudeDepthDraft,
    parsePositiveNumber,
    selectedSketchProfile,
  ]);

  const handleExtrudePreviewDepthChange = useCallback((signedDepth: number) => {
    pendingExtrudeSignedDepthRef.current = signedDepth;
    if (extrudePreviewRafRef.current !== null) return;

    extrudePreviewRafRef.current = window.requestAnimationFrame(() => {
      extrudePreviewRafRef.current = null;
      const pendingDepth = pendingExtrudeSignedDepthRef.current;
      if (pendingDepth === null) return;
      pendingExtrudeSignedDepthRef.current = null;

      const direction: 1 | -1 = pendingDepth >= 0 ? 1 : -1;
      const depth = Math.max(0.1, Math.abs(pendingDepth));

      setExtrudePreview((current) => {
        if (!current) return current;
        if (
          current.direction === direction &&
          Math.abs(current.depth - depth) < 0.01
        ) {
          return current;
        }
        return { ...current, depth, direction };
      });
      setExtrudeDepthDraft(depth.toFixed(2));
    });
  }, []);

  const applyExtrudeDepthDraft = useCallback(
    (nextDepthText: string) => {
      setExtrudeDepthDraft(nextDepthText);
      const nextDepth = parsePositiveNumber(nextDepthText);
      if (nextDepth === null) return;

      setExtrudePreview((current) =>
        current ? { ...current, depth: Math.max(0.1, nextDepth) } : current
      );

      if (selectedSolidBodyId) {
        setSolidBodies((existingBodies) =>
          existingBodies.map((body) =>
            body.id === selectedSolidBodyId
              ? { ...body, depth: Math.max(0.1, nextDepth) }
              : body
          )
        );
        setExtrudeFeatures((existingFeatures) =>
          existingFeatures.map((feature) =>
            feature.bodyId === selectedSolidBodyId
              ? { ...feature, depth: Math.max(0.1, nextDepth) }
              : feature
          )
        );
      }
    },
    [parsePositiveNumber, selectedSolidBodyId]
  );

  const handleCancelExtrudePreview = useCallback(() => {
    setExtrudePreview(null);
    setExtrudeModeArmed(false);
  }, []);

  const handleSelectSketchCircle = useCallback(
    (id: string | null) => {
      setSelectedSketchCircleId(id);
      if (id) {
        setSelectedSolidBodyId(null);
        setSelectedSolidFace(null);
        setSelectedObject(null);
        setSecondarySelection(null);
        setEntitySelection({ kind: "profile", profileId: id });
        const sketchFeature = sketchFeatures.find((feature) =>
          feature.profileIds.includes(id)
        );
        setSelectedFeatureNode(
          sketchFeature ? { kind: "sketch", id: sketchFeature.id } : null
        );
        const clickedProfile =
          sketchCircles.find((circle) => circle.id === id) ??
          sketchRectangles.find((rectangle) => rectangle.id === id);
        if (extrudeModeArmed && clickedProfile) {
          beginExtrudePreviewForSketch(clickedProfile);
          return;
        }
      } else {
        setEntitySelection(null);
        setSelectedFeatureNode(null);
      }
      if (!extrudeModeArmed) {
        setExtrudePreview(null);
      }
    },
    [
      beginExtrudePreviewForSketch,
      extrudeModeArmed,
      sketchCircles,
      sketchFeatures,
      sketchRectangles,
    ]
  );

  const handleSelectSolidBody = useCallback((id: string | null) => {
    if (toolsFlow === "sketch" && sketchPlaneSelectionMode) {
      if (id) setViewportWarning("Select a face to set sketch plane");
      return;
    }

    setSelectedSolidBodyId(id);
    setSelectedSolidFace(null);
    if (id) {
      if (toolsFlow === "boolean" && booleanModeActive) {
        setSelectedSketchCircleId(null);
        setSelectedObject(null);
        setSecondarySelection(null);
        setEntitySelection({ kind: "body", bodyId: id });
        if (booleanStep === "pick-base") {
          setBooleanTargetBodyId(id);
          setBooleanToolBodyId(null);
          setBooleanStep("pick-tool");
          setViewportWarning("Boolean: select tool body");
        } else if (booleanStep === "pick-tool") {
          if (id === booleanTargetBodyId) {
            setViewportWarning("Select a different body as tool");
          } else {
            setBooleanToolBodyId(id);
            setBooleanStep("ready");
          }
        }
        return;
      }

      setSelectedSketchCircleId(null);
      setSelectedObject(null);
      setSecondarySelection(null);
      setEntitySelection({ kind: "body", bodyId: id });
      const booleanFeature = booleanFeatures.find(
        (feature) => feature.resultBodyId === id
      );
      if (booleanFeature) {
        setSelectedFeatureNode({ kind: "boolean", id: booleanFeature.id });
      } else {
        const extrudeFeature = extrudeFeatures.find((feature) => feature.bodyId === id);
        setSelectedFeatureNode(
          extrudeFeature ? { kind: "extrude", id: extrudeFeature.id } : null
        );
      }
    } else {
      setEntitySelection(null);
      setSelectedFeatureNode(null);
    }
    setExtrudePreview(null);
    setExtrudeModeArmed(false);
  }, [
    booleanFeatures,
    booleanModeActive,
    booleanStep,
    booleanTargetBodyId,
    extrudeFeatures,
    sketchPlaneSelectionMode,
    toolsFlow,
  ]);

  const handleSelectSolidFace = useCallback((bodyId: string, faceId: BodyFaceId) => {
    if (toolsFlow === "sketch" && sketchPlaneSelectionMode) {
      const body = solidBodies.find((item) => item.id === bodyId);
      if (!body) return;
      setSelectedSolidBodyId(bodyId);
      setSelectedSolidFace({ bodyId, faceId });
      setEntitySelection({ kind: "face", bodyId, faceId });
      setActiveSketchPlane(createSketchPlaneFromBodyFace(body, faceId));
      setSketchPlaneSelectionMode(false);
      setViewportWarning(`Sketch plane set: ${faceId} face on ${body.name}`);
      return;
    }

    setSelectedSolidBodyId(bodyId);
    setSelectedSolidFace({ bodyId, faceId });
    setSelectedSketchCircleId(null);
    setSelectedObject(null);
    setSecondarySelection(null);
    setEntitySelection({ kind: "face", bodyId, faceId });
    const booleanFeature = booleanFeatures.find(
      (feature) => feature.resultBodyId === bodyId
    );
    if (booleanFeature) {
      setSelectedFeatureNode({ kind: "boolean", id: booleanFeature.id });
    } else {
      const extrudeFeature = extrudeFeatures.find((feature) => feature.bodyId === bodyId);
      setSelectedFeatureNode(
        extrudeFeature ? { kind: "extrude", id: extrudeFeature.id } : null
      );
    }
    setExtrudePreview(null);
    setExtrudeModeArmed(false);
  }, [
    booleanFeatures,
    createSketchPlaneFromBodyFace,
    extrudeFeatures,
    sketchPlaneSelectionMode,
    solidBodies,
    toolsFlow,
  ]);

  const handleMoveAxisPointerDown = useCallback(
    (axis: Exclude<TransformAxis, null>, event: ThreeEvent<PointerEvent>) => {
      if (!selectedSolidBodyTransform) return;
      setMoveDragState({
        axis,
        startMouse: { x: event.clientX, y: event.clientY },
        startPosition: [...selectedSolidBodyTransform.position] as Vector3Tuple,
        startSnapshot: getCurrentSceneSnapshot(),
      });
      setMoveHoveredAxis(axis);
    },
    [getCurrentSceneSnapshot, selectedSolidBodyTransform]
  );

  const handleConfirmExtrudePreview = useCallback(() => {
    if (!extrudePreview) return;

    const pendingDepth = pendingExtrudeSignedDepthRef.current;
    pendingExtrudeSignedDepthRef.current = null;
    const preview =
      pendingDepth === null
        ? extrudePreview
        : {
            ...extrudePreview,
            direction: (pendingDepth >= 0 ? 1 : -1) as 1 | -1,
            depth: Math.max(0.1, Math.abs(pendingDepth)),
          };

    commitSceneMutation("Extrude Sketch", (snapshot) => {
      const sourceProfile =
        snapshot.sketchCircles.find((circle) => circle.id === preview.sourceSketchId) ??
        snapshot.sketchRectangles.find(
          (rectangle) => rectangle.id === preview.sourceSketchId
        );

      if (!sourceProfile) return snapshot;

      const nextBody: SolidBody = {
        id: nextSolidBodyId(),
        name: `Body ${snapshot.solidBodies.length + 1}`,
        isVisible: true,
        sourceSketchId: sourceProfile.id,
        sourceBooleanFeatureId: null,
        profileType: sourceProfile.profileType,
        radius: sourceProfile.profileType === "circle" ? sourceProfile.radius : undefined,
        width: sourceProfile.profileType === "rectangle" ? sourceProfile.width : undefined,
        height:
          sourceProfile.profileType === "rectangle" ? sourceProfile.height : undefined,
        depth: preview.depth,
        direction: preview.direction,
        center: [...sourceProfile.center] as [number, number],
        planePosition: [...sourceProfile.planePosition] as Vector3Tuple,
        planeRotation: [...sourceProfile.planeRotation] as Vector3Tuple,
        planeScale: [...sourceProfile.planeScale] as Vector3Tuple,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      };
      const nextExtrudeFeature: ExtrudeFeature = {
        id: nextExtrudeFeatureId(),
        name: `Extrude ${snapshot.extrudeFeatures.length + 1}`,
        sourceProfileId: sourceProfile.id,
        bodyId: nextBody.id,
        depth: preview.depth,
        direction: preview.direction,
      };

      return {
        ...snapshot,
        solidBodies: [...snapshot.solidBodies, nextBody],
        extrudeFeatures: [...snapshot.extrudeFeatures, nextExtrudeFeature],
        featureOrder: [
          ...snapshot.featureOrder,
          { kind: "extrude", id: nextExtrudeFeature.id },
        ],
      };
    });

    setExtrudeDepthDraft(preview.depth.toFixed(2));
    setExtrudePreview(null);
    setExtrudeModeArmed(false);
    setSelectedSolidBodyId(`solid-body-${solidBodyIdCounterRef.current - 1}`);
  }, [commitSceneMutation, extrudePreview, nextExtrudeFeatureId, nextSolidBodyId]);

  const handleExportStl = useCallback(() => {
    if (!exportRootRef.current) return;
    exportObjectToStl(exportRootRef.current, "design-export.stl");
  }, []);

  // --------------------------------------------
  // History Navigation
  // --------------------------------------------

  const undoScene = useCallback(() => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    applySceneSnapshot(historyEntries[nextIndex].snapshot);
  }, [applySceneSnapshot, historyEntries, historyIndex]);

  const redoScene = useCallback(() => {
    if (historyIndex >= historyEntries.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    applySceneSnapshot(historyEntries[nextIndex].snapshot);
  }, [applySceneSnapshot, historyEntries, historyIndex]);

  // --------------------------------------------
  // Derived Data
  // --------------------------------------------

  const transformTarget = useMemo<TransformTarget | null>(() => {
    if (selectedSolidBody) {
      const transform = getBodyTransform(selectedSolidBody);
      return {
        position: [...transform.position] as Vector3Tuple,
        rotation: [...transform.rotation] as Vector3Tuple,
        scale: [...transform.scale] as Vector3Tuple,
      };
    }
    if (!selectedPlane) return null;
    return {
      position: selectedPlane.position,
      rotation: selectedPlane.rotation,
      scale: selectedPlane.scale,
    };
  }, [getBodyTransform, selectedPlane, selectedSolidBody]);

  const selectedEntityType = useMemo<
    "none" | "body" | "plane" | "profile" | "face"
  >(() => {
    if (selectedSolidFace) return "face";
    if (selectedSolidBody) return "body";
    if (selectedSketchProfile) return "profile";
    if (selectedPlane) return "plane";
    return "none";
  }, [selectedPlane, selectedSketchProfile, selectedSolidBody, selectedSolidFace]);

  const selectedEntityLabel = useMemo(() => {
    if (selectedSolidFace && selectedSolidBody) {
      return `${selectedSolidFace.faceId} face on ${selectedSolidBody.name}`;
    }
    if (selectedSolidBody) return selectedSolidBody.name;
    if (selectedSketchProfile) return selectedSketchProfile.name;
    if (selectedPlane) return selectedPlane.name;
    return "No Selection";
  }, [selectedPlane, selectedSketchProfile, selectedSolidBody, selectedSolidFace]);

  const selectedObjectName = useMemo(
    () => (selectedEntityType === "plane" ? selectedPlane?.name ?? null : null),
    [selectedEntityType, selectedPlane]
  );

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
    onStateChange?.({
      workPlanes,
      dimensions,
      primarySelection: selectedObject,
      secondarySelection,
      historyEntries,
      historyIndex,
    });
  }, [
    dimensions,
    historyEntries,
    historyIndex,
    onStateChange,
    secondarySelection,
    selectedObject,
    workPlanes,
  ]);

  useEffect(() => {
    if (!selectionRequest || selectionRequest.workspace !== "cad") {
      return;
    }

    setSelectedObject(selectionRequest.selection);
    setSecondarySelection(null);
  }, [selectionRequest]);

  useEffect(() => {
    if (!renameRequest || renameRequest.workspace !== "cad") {
      return;
    }

    const selection = createSelection("plane", renameRequest.objectId, "object");
    renameSelectedObject(selection, renameRequest.nextName);
  }, [renameRequest, renameSelectedObject]);

  useEffect(() => {
    secondarySelectionRef.current = secondarySelection;
  }, [secondarySelection]);

  useEffect(() => {
    if (activeSketchPlane) return;
    setSketchModeActive(false);
    setActiveSketchTool(null);
    setCirclePreview(null);
    setRectanglePreview(null);
  }, [activeSketchPlane]);

  useEffect(
    () => () => {
      if (sketchPreviewRafRef.current !== null) {
        window.cancelAnimationFrame(sketchPreviewRafRef.current);
      }
      if (extrudePreviewRafRef.current !== null) {
        window.cancelAnimationFrame(extrudePreviewRafRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedSketchProfile) return;
    if (selectedSketchProfile.profileType === "circle") {
      setCircleRadiusDraft(selectedSketchProfile.radius.toFixed(2));
      setCircleDiameterDraft((selectedSketchProfile.radius * 2).toFixed(2));
      return;
    }
    setRectangleWidthDraft(selectedSketchProfile.width.toFixed(2));
    setRectangleHeightDraft(selectedSketchProfile.height.toFixed(2));
  }, [selectedSketchProfile]);

  useEffect(() => {
    const shouldDrawCursor =
      sketchModeActive &&
      (activeSketchTool === "circle" || activeSketchTool === "rectangle");
    const isDraggingSketch = !!(circlePreview?.dragging || rectanglePreview?.dragging);
    document.body.style.cursor = shouldDrawCursor
      ? isDraggingSketch
        ? "grabbing"
        : "crosshair"
      : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [activeSketchTool, circlePreview?.dragging, rectanglePreview?.dragging, sketchModeActive]);

  useEffect(() => {
    if (!selectedSketchCircleId) return;
    if (
      sketchCircles.some((circle) => circle.id === selectedSketchCircleId) ||
      sketchRectangles.some((rectangle) => rectangle.id === selectedSketchCircleId)
    ) {
      return;
    }
    setSelectedSketchCircleId(null);
  }, [selectedSketchCircleId, sketchCircles, sketchRectangles]);

  useEffect(() => {
    setSolidBodies((existingBodies) => {
      let changed = false;
      const nextBodies: SolidBody[] = [];

      for (const body of existingBodies) {
        if (!body.sourceSketchId) {
          nextBodies.push(body);
          continue;
        }

        const source =
          sketchCircles.find((circle) => circle.id === body.sourceSketchId) ??
          sketchRectangles.find((rectangle) => rectangle.id === body.sourceSketchId);
        if (!source) {
          changed = true;
          continue;
        }

        const sameGeometry =
          body.center[0] === source.center[0] &&
          body.center[1] === source.center[1] &&
          body.planePosition[0] === source.planePosition[0] &&
          body.planePosition[1] === source.planePosition[1] &&
          body.planePosition[2] === source.planePosition[2] &&
          body.planeRotation[0] === source.planeRotation[0] &&
          body.planeRotation[1] === source.planeRotation[1] &&
          body.planeRotation[2] === source.planeRotation[2] &&
          body.planeScale[0] === source.planeScale[0] &&
          body.planeScale[1] === source.planeScale[1] &&
          body.planeScale[2] === source.planeScale[2] &&
          body.profileType === source.profileType &&
          (source.profileType === "circle"
            ? body.radius === source.radius
            : body.width === source.width && body.height === source.height);

        if (sameGeometry) {
          nextBodies.push(body);
          continue;
        }

        changed = true;
        nextBodies.push({
          ...body,
          profileType: source.profileType,
          radius: source.profileType === "circle" ? source.radius : undefined,
          width: source.profileType === "rectangle" ? source.width : undefined,
          height: source.profileType === "rectangle" ? source.height : undefined,
          center: [...source.center] as [number, number],
          planePosition: [...source.planePosition] as Vector3Tuple,
          planeRotation: [...source.planeRotation] as Vector3Tuple,
          planeScale: [...source.planeScale] as Vector3Tuple,
        });
      }

      return changed ? nextBodies : existingBodies;
    });
  }, [sketchCircles, sketchRectangles]);

  useEffect(() => {
    setSketchFeatures((existingFeatures) => {
      let changed = false;
      const nextFeatures = existingFeatures
        .map((feature) => {
          const profileIds = feature.profileIds.filter((profileId) =>
            sketchCircles.some((circle) => circle.id === profileId) ||
            sketchRectangles.some((rectangle) => rectangle.id === profileId)
          );
          if (profileIds.length === 0) {
            changed = true;
            return null;
          }
          if (profileIds.length !== feature.profileIds.length) {
            changed = true;
            return { ...feature, profileIds };
          }
          return feature;
        })
        .filter((feature): feature is SketchFeature => !!feature);

      return changed ? nextFeatures : existingFeatures;
    });
  }, [sketchCircles, sketchRectangles]);

  useEffect(() => {
    setExtrudeFeatures((existingFeatures) => {
      let changed = false;
      const nextFeatures = existingFeatures
        .map((feature) => {
          const sourceExists = sketchCircles.some(
            (circle) => circle.id === feature.sourceProfileId
          ) ||
            sketchRectangles.some(
              (rectangle) => rectangle.id === feature.sourceProfileId
            );
          const body = solidBodies.find((item) => item.id === feature.bodyId);
          if (!sourceExists || !body) {
            changed = true;
            return null;
          }
          if (feature.depth !== body.depth || feature.direction !== body.direction) {
            changed = true;
            return {
              ...feature,
              depth: body.depth,
              direction: body.direction,
            };
          }
          return feature;
        })
        .filter((feature): feature is ExtrudeFeature => !!feature);

      return changed ? nextFeatures : existingFeatures;
    });
  }, [sketchCircles, sketchRectangles, solidBodies]);

  useEffect(() => {
    setFeatureOrder((existingOrder) => {
      const nextOrder = existingOrder.filter((entry) =>
        entry.kind === "sketch"
          ? sketchFeatures.some((feature) => feature.id === entry.id)
          : entry.kind === "extrude"
            ? extrudeFeatures.some((feature) => feature.id === entry.id)
            : booleanFeatures.some((feature) => feature.id === entry.id)
      );
      return nextOrder.length === existingOrder.length ? existingOrder : nextOrder;
    });
  }, [booleanFeatures, extrudeFeatures, sketchFeatures]);

  useEffect(() => {
    setBooleanFeatures((existingFeatures) => {
      const nextFeatures = existingFeatures.filter(
        (feature) =>
          solidBodies.some((body) => body.id === feature.targetBodyId) &&
          solidBodies.some((body) => body.id === feature.toolBodyId) &&
          solidBodies.some((body) => body.id === feature.resultBodyId)
      );
      return nextFeatures.length === existingFeatures.length
        ? existingFeatures
        : nextFeatures;
    });
  }, [solidBodies]);

  useEffect(() => {
    setSolidBodies((existingBodies) => {
      const nextBodies = existingBodies.filter((body) =>
        body.sourceBooleanFeatureId
          ? booleanFeatures.some((feature) => feature.id === body.sourceBooleanFeatureId)
          : true
      );
      return nextBodies.length === existingBodies.length ? existingBodies : nextBodies;
    });
  }, [booleanFeatures]);

  useEffect(() => {
    setSolidBodies((existingBodies) => {
      let changed = false;
      const nextBodies = existingBodies.map((body) => ({ ...body }));
      const byId = new Map(nextBodies.map((body) => [body.id, body]));
      const orderedBooleanFeatures = featureOrder
        .filter(
          (entry): entry is { kind: "boolean"; id: string } =>
            entry.kind === "boolean"
        )
        .map((entry) => booleanFeatures.find((feature) => feature.id === entry.id))
        .filter((feature): feature is BooleanFeature => !!feature);

      for (const feature of orderedBooleanFeatures) {
        const resultBody = byId.get(feature.resultBodyId);
        const targetBody = byId.get(feature.targetBodyId);
        const toolBody = byId.get(feature.toolBodyId);
        if (!resultBody || !targetBody || !toolBody) continue;

        const meshData = buildBooleanMeshData(targetBody, toolBody, feature.operation);
        if (!meshData) continue;
        if (!meshDataEqual(resultBody.meshData, meshData)) {
          resultBody.profileType = "mesh";
          resultBody.meshData = meshData;
          resultBody.sourceSketchId = null;
          resultBody.sourceBooleanFeatureId = feature.id;
          resultBody.center = [0, 0];
          resultBody.planePosition = [0, 0, 0];
          resultBody.planeRotation = [0, 0, 0];
          resultBody.planeScale = [1, 1, 1];
          resultBody.transform = {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          };
          changed = true;
        }
      }

      return changed ? nextBodies : existingBodies;
    });
  }, [booleanFeatures, featureOrder, solidBodies]);

  useEffect(() => {
    if (extrudePreview) {
      setExtrudeDepthDraft(extrudePreview.depth.toFixed(2));
      return;
    }
    if (selectedSolidBody) {
      setExtrudeDepthDraft(selectedSolidBody.depth.toFixed(2));
    }
  }, [extrudePreview, selectedSolidBody]);

  useEffect(() => {
    if (!selectedSolidBodyId) return;
    if (solidBodies.some((body) => body.id === selectedSolidBodyId)) return;
    setSelectedSolidBodyId(null);
    setSelectedSolidFace(null);
  }, [selectedSolidBodyId, solidBodies]);

  useEffect(() => {
    if (!activeSketchPlane) return;
    if (activeSketchPlane.sourceKind === "workplane") {
      const workPlaneId = activeSketchPlane.id.replace("workplane-", "");
      if (workPlanes.some((plane) => plane.id === workPlaneId)) return;
      setActiveSketchPlane(null);
      setSketchModeActive(false);
      setActiveSketchTool(null);
      return;
    }
    if (
      activeSketchPlane.sourceKind === "face" &&
      activeSketchPlane.sourceBodyId &&
      solidBodies.some((body) => body.id === activeSketchPlane.sourceBodyId)
    ) {
      return;
    }
    setActiveSketchPlane(null);
    setSketchModeActive(false);
    setActiveSketchTool(null);
  }, [activeSketchPlane, solidBodies, workPlanes]);

  useEffect(() => {
    if (toolsFlow === "move") return;
    setMoveDragState(null);
    setMoveHoveredAxis(null);
  }, [toolsFlow]);

  useEffect(() => {
    setSolidBodies((existingBodies) => {
      let changed = false;
      const nextBodies = existingBodies.map((body) => {
        if (body.transform) return body;
        changed = true;
        return {
          ...body,
          transform: {
            position: [0, 0, 0] as Vector3Tuple,
            rotation: [0, 0, 0] as Vector3Tuple,
            scale: [1, 1, 1] as Vector3Tuple,
          },
        };
      });
      return changed ? nextBodies : existingBodies;
    });
  }, []);

  useEffect(() => {
    if (!selectedSolidBodyTransform) return;
    setMovePositionDraft({
      x: selectedSolidBodyTransform.position[0].toFixed(2),
      y: selectedSolidBodyTransform.position[1].toFixed(2),
      z: selectedSolidBodyTransform.position[2].toFixed(2),
    });
  }, [selectedSolidBodyTransform]);

  useEffect(() => {
    if (!moveReferenceBodyId) return;
    if (moveReferenceBodyId === selectedSolidBodyId) {
      setMoveReferenceBodyId(null);
      return;
    }
    if (solidBodies.some((body) => body.id === moveReferenceBodyId)) return;
    setMoveReferenceBodyId(null);
  }, [moveReferenceBodyId, selectedSolidBodyId, solidBodies]);

  useEffect(() => {
    if (!extrudePreview) return;
    const sourceExists =
      sketchCircles.some(
      (circle) => circle.id === extrudePreview.sourceSketchId
      ) ||
      sketchRectangles.some(
        (rectangle) => rectangle.id === extrudePreview.sourceSketchId
      );
    if (!sourceExists) {
      setExtrudePreview(null);
      setExtrudeModeArmed(false);
    }
  }, [extrudePreview, sketchCircles, sketchRectangles]);

  useEffect(() => {
    if (!booleanModeActive || !booleanTargetBodyId || !booleanToolBodyId) {
      setBooleanPreviewMeshData(null);
      return;
    }

    const targetBody = solidBodies.find((body) => body.id === booleanTargetBodyId);
    const toolBody = solidBodies.find((body) => body.id === booleanToolBodyId);
    if (!targetBody || !toolBody) {
      setBooleanPreviewMeshData(null);
      return;
    }

    const meshData = buildBooleanMeshData(targetBody, toolBody, booleanOperation);
    setBooleanPreviewMeshData(meshData);
    setBooleanStep(meshData ? "ready" : "pick-tool");
  }, [
    booleanModeActive,
    booleanOperation,
    booleanTargetBodyId,
    booleanToolBodyId,
    solidBodies,
  ]);

  // --------------------------------------------
  // Body Move Drag
  // --------------------------------------------

  useEffect(() => {
    if (!moveDragState || !selectedSolidBodyId) return;

    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - moveDragState.startMouse.x;
      const deltaY = event.clientY - moveDragState.startMouse.y;
      const nextPosition = [...moveDragState.startPosition] as Vector3Tuple;

      if (moveDragState.axis === "x") {
        nextPosition[0] = snapToIncrement(
          moveDragState.startPosition[0] + deltaX * PIXEL_TO_MM
        );
      } else if (moveDragState.axis === "y") {
        nextPosition[1] = snapToIncrement(
          moveDragState.startPosition[1] - deltaY * PIXEL_TO_MM
        );
      } else {
        nextPosition[2] = snapToIncrement(
          moveDragState.startPosition[2] - deltaY * PIXEL_TO_MM
        );
      }

      updateBodyTransformPosition(selectedSolidBodyId, nextPosition);
    };

    const handleMouseUp = () => {
      const currentSnapshot = getCurrentSceneSnapshot();
      if (!snapshotsEqual(moveDragState.startSnapshot, currentSnapshot)) {
        const nextEntry: SceneHistoryEntry = {
          id: `history-${historyEntryIdCounterRef.current}`,
          label: "Move Body",
          snapshot: currentSnapshot,
        };
        historyEntryIdCounterRef.current += 1;
        setHistoryEntries((existingEntries) => [
          ...existingEntries.slice(0, historyIndex + 1),
          nextEntry,
        ]);
        setHistoryIndex((index) => index + 1);
      }
      setMoveDragState(null);
      setMoveHoveredAxis(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    getCurrentSceneSnapshot,
    historyIndex,
    moveDragState,
    selectedSolidBodyId,
    updateBodyTransformPosition,
  ]);

  // --------------------------------------------
  // Transform Drag
  // --------------------------------------------

  useTransformDrag({
    transformDragState,
    historyIndex,
    getCurrentSceneSnapshot,
    setHistoryEntries,
    setHistoryIndex,
    historyEntryIdCounterRef,
    setTransformDragState,
    setHoveredTransformAxis,
    updateSceneObjectPosition,
    updateSceneObjectRotation,
    updateSceneObjectScale,
  });

  // --------------------------------------------
  // UI Side Effects
  // --------------------------------------------

  useEffect(() => {
    if (!viewportWarning) return;
    const timeoutId = window.setTimeout(() => {
      setViewportWarning(null);
    }, 1800);
    return () => window.clearTimeout(timeoutId);
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
  // Keyboard Shortcuts
  // --------------------------------------------

  const inspectorInputActive = useCallback(() => {
    const activeElement = document.activeElement;
    return (
      isRenamingObject ||
      editingTransformField !== null ||
      (activeElement instanceof HTMLElement &&
        activeElement.closest(".inspector-window") !== null &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA"))
    );
  }, [editingTransformField, isRenamingObject]);

  const keyboardArgs = useMemo(
    () => ({
      enabled: isActive,
      mouseRef,
      pieCenter,
      toolsPieCenter,
      transformPieCenter,
      selectedAction,
      selectedToolAction,
      hoveredTransformMode,
      selectedObject,
      secondarySelection,
      transformMode,
      transformDragState,
      pieOpenRef,
      pieCancelledRef,
      toolsPieOpenRef,
      toolsPieCancelledRef,
      transformPieOpenRef,
      transformPieCancelledRef,
      setSelectedAction,
      setSelectedToolAction,
      setHoveredTransformMode,
      setPieOpen,
      setToolsPieOpen,
      setTransformPieOpen,
      setPieCenter,
      setToolsPieCenter,
      setTransformPieCenter,
      setTransformMode,
      setViewportWarning,
      applyView,
      applyToolAction,
      undoScene,
      redoScene,
      copySelectedObject,
      pasteClipboardObject,
      cutSelectedObject,
      deleteSelectedObject,
      createDistanceDimension,
      inspectorInputActive,
      dimensionsRef,
    }),
    [
      isActive,
      pieCenter,
      toolsPieCenter,
      transformPieCenter,
      selectedAction,
      selectedToolAction,
      hoveredTransformMode,
      selectedObject,
      secondarySelection,
      transformMode,
      transformDragState,
      applyView,
      applyToolAction,
      undoScene,
      redoScene,
      copySelectedObject,
      pasteClipboardObject,
      cutSelectedObject,
      deleteSelectedObject,
      createDistanceDimension,
      inspectorInputActive,
    ]
  );

  useKeyboardShortcuts(keyboardArgs);

  // --------------------------------------------
  // Render Handlers
  // --------------------------------------------

  const handleSceneSelection = useCallback(
    (selection: SceneSelection, additive: boolean) => {
      if (!selection) {
        if (!additive) {
          setSelectedObject(null);
          setSecondarySelection(null);
          setSelectedSketchCircleId(null);
          setSelectedSolidBodyId(null);
          setSelectedSolidFace(null);
          setExtrudePreview(null);
          setExtrudeModeArmed(false);
          setEntitySelection(null);
          setSelectedFeatureNode(null);
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

      if (
        toolsFlow === "sketch" &&
        sketchPlaneSelectionMode &&
        selection.objectKind === "plane"
      ) {
        const plane = workPlanes.find((item) => item.id === selection.objectId);
        if (plane) {
          setActiveSketchPlane({
            id: `workplane-${plane.id}`,
            sourceKind: "workplane",
            name: plane.name,
            position: [...plane.position] as Vector3Tuple,
            rotation: [...plane.rotation] as Vector3Tuple,
            scale: [...plane.scale] as Vector3Tuple,
          });
          setSketchPlaneSelectionMode(false);
          setViewportWarning(`Sketch plane set: ${plane.name}`);
        }
      }

      const isSameAsPrimary = areSelectionsEqual(selection, selectedObject);
      setSelectedObject(selection);
      setSelectedSketchCircleId(null);
      setSelectedSolidBodyId(null);
      setSelectedSolidFace(null);
      setExtrudePreview(null);
      setExtrudeModeArmed(false);
      setEntitySelection(null);
      setSelectedFeatureNode(null);
      if (!isSameAsPrimary) {
        setSecondarySelection(null);
      }
    },
    [secondarySelection, selectedObject, sketchPlaneSelectionMode, toolsFlow, workPlanes]
  );

  const handleTransformAxisPointerDown = useCallback(
    (
      axis: Exclude<TransformAxis, null>,
      event: ThreeEvent<PointerEvent>
    ) => {
      if (!transformMode || !selectedObject || !transformTarget) return;

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
    },
    [getCurrentSceneSnapshot, selectedObject, transformMode, transformTarget]
  );

  const handleSketchPlanePointerDown = useCallback(
    (localPoint: [number, number], planeState: {
      id: string;
      position: Vector3Tuple;
      rotation: Vector3Tuple;
      scale: Vector3Tuple;
    }) => {
      if (!sketchModeActive || !activeSketchTool || !activeSketchPlane) {
        return;
      }
      if (planeState.id !== activeSketchPlane.id) return;

      if (activeSketchTool === "circle") {
        const initialRadius = Math.max(0.1, Math.hypot(localPoint[0], localPoint[1]));

        setCirclePreview({
          planeId: planeState.id,
          planePosition: [...planeState.position] as Vector3Tuple,
          planeRotation: [...planeState.rotation] as Vector3Tuple,
          planeScale: [...planeState.scale] as Vector3Tuple,
          center: [0, 0],
          radius: initialRadius,
          dragging: true,
        });
        setRectanglePreview(null);
        return;
      }

      const width = Math.max(0.1, Math.abs(localPoint[0]));
      const height = Math.max(0.1, Math.abs(localPoint[1]));
      setRectanglePreview({
        planeId: planeState.id,
        planePosition: [...planeState.position] as Vector3Tuple,
        planeRotation: [...planeState.rotation] as Vector3Tuple,
        planeScale: [...planeState.scale] as Vector3Tuple,
        center: [0, 0],
        width: Math.max(0.1, width * 2),
        height: Math.max(0.1, height * 2),
        dragging: true,
      });
      setCirclePreview(null);
    },
    [activeSketchPlane, activeSketchTool, sketchModeActive]
  );

  const handleSketchPlanePointerMove = useCallback((localPoint: [number, number]) => {
    if (activeSketchTool === "circle") {
      const radius = Math.max(0.1, Math.hypot(localPoint[0], localPoint[1]));
      pendingSketchRadiusRef.current = radius;
    } else if (activeSketchTool === "rectangle") {
      pendingSketchRectangleRef.current = {
        width: Math.max(0.1, Math.abs(localPoint[0]) * 2),
        height: Math.max(0.1, Math.abs(localPoint[1]) * 2),
      };
    } else {
      return;
    }

    if (sketchPreviewRafRef.current !== null) return;

    sketchPreviewRafRef.current = window.requestAnimationFrame(() => {
      sketchPreviewRafRef.current = null;
      if (activeSketchTool === "circle") {
        const pendingRadius = pendingSketchRadiusRef.current;
        if (pendingRadius === null) return;
        pendingSketchRadiusRef.current = null;

        setCirclePreview((current) => {
          if (!current || !current.dragging) return current;
          if (Math.abs(current.radius - pendingRadius) < 0.01) return current;
          return { ...current, radius: pendingRadius };
        });
        return;
      }

      if (activeSketchTool === "rectangle") {
        const pendingRectangle = pendingSketchRectangleRef.current;
        if (!pendingRectangle) return;
        pendingSketchRectangleRef.current = null;

        setRectanglePreview((current) => {
          if (!current || !current.dragging) return current;
          return {
            ...current,
            width: pendingRectangle.width,
            height: pendingRectangle.height,
          };
        });
      }
    });
  }, [activeSketchTool]);

  const handleSketchPlanePointerUp = useCallback(() => {
    if (sketchPreviewRafRef.current !== null) {
      window.cancelAnimationFrame(sketchPreviewRafRef.current);
      sketchPreviewRafRef.current = null;
    }
    if (activeSketchTool === "circle") {
      const pendingRadius = pendingSketchRadiusRef.current;
      pendingSketchRadiusRef.current = null;
      if (pendingRadius !== null) {
        setCirclePreview((current) => {
          if (!current || !current.dragging) return current;
          return { ...current, radius: pendingRadius, dragging: false };
        });
        window.requestAnimationFrame(() => {
          handleFinalizeCirclePreview();
        });
        return;
      }

      setCirclePreview((current) => {
        if (!current || !current.dragging) return current;
        return { ...current, dragging: false };
      });
      handleFinalizeCirclePreview();
      return;
    }

    if (activeSketchTool === "rectangle") {
      const pendingRectangle = pendingSketchRectangleRef.current;
      pendingSketchRectangleRef.current = null;
      if (pendingRectangle) {
        setRectanglePreview((current) => {
          if (!current || !current.dragging) return current;
          return {
            ...current,
            width: pendingRectangle.width,
            height: pendingRectangle.height,
            dragging: false,
          };
        });
      } else {
        setRectanglePreview((current) => {
          if (!current || !current.dragging) return current;
          return { ...current, dragging: false };
        });
      }
      window.requestAnimationFrame(() => {
        handleFinalizeRectanglePreview();
      });
    }
  }, [activeSketchTool, handleFinalizeCirclePreview, handleFinalizeRectanglePreview]);

  const handleOpenSketchFlow = useCallback(() => {
    setToolsFlow("sketch");
    setSketchPlaneSelectionMode(false);
    setExtrudePreview(null);
    setExtrudeModeArmed(false);
  }, []);

  const handleOpenExtrudeFlow = useCallback(() => {
    setToolsFlow("extrude");
    setSketchModeActive(false);
    setActiveSketchTool(null);
    setCirclePreview(null);
    setRectanglePreview(null);
  }, []);

  const handleOpenBooleanFlow = useCallback(() => {
    setToolsFlow("boolean");
    setSketchModeActive(false);
    setActiveSketchTool(null);
    setCirclePreview(null);
    setRectanglePreview(null);
    setExtrudePreview(null);
    setExtrudeModeArmed(false);
  }, []);

  const handleOpenMoveFlow = useCallback(() => {
    setToolsFlow("move");
    setSketchModeActive(false);
    setActiveSketchTool(null);
    setCirclePreview(null);
    setRectanglePreview(null);
    setExtrudePreview(null);
    setExtrudeModeArmed(false);
    setBooleanModeActive(false);
    setBooleanStep("idle");
    setBooleanPreviewMeshData(null);
  }, []);

  const handleStartBooleanOperation = useCallback((operation: BooleanOperation) => {
    setToolsFlow("boolean");
    setBooleanOperation(operation);
    setBooleanTargetBodyId(null);
    setBooleanToolBodyId(null);
    setBooleanPreviewMeshData(null);
    setBooleanModeActive(true);
    setBooleanStep("pick-base");
    setViewportWarning("Boolean: select base body");
  }, []);

  const handleCancelBooleanMode = useCallback(() => {
    setBooleanModeActive(false);
    setBooleanStep("idle");
    setBooleanTargetBodyId(null);
    setBooleanToolBodyId(null);
    setBooleanPreviewMeshData(null);
  }, []);

  const handleDoneSketchFlow = useCallback(() => {
    setSketchModeActive(false);
    setSketchPlaneSelectionMode(false);
    setActiveSketchTool(null);
    setCirclePreview(null);
    setRectanglePreview(null);
    setToolsFlow("home");
  }, []);

  const handleBackToToolsFlow = useCallback(() => {
    setToolsFlow("home");
    setSketchPlaneSelectionMode(false);
    setBooleanModeActive(false);
    setBooleanStep("idle");
    setBooleanPreviewMeshData(null);
  }, []);

  const handleSketchSelectPlaneMode = useCallback(() => {
    if (toolsFlow !== "sketch") return;
    setSketchModeActive(false);
    setActiveSketchTool(null);
    setCirclePreview(null);
    setRectanglePreview(null);
    setSketchPlaneSelectionMode((current) => !current);
    setViewportWarning(
      sketchPlaneSelectionMode
        ? "Plane selection canceled"
        : "Sketch: select a workplane or body face"
    );
  }, [sketchPlaneSelectionMode, toolsFlow]);

  const handleMovePositionDraftChange = useCallback(
    (axis: "x" | "y" | "z", value: string) => {
      setMovePositionDraft((current) => ({ ...current, [axis]: value }));
      if (!selectedSolidBodyId) return;
      const nextValue = Number(value);
      if (!Number.isFinite(nextValue)) return;
      const currentPosition = selectedSolidBodyTransform?.position ?? [0, 0, 0];
      const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
      const nextPosition = [...currentPosition] as Vector3Tuple;
      nextPosition[axisIndex] = snapToIncrement(nextValue);
      updateBodyTransformPosition(selectedSolidBodyId, nextPosition);
    },
    [selectedSolidBodyId, selectedSolidBodyTransform?.position, updateBodyTransformPosition]
  );

  const handleSnapBodyToOrigin = useCallback(() => {
    if (!selectedSolidBodyId) return;
    commitSceneMutation("Snap Body To Origin", (snapshot) => ({
      ...snapshot,
      solidBodies: snapshot.solidBodies.map((body) => {
        if (body.id !== selectedSolidBodyId) return body;
        const transform = getBodyTransform(body);
        return {
          ...body,
          transform: {
            ...transform,
            position: [0, 0, 0],
          },
        };
      }),
    }));
  }, [commitSceneMutation, getBodyTransform, selectedSolidBodyId]);

  const handleDropBodyToGround = useCallback(() => {
    if (!selectedSolidBodyId) return;
    const body = solidBodies.find((item) => item.id === selectedSolidBodyId);
    if (!body) return;
    const bounds = getBodyWorldBounds(body);
    if (!bounds) return;
    const deltaZ = -bounds.min.z;
    if (Math.abs(deltaZ) < 1e-6) return;
    const currentTransform = getBodyTransform(body);
    const nextPosition: Vector3Tuple = [
      currentTransform.position[0],
      currentTransform.position[1],
      snapToIncrement(currentTransform.position[2] + deltaZ),
    ];
    commitSceneMutation("Drop Body To Ground", (snapshot) => ({
      ...snapshot,
      solidBodies: snapshot.solidBodies.map((item) => {
        if (item.id !== selectedSolidBodyId) return item;
        const transform = getBodyTransform(item);
        return {
          ...item,
          transform: {
            ...transform,
            position: nextPosition,
          },
        };
      }),
    }));
  }, [
    commitSceneMutation,
    getBodyTransform,
    getBodyWorldBounds,
    selectedSolidBodyId,
    solidBodies,
  ]);

  const handleCenterAlignBodies = useCallback(() => {
    if (!selectedSolidBodyId || !moveReferenceBodyId) return;
    if (selectedSolidBodyId === moveReferenceBodyId) return;
    const activeBody = solidBodies.find((body) => body.id === selectedSolidBodyId);
    const referenceBody = solidBodies.find((body) => body.id === moveReferenceBodyId);
    if (!activeBody || !referenceBody) return;
    const activeBounds = getBodyWorldBounds(activeBody);
    const referenceBounds = getBodyWorldBounds(referenceBody);
    if (!activeBounds || !referenceBounds) return;

    const activeCenter = activeBounds.getCenter(new THREE.Vector3());
    const referenceCenter = referenceBounds.getCenter(new THREE.Vector3());
    const delta = referenceCenter.sub(activeCenter);
    const transform = getBodyTransform(activeBody);
    const nextPosition: Vector3Tuple = [
      snapToIncrement(transform.position[0] + delta.x),
      snapToIncrement(transform.position[1] + delta.y),
      snapToIncrement(transform.position[2] + delta.z),
    ];

    commitSceneMutation("Center Align Bodies", (snapshot) => ({
      ...snapshot,
      solidBodies: snapshot.solidBodies.map((body) => {
        if (body.id !== selectedSolidBodyId) return body;
        const bodyTransform = getBodyTransform(body);
        return {
          ...body,
          transform: {
            ...bodyTransform,
            position: nextPosition,
          },
        };
      }),
    }));
  }, [
    commitSceneMutation,
    getBodyTransform,
    getBodyWorldBounds,
    moveReferenceBodyId,
    selectedSolidBodyId,
    solidBodies,
  ]);

  const handleConfirmBoolean = useCallback(() => {
    if (!booleanTargetBodyId || !booleanToolBodyId) {
      setViewportWarning("Select target and tool bodies");
      return;
    }
    if (booleanTargetBodyId === booleanToolBodyId) {
      setViewportWarning("Target and tool must be different bodies");
      return;
    }

    commitSceneMutation(
      `Boolean ${booleanOperation[0].toUpperCase()}${booleanOperation.slice(1)}`,
      (snapshot) => {
        const targetBody = snapshot.solidBodies.find(
          (body) => body.id === booleanTargetBodyId
        );
        const toolBody = snapshot.solidBodies.find(
          (body) => body.id === booleanToolBodyId
        );
        if (!targetBody || !toolBody) return snapshot;

        const meshData = buildBooleanMeshData(targetBody, toolBody, booleanOperation);
        if (!meshData) return snapshot;

        const resultBody: SolidBody = {
          id: nextSolidBodyId(),
          name: `Body ${snapshot.solidBodies.length + 1}`,
          isVisible: true,
          sourceSketchId: null,
          sourceBooleanFeatureId: nextBooleanFeatureId(),
          profileType: "mesh",
          meshData,
          depth: 1,
          direction: 1,
          center: [0, 0],
          planePosition: [0, 0, 0],
          planeRotation: [0, 0, 0],
          planeScale: [1, 1, 1],
          transform: {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
        };
        const nextBooleanFeature: BooleanFeature = {
          id: resultBody.sourceBooleanFeatureId!,
          name: `Boolean ${snapshot.booleanFeatures.length + 1}`,
          targetBodyId: targetBody.id,
          toolBodyId: toolBody.id,
          operation: booleanOperation,
          resultBodyId: resultBody.id,
        };

        return {
          ...snapshot,
          solidBodies: snapshot.solidBodies.map((body) =>
            body.id === targetBody.id || body.id === toolBody.id
              ? { ...body, isVisible: false }
              : body
          ).concat(resultBody),
          booleanFeatures: [...snapshot.booleanFeatures, nextBooleanFeature],
          featureOrder: [
            ...snapshot.featureOrder,
            { kind: "boolean", id: nextBooleanFeature.id },
          ],
        };
      }
    );
    setBooleanModeActive(false);
    setBooleanStep("idle");
    setBooleanPreviewMeshData(null);
    setSelectedSolidBodyId(`solid-body-${solidBodyIdCounterRef.current - 1}`);
  }, [
    booleanOperation,
    booleanTargetBodyId,
    booleanToolBodyId,
    commitSceneMutation,
    nextBooleanFeatureId,
    nextSolidBodyId,
  ]);

  const handleSelectSketchFeature = useCallback(
    (featureId: string) => {
      setSelectedFeatureNode({ kind: "sketch", id: featureId });
      setToolsFlow("sketch");
      const feature = sketchFeatures.find((item) => item.id === featureId);
      if (!feature || feature.profileIds.length === 0) return;
      handleSelectSketchCircle(feature.profileIds[0]);
    },
    [handleSelectSketchCircle, sketchFeatures]
  );

  const handleSelectExtrudeFeature = useCallback(
    (featureId: string) => {
      setSelectedFeatureNode({ kind: "extrude", id: featureId });
      setToolsFlow("extrude");
      const feature = extrudeFeatures.find((item) => item.id === featureId);
      if (!feature) return;
      setExtrudeDepthDraft(feature.depth.toFixed(2));
      handleSelectSolidBody(feature.bodyId);
    },
    [extrudeFeatures, handleSelectSolidBody]
  );

  const handleSelectBooleanFeature = useCallback(
    (featureId: string) => {
      setSelectedFeatureNode({ kind: "boolean", id: featureId });
      setToolsFlow("boolean");
      setBooleanModeActive(false);
      setBooleanStep("idle");
      setBooleanPreviewMeshData(null);
      const feature = booleanFeatures.find((item) => item.id === featureId);
      if (!feature) return;
      setBooleanTargetBodyId(feature.targetBodyId);
      setBooleanToolBodyId(feature.toolBodyId);
      setBooleanOperation(feature.operation);
      handleSelectSolidBody(feature.resultBodyId);
    },
    [booleanFeatures, handleSelectSolidBody]
  );

  const handleSelectFeatureProfile = useCallback(
    (profileId: string) => {
      setToolsFlow("sketch");
      handleSelectSketchCircle(profileId);
    },
    [handleSelectSketchCircle]
  );

  // --------------------------------------------
  // Render
  // --------------------------------------------

  return (
    <div className="app-shell">
      {isActive ? (
        <>
          <Scene3D
            controlsRef={controlsRef}
            desiredPositionRef={desiredPositionRef}
            desiredTargetRef={desiredTargetRef}
            isAnimatingRef={isAnimatingRef}
            cameraStateRef={cameraStateRef}
            workPlanes={workPlanes}
            planeSketches={planeSketches}
            sketchCircles={sceneSketchCircles}
            sketchRectangles={sceneSketchRectangles}
            sketchCirclePreview={circlePreview}
            sketchRectanglePreview={rectanglePreview}
            extrudePreview={extrudePreview}
            extrudeModeArmed={extrudeModeArmed}
            solidBodies={visibleSolidBodies}
            booleanModeActive={booleanModeActive}
            booleanBaseBodyId={booleanTargetBodyId}
            booleanToolBodyId={booleanToolBodyId}
            booleanPreviewMeshData={booleanPreviewMeshData}
            selectedSketchCircleId={selectedSketchCircleId}
            selectedSolidBodyId={selectedSolidBodyId}
            selectedSolidFace={selectedSolidFace}
            sketchModeActive={sketchModeActive}
            activeSketchPlane={toolsFlow === "sketch" ? activeSketchPlane : null}
            dimensions={dimensions}
            primarySelection={selectedObject}
            secondarySelection={secondarySelection}
            planeSelectionEnabled={planeSelectionEnabled}
            onSelectObject={handleSceneSelection}
            onSelectSketchCircle={handleSelectSketchCircle}
            onSelectSolidBody={handleSelectSolidBody}
            onSelectSolidFace={handleSelectSolidFace}
            onSketchPlanePointerDown={handleSketchPlanePointerDown}
            onSketchPlanePointerMove={handleSketchPlanePointerMove}
            onSketchPlanePointerUp={handleSketchPlanePointerUp}
            onExtrudePreviewDepthChange={handleExtrudePreviewDepthChange}
            onConfirmExtrudePreview={handleConfirmExtrudePreview}
            onCancelExtrudePreview={handleCancelExtrudePreview}
            moveModeActive={toolsFlow === "move" && !!selectedSolidBodyId}
            moveDragActive={!!moveDragState}
            moveHoveredAxis={moveHoveredAxis}
            moveGizmoTargetBodyId={selectedSolidBodyId}
            onMoveHoverAxis={setMoveHoveredAxis}
            onMoveAxisPointerDown={handleMoveAxisPointerDown}
            onDimensionOverlayChange={setDimensionOverlayItems}
            transformMode={transformMode}
            transformTarget={transformTarget}
            hoveredTransformAxis={hoveredTransformAxis}
            transformDragState={transformDragState}
            onHoverTransformAxis={setHoveredTransformAxis}
            onTransformAxisPointerDown={handleTransformAxisPointerDown}
            exportRootRef={exportRootRef}
          />

          <DimensionOverlay
            items={dimensionOverlayItems}
            onEditDimension={editDistanceDimension}
          />

          <ViewCubeOverlay cameraStateRef={cameraStateRef} onViewSelect={applyView} />
        </>
      ) : null}

      <UndoRedoOverlay
        canUndo={historyIndex > 0}
        canRedo={historyIndex < historyEntries.length - 1}
        onUndo={undoScene}
        onRedo={redoScene}
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
          if (nextName) renameSelectedObject(selectedObject, nextName);
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
            String(
              group === "scale"
                ? transformTarget.scale[axisIndex] * scaleBase
                : source[axisIndex]
            )
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
            const scaleBase = getScaleDisplayBase(
              selectedPlane,
              editingTransformField.axis
            );
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
        selectedEntityType={selectedEntityType}
        selectedEntityLabel={selectedEntityLabel}
        bodyPositionDraft={movePositionDraft}
        onBodyPositionDraftChange={handleMovePositionDraftChange}
        onSnapBodyToOrigin={handleSnapBodyToOrigin}
        onDropBodyToGround={handleDropBodyToGround}
        onCenterAlignBodies={handleCenterAlignBodies}
        canCenterAlignBodies={!!selectedSolidBodyId && !!moveReferenceBodyId}
        activeSketchPlaneName={activeSketchPlane?.name ?? "None"}
        sketchPlaneSelectionMode={sketchPlaneSelectionMode}
        onToggleSketchPlaneSelectionMode={handleSketchSelectPlaneMode}
        selectedSketchProfileType={selectedSketchProfile?.profileType ?? null}
        radiusDraft={circleRadiusDraft}
        diameterDraft={circleDiameterDraft}
        widthDraft={rectangleWidthDraft}
        heightDraft={rectangleHeightDraft}
      />

      <HistoryWindow
        collapsed={historyCollapsed}
        onToggleCollapsed={() => setHistoryCollapsed((current) => !current)}
        featureTree={featureTree}
        selectedFeatureNode={selectedFeatureNode}
        selectedProfileId={selectedSketchCircleId}
        onSelectSketchFeature={handleSelectSketchFeature}
        onSelectExtrudeFeature={handleSelectExtrudeFeature}
        onSelectBooleanFeature={handleSelectBooleanFeature}
        onSelectFeatureProfile={handleSelectFeatureProfile}
        historyEntries={historyEntries}
        historyIndex={historyIndex}
        onSelectHistoryIndex={(index) => {
          setHistoryIndex(index);
          applySceneSnapshot(historyEntries[index].snapshot);
        }}
      />

      {pieOpen && <CameraPieMenu center={pieCenter} selectedAction={selectedAction} />}
      <ToolsWindow
        collapsed={toolsCollapsed}
        onToggleCollapsed={() => setToolsCollapsed((current) => !current)}
        toolsFlow={toolsFlow}
        onOpenSketchFlow={handleOpenSketchFlow}
        onOpenExtrudeFlow={handleOpenExtrudeFlow}
        onOpenBooleanFlow={handleOpenBooleanFlow}
        onOpenMoveFlow={handleOpenMoveFlow}
        onBackToToolsFlow={handleBackToToolsFlow}
        onDoneSketchFlow={handleDoneSketchFlow}
        sketchPlaneSelectionMode={sketchPlaneSelectionMode}
        onToggleSketchPlaneSelectionMode={handleSketchSelectPlaneMode}
        sketchModeActive={sketchModeActive}
        onSetSketchModeActive={(active) => {
          if (active && !activeSketchPlane) {
            setViewportWarning("Select a plane or face to sketch");
            return;
          }
          if (active && sketchPlaneSelectionMode) {
            setSketchPlaneSelectionMode(false);
          }
          setSketchModeActive(active);
          if (!active) {
            setActiveSketchTool(null);
            setCirclePreview(null);
            setRectanglePreview(null);
          }
        }}
        activeSketchPlaneName={activeSketchPlane?.name ?? "No Plane Selected"}
        canSketch={!!activeSketchPlane}
        activeSketchTool={activeSketchTool}
        onActivateCircleTool={handleStartCircleFromClick}
        onActivateRectangleTool={handleStartRectangleFromClick}
        sketchProfiles={sketchProfiles}
        selectedSketchCircleId={selectedSketchCircleId}
        onSelectSketchProfile={handleSelectSketchCircle}
        bodyItems={bodyItems}
        selectedSolidBodyId={selectedSolidBodyId}
        selectedSolidFace={selectedSolidFace}
        onSelectBody={handleSelectSolidBody}
        selectedEntity={entitySelection}
        radiusDraft={circleRadiusDraft}
        diameterDraft={circleDiameterDraft}
        onRadiusDraftChange={applyCircleRadiusDraft}
        onDiameterDraftChange={applyCircleDiameterDraft}
        widthDraft={rectangleWidthDraft}
        heightDraft={rectangleHeightDraft}
        onWidthDraftChange={applyRectangleWidthDraft}
        onHeightDraftChange={applyRectangleHeightDraft}
        selectedSketchProfileName={selectedSketchProfile?.name ?? null}
        selectedSketchProfileType={selectedSketchProfile?.profileType ?? null}
        extrudeDepthDraft={extrudeDepthDraft}
        onExtrudeDepthDraftChange={applyExtrudeDepthDraft}
        onExtrude={handleExtrudeSelectedSketch}
        canExtrude={sketchProfiles.length > 0}
        extrudeModeActive={extrudeModeActive}
        extrudeModeWaiting={extrudeModeArmed && extrudePreview === null}
        liveExtrudeDepth={extrudePreview?.depth ?? null}
        onConfirmExtrude={handleConfirmExtrudePreview}
        onCancelExtrude={handleCancelExtrudePreview}
        onExportStl={handleExportStl}
        canExportStl={canExportStl}
        booleanModeActive={booleanModeActive}
        booleanStep={booleanStep}
        booleanOperation={booleanOperation}
        onStartBooleanOperation={handleStartBooleanOperation}
        onCancelBooleanMode={handleCancelBooleanMode}
        onConfirmBoolean={handleConfirmBoolean}
        booleanBaseBodyName={booleanTargetBody?.name ?? null}
        booleanToolBodyName={booleanToolBody?.name ?? null}
        booleanPreviewReady={!!booleanPreviewMeshData}
        movePositionDraft={movePositionDraft}
        onMovePositionDraftChange={handleMovePositionDraftChange}
        onSnapToOrigin={handleSnapBodyToOrigin}
        onDropToGround={handleDropBodyToGround}
        onCenterAlign={handleCenterAlignBodies}
        moveReferenceBodyId={moveReferenceBodyId}
        onMoveReferenceBodyChange={setMoveReferenceBodyId}
        moveDragActive={!!moveDragState}
      />
      {toolsPieOpen && (
        <ToolsPieMenu center={toolsPieCenter} selectedAction={selectedToolAction} />
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

export { CadWorkspace };
