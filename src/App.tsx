import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import "./index.css";
import {
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
  MIN_SCALE,
  WORLD_UP,
} from "./cad/constants";
import {
  CameraPieMenu,
  DimensionOverlay,
  HistoryWindow,
  InspectorWindow,
  ToolsPieMenu,
  TransformPieMenu,
  UndoRedoOverlay,
  ViewportWarning,
} from "./cad/components/ui/Overlays";
import { Scene3D, ViewCubeOverlay } from "./cad/components/scene/Scene3D";
import {
  cloneSelection,
  cloneSceneSnapshot,
  snapshotsEqual,
} from "./cad/helpers/history";
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
} from "./cad/helpers/sceneMath";
import { useKeyboardShortcuts } from "./cad/hooks/useKeyboardShortcuts";
import { useTransformDrag } from "./cad/hooks/useTransformDrag";
import type {
  CameraState,
  ClipboardSceneObject,
  DimensionOverlayItem,
  DistanceDimension,
  EditingTransformField,
  MousePosition,
  PieAction,
  SceneHistoryEntry,
  SceneSelection,
  SceneSnapshot,
  ToolPieAction,
  TransformAxis,
  TransformDragState,
  TransformMode,
  TransformTarget,
  Vector3Tuple,
  ViewAction,
  WorkPlane,
} from "./cad/types";

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
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [clipboardObject, setClipboardObject] =
    useState<ClipboardSceneObject>(null);
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

  // --------------------------------------------
  // Snapshot / History Helpers
  // --------------------------------------------

  const getCurrentSceneSnapshot = useCallback(
    (): SceneSnapshot =>
      cloneSceneSnapshot({
        workPlanes: workPlanesRef.current,
        dimensions: dimensionsRef.current,
        primarySelection: primarySelectionRef.current,
        secondarySelection: secondarySelectionRef.current,
      }),
    []
  );

  const applySceneSnapshot = useCallback((snapshot: SceneSnapshot) => {
    const nextSnapshot = cloneSceneSnapshot(snapshot);
    setWorkPlanes(nextSnapshot.workPlanes);
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

  const selectedPlane = useMemo(() => {
    if (!selectedObject || selectedObject.objectKind !== "plane") return null;
    return workPlanes.find((plane) => plane.id === selectedObject.objectId) ?? null;
  }, [selectedObject, workPlanes]);

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
    secondarySelectionRef.current = secondarySelection;
  }, [secondarySelection]);

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
      mouse,
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
      setMouse,
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
      mouse,
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

  // --------------------------------------------
  // Render
  // --------------------------------------------

  return (
    <div className="app-shell">
      <Scene3D
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
        onTransformAxisPointerDown={handleTransformAxisPointerDown}
      />

      <DimensionOverlay
        items={dimensionOverlayItems}
        onEditDimension={editDistanceDimension}
      />

      <ViewCubeOverlay cameraStateRef={cameraStateRef} onViewSelect={applyView} />

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

export default App;
