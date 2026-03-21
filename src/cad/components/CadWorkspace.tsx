import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import {
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
  MIN_SCALE,
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
  getViewPosition,
  isDimensionEligibleSelection,
  movePlaneInSnapshot,
} from "../helpers/sceneMath";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useTransformDrag } from "../hooks/useTransformDrag";
import type {
  CameraState,
  ClipboardSceneObject,
  DimensionOverlayItem,
  DistanceDimension,
  EditingTransformField,
  MousePosition,
  PieAction,
  SketchCircle,
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
  const exportRootRef = useRef<THREE.Group | null>(null);

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
  const [solidBodies, setSolidBodies] = useState<SolidBody[]>([]);
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
  const [historyEntries, setHistoryEntries] = useState<SceneHistoryEntry[]>([
    {
      id: "history-0",
      label: "Initial",
      snapshot: cloneSceneSnapshot({
        workPlanes: [],
        sketchCircles: [],
        solidBodies: [],
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
  const [circleRadiusDraft, setCircleRadiusDraft] = useState("12");
  const [circleDiameterDraft, setCircleDiameterDraft] = useState("24");
  const [extrudeDepthDraft, setExtrudeDepthDraft] = useState("20");
  const [extrudePreview, setExtrudePreview] = useState<{
    sourceSketchId: string;
    planePosition: Vector3Tuple;
    planeRotation: Vector3Tuple;
    planeScale: Vector3Tuple;
    center: [number, number];
    radius: number;
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
        solidBodies,
        dimensions: dimensionsRef.current,
        primarySelection: primarySelectionRef.current,
        secondarySelection: secondarySelectionRef.current,
      }),
    [sketchCircles, solidBodies]
  );

  const applySceneSnapshot = useCallback((snapshot: SceneSnapshot) => {
    const nextSnapshot = cloneSceneSnapshot(snapshot);
    setWorkPlanes(nextSnapshot.workPlanes);
    setSketchCircles(nextSnapshot.sketchCircles);
    setSolidBodies(nextSnapshot.solidBodies);
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
      animateCameraTo(getViewPosition(action));
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

        return {
          ...snapshot,
          workPlanes: snapshot.workPlanes.filter(
            (plane) => plane.id !== selection.objectId
          ),
          sketchCircles: snapshot.sketchCircles.filter(
            (circle) => circle.planeId !== selection.objectId
          ),
          solidBodies: snapshot.solidBodies.filter((body) => {
            const sourceSketch = snapshot.sketchCircles.find(
              (circle) => circle.id === body.sourceSketchId
            );
            return sourceSketch?.planeId !== selection.objectId;
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

  const activeSketchPlane = useMemo(() => {
    if (!selectedPlane) return null;
    return {
      id: selectedPlane.id,
      position: selectedPlane.position,
      rotation: selectedPlane.rotation,
      scale: selectedPlane.scale,
    };
  }, [selectedPlane]);

  const selectedSketchCircle = useMemo(
    () => sketchCircles.find((circle) => circle.id === selectedSketchCircleId) ?? null,
    [selectedSketchCircleId, sketchCircles]
  );
  const selectedSolidBody = useMemo(
    () => solidBodies.find((body) => body.id === selectedSolidBodyId) ?? null,
    [selectedSolidBodyId, solidBodies]
  );

  const canExportStl = solidBodies.length > 0;
  const extrudeModeActive = extrudePreview !== null;
  const parsePositiveNumber = useCallback((value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }, []);

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
          current && current.sourceSketchId === selectedSketchCircleId
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
          current && current.sourceSketchId === selectedSketchCircleId
            ? { ...current, radius: nextRadius }
            : current
        );
      }
    }
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
          planeId: plane.id,
          center,
          radius,
          planePosition: [...plane.position] as Vector3Tuple,
          planeRotation: [...plane.rotation] as Vector3Tuple,
          planeScale: [...plane.scale] as Vector3Tuple,
        };

        return {
          ...snapshot,
          sketchCircles: [...snapshot.sketchCircles, nextCircle],
        };
      });
    },
    [commitSceneMutation, nextSketchCircleId]
  );

  const handleStartCircleFromClick = useCallback(() => {
    if (!activeSketchPlane) {
      setViewportWarning("Select a work plane to sketch");
      return;
    }

    setSketchModeActive(true);
    setActiveSketchTool("circle");
    setCirclePreview(null);
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

  const handleExtrudeSelectedSketch = useCallback(() => {
    if (!selectedSketchCircle) {
      setViewportWarning("Select a circle sketch to extrude");
      return;
    }

    const depthValue = Number(extrudeDepthDraft);
    if (!Number.isFinite(depthValue) || depthValue <= 0) {
      setViewportWarning("Enter a valid extrusion depth");
      return;
    }

    setExtrudePreview({
      sourceSketchId: selectedSketchCircle.id,
      planePosition: [...selectedSketchCircle.planePosition] as Vector3Tuple,
      planeRotation: [...selectedSketchCircle.planeRotation] as Vector3Tuple,
      planeScale: [...selectedSketchCircle.planeScale] as Vector3Tuple,
      center: [...selectedSketchCircle.center] as [number, number],
      radius: selectedSketchCircle.radius,
      depth: Math.max(0.1, depthValue),
      direction: 1,
    });
    setSelectedSolidBodyId(null);
  }, [extrudeDepthDraft, selectedSketchCircle]);

  const handleExtrudePreviewDepthChange = useCallback((signedDepth: number) => {
    setExtrudePreview((current) => {
      if (!current) return current;
      const direction: 1 | -1 = signedDepth >= 0 ? 1 : -1;
      const depth = Math.max(0.1, Math.abs(signedDepth));
      setExtrudeDepthDraft(depth.toFixed(2));
      return { ...current, depth, direction };
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
      }
    },
    [parsePositiveNumber, selectedSolidBodyId]
  );

  const handleCancelExtrudePreview = useCallback(() => {
    setExtrudePreview(null);
  }, []);

  const handleConfirmExtrudePreview = useCallback(() => {
    if (!extrudePreview) return;

    const preview = extrudePreview;

    commitSceneMutation("Extrude Sketch", (snapshot) => {
      const sourceCircle = snapshot.sketchCircles.find(
        (circle) => circle.id === preview.sourceSketchId
      );

      if (!sourceCircle) return snapshot;

      const nextBody: SolidBody = {
        id: nextSolidBodyId(),
        name: `Body ${snapshot.solidBodies.length + 1}`,
        sourceSketchId: sourceCircle.id,
        radius: sourceCircle.radius,
        depth: preview.depth,
        direction: preview.direction,
        center: [...sourceCircle.center] as [number, number],
        planePosition: [...sourceCircle.planePosition] as Vector3Tuple,
        planeRotation: [...sourceCircle.planeRotation] as Vector3Tuple,
        planeScale: [...sourceCircle.planeScale] as Vector3Tuple,
      };

      return {
        ...snapshot,
        solidBodies: [...snapshot.solidBodies, nextBody],
      };
    });

    setExtrudeDepthDraft(preview.depth.toFixed(2));
    setExtrudePreview(null);
    setSelectedSolidBodyId(`solid-body-${solidBodyIdCounterRef.current - 1}`);
  }, [commitSceneMutation, extrudePreview, nextSolidBodyId]);

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
    if (!selectedPlane) return null;

    return {
      position: selectedPlane.position,
      rotation: selectedPlane.rotation,
      scale: selectedPlane.scale,
    };
  }, [selectedPlane]);

  const selectedObjectName = useMemo(() => selectedPlane?.name ?? null, [selectedPlane]);

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
  }, [activeSketchPlane]);

  useEffect(() => {
    if (!selectedSketchCircle) return;
    setCircleRadiusDraft(selectedSketchCircle.radius.toFixed(2));
    setCircleDiameterDraft((selectedSketchCircle.radius * 2).toFixed(2));
  }, [selectedSketchCircle]);

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
    if (!extrudePreview) return;
    const sourceExists = sketchCircles.some(
      (circle) => circle.id === extrudePreview.sourceSketchId
    );
    if (!sourceExists) {
      setExtrudePreview(null);
    }
  }, [extrudePreview, sketchCircles]);

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
          setExtrudePreview(null);
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
      setSelectedSketchCircleId(null);
      setSelectedSolidBodyId(null);
      setExtrudePreview(null);
      if (!isSameAsPrimary) {
        setSecondarySelection(null);
      }
    },
    [secondarySelection, selectedObject]
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
      if (!sketchModeActive || activeSketchTool !== "circle" || !activeSketchPlane) {
        return;
      }
      if (planeState.id !== activeSketchPlane.id) return;

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
    },
    [activeSketchPlane, activeSketchTool, sketchModeActive]
  );

  const handleSketchPlanePointerMove = useCallback((localPoint: [number, number]) => {
    setCirclePreview((current) => {
      if (!current || !current.dragging) return current;
      const radius = Math.max(0.1, Math.hypot(localPoint[0], localPoint[1]));
      return { ...current, radius };
    });
  }, []);

  const handleSketchPlanePointerUp = useCallback(() => {
    setCirclePreview((current) => {
      if (!current || !current.dragging) return current;
      return { ...current, dragging: false };
    });
    handleFinalizeCirclePreview();
  }, [handleFinalizeCirclePreview]);

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
            sketchCircles={sketchCircles}
            sketchCirclePreview={circlePreview}
            extrudePreview={extrudePreview}
            solidBodies={solidBodies}
            selectedSketchCircleId={selectedSketchCircleId}
            selectedSolidBodyId={selectedSolidBodyId}
            sketchModeActive={sketchModeActive}
            activeSketchPlane={activeSketchPlane}
            dimensions={dimensions}
            primarySelection={selectedObject}
            secondarySelection={secondarySelection}
            onSelectObject={handleSceneSelection}
            onSelectSketchCircle={(id) => {
              setSelectedSketchCircleId(id);
              if (id) {
                setSelectedSolidBodyId(null);
                setSelectedObject(null);
                setSecondarySelection(null);
              }
              setExtrudePreview(null);
            }}
            onSelectSolidBody={(id) => {
              setSelectedSolidBodyId(id);
              if (id) {
                setSelectedSketchCircleId(null);
                setSelectedObject(null);
                setSecondarySelection(null);
              }
              setExtrudePreview(null);
            }}
            onSketchPlanePointerDown={handleSketchPlanePointerDown}
            onSketchPlanePointerMove={handleSketchPlanePointerMove}
            onSketchPlanePointerUp={handleSketchPlanePointerUp}
            onExtrudePreviewDepthChange={handleExtrudePreviewDepthChange}
            onConfirmExtrudePreview={handleConfirmExtrudePreview}
            onCancelExtrudePreview={handleCancelExtrudePreview}
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

      {pieOpen && <CameraPieMenu center={pieCenter} selectedAction={selectedAction} />}
      <ToolsWindow
        collapsed={toolsCollapsed}
        onToggleCollapsed={() => setToolsCollapsed((current) => !current)}
        sketchModeActive={sketchModeActive}
        onSetSketchModeActive={(active) => {
          if (active && !activeSketchPlane) {
            setViewportWarning("Select a work plane to sketch");
            return;
          }
          setSketchModeActive(active);
          if (!active) {
            setActiveSketchTool(null);
            setCirclePreview(null);
          }
        }}
        activeSketchPlaneName={selectedPlane?.name ?? "No Plane Selected"}
        canSketch={!!activeSketchPlane}
        activeSketchTool={activeSketchTool}
        onActivateCircleTool={handleStartCircleFromClick}
        radiusDraft={circleRadiusDraft}
        diameterDraft={circleDiameterDraft}
        onRadiusDraftChange={applyCircleRadiusDraft}
        onDiameterDraftChange={applyCircleDiameterDraft}
        selectedSketchCircleName={selectedSketchCircle?.name ?? null}
        extrudeDepthDraft={extrudeDepthDraft}
        onExtrudeDepthDraftChange={applyExtrudeDepthDraft}
        onExtrude={handleExtrudeSelectedSketch}
        canExtrude={!!selectedSketchCircle}
        extrudeModeActive={extrudeModeActive}
        liveExtrudeDepth={extrudePreview?.depth ?? null}
        onConfirmExtrude={handleConfirmExtrudePreview}
        onCancelExtrude={handleCancelExtrudePreview}
        onExportStl={handleExportStl}
        canExportStl={canExportStl}
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
