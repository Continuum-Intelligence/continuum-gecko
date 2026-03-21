import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UndoRedoOverlay } from "../../cad/components/ui/Overlays";
import type { WorkPlane } from "../../cad/types";
import {
  CANVAS_BOARD_SIZE_MM,
  CANVAS_PIE_ITEMS,
  CANVAS_TOOL_LABEL_TIMEOUT_MS,
} from "../constants";
import { CanvasToolPieMenu } from "./CanvasToolPieMenu";
import { CanvasViewport } from "./CanvasViewport";
import type {
  CanvasHistoryEntry,
  CanvasMousePosition,
  CanvasPieAction,
  CanvasPoint,
  CanvasStroke,
  CanvasTool,
} from "../types";
import type {
  CanvasHierarchyState,
  HierarchyRenameRequest,
  HierarchySelectionRequest,
} from "../../shared/hierarchy/types";
import {
  boardPointToPlaneLocal,
  clonePlaneSketches,
  deleteStrokeFromSketches,
  findStrokeById,
  getPlaneSketchStrokes,
  planeLocalPointToBoard,
  renameStrokeInSketches,
  upsertPlaneSketchStrokes,
} from "../../shared/sketch/helpers";
import type { PlaneSketch } from "../../shared/sketch/types";

// ============================================
// HELPERS
// ============================================

function getHoveredCanvasPieAction(
  center: CanvasMousePosition,
  mouse: CanvasMousePosition
): CanvasPieAction {
  const dx = mouse.x - center.x;
  const dy = mouse.y - center.y;
  const distance = Math.hypot(dx, dy);

  if (distance < 26) {
    return "none";
  }

  let closestAction: CanvasPieAction = "none";
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const item of CANVAS_PIE_ITEMS) {
    const itemDistance = Math.hypot(dx - item.x, dy - item.y);
    if (itemDistance < closestDistance) {
      closestDistance = itemDistance;
      closestAction = item.action;
    }
  }

  return closestAction;
}

function formatCanvasToolLabel(action: CanvasPieAction) {
  if (action === "none") {
    return "Inking";
  }

  return action.charAt(0).toUpperCase() + action.slice(1);
}

function pointsEqual(a: CanvasPoint | null, b: CanvasPoint | null) {
  if (!a || !b) {
    return false;
  }

  return a.x === b.x && a.y === b.y;
}

function isTextInputActive() {
  const activeElement = document.activeElement;
  return (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    (activeElement instanceof HTMLElement && activeElement.isContentEditable)
  );
}

function offsetStrokePoint(
  point: CanvasPoint,
  offset: number,
  boardWidth: number,
  boardHeight: number
) {
  return {
    x: Math.min(boardWidth, point.x + offset),
    y: Math.min(boardHeight, point.y + offset),
  };
}

function mapStrokeToBoard(
  stroke: CanvasStroke,
  boardWidth: number,
  boardHeight: number
): CanvasStroke {
  return {
    ...stroke,
    points: stroke.points.map((point) =>
      planeLocalPointToBoard(point, boardWidth, boardHeight)
    ),
  };
}

function mapStrokeToPlaneLocal(
  stroke: CanvasStroke,
  boardWidth: number,
  boardHeight: number
): CanvasStroke {
  return {
    ...stroke,
    points: stroke.points.map((point) =>
      boardPointToPlaneLocal(point, boardWidth, boardHeight)
    ),
  };
}

function getStrokeHistoryLabel(stroke: CanvasStroke) {
  const start = stroke.points[0] ?? null;
  const end = stroke.points[stroke.points.length - 1] ?? null;

  if (!start || !end) {
    return "Diagonal Stroke";
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const diagonalTolerance = 10;

  if (absDx <= diagonalTolerance && absDy > absDx) {
    return "Vertical Stroke";
  }

  if (absDy <= diagonalTolerance && absDx > absDy) {
    return "Horizontal Stroke";
  }

  return "Diagonal Stroke";
}

function CanvasHistoryWindow({
  collapsed,
  onToggleCollapsed,
  historyEntries,
  historyIndex,
  onSelectHistoryIndex,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  historyEntries: CanvasHistoryEntry[];
  historyIndex: number;
  onSelectHistoryIndex: (index: number) => void;
}) {
  return (
    <>
      <button
        className={`history-tab history-tab--canvas${
          collapsed ? " history-tab--visible" : ""
        }`}
        onClick={onToggleCollapsed}
        type="button"
        aria-label="Expand history"
      >
        History
      </button>

      <div
        className={`history-window history-window--canvas${
          collapsed ? " history-window--hidden" : ""
        }`}
      >
        <div className="history-window__header">
          <div>
            <div className="history-window__eyebrow">History</div>
            <div className="history-window__title">Canvas Timeline</div>
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
// CANVAS WORKSPACE
// ============================================

export function CanvasWorkspace({
  isActive,
  workPlanes,
  planeSketches,
  activeTargetPlaneId,
  onPlaneSketchesChange,
  onActiveTargetPlaneChange,
  onStateChange,
  renameRequest,
  selectionRequest,
}: {
  isActive: boolean;
  workPlanes: WorkPlane[];
  planeSketches: PlaneSketch[];
  activeTargetPlaneId: string | null;
  onPlaneSketchesChange: (sketches: PlaneSketch[]) => void;
  onActiveTargetPlaneChange: (planeId: string | null) => void;
  onStateChange?: (state: CanvasHierarchyState) => void;
  renameRequest?: HierarchyRenameRequest | null;
  selectionRequest?: HierarchySelectionRequest | null;
}) {
  const historyIdRef = useRef(1);
  const strokeIdRef = useRef(1);
  const toolPieOpenRef = useRef(false);
  const toolPieCancelledRef = useRef(false);
  const planeSketchesRef = useRef<PlaneSketch[]>([]);
  const strokeDraftRef = useRef<CanvasStroke | null>(null);
  const historyIndexRef = useRef(0);
  const strokeSessionActiveRef = useRef(false);
  const eraseSessionActiveRef = useRef(false);
  const eraseSessionDirtyRef = useRef(false);

  const [activeTool, setActiveTool] = useState<CanvasTool>("inking");
  const [activeToolLabel, setActiveToolLabel] = useState("Inking");
  const [toolLabelVisible, setToolLabelVisible] = useState(true);
  const [toolPieOpen, setToolPieOpen] = useState(false);
  const [toolPieCenter, setToolPieCenter] = useState<CanvasMousePosition>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
  const [selectedPieAction, setSelectedPieAction] =
    useState<CanvasPieAction>("none");
  const [strokeDraft, setStrokeDraft] = useState<CanvasStroke | null>(null);
  const [selectedStrokeId, setSelectedStrokeId] = useState<number | null>(null);
  const [clipboardStrokes, setClipboardStrokes] = useState<
    CanvasStroke[] | undefined
  >(undefined);
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [historyEntries, setHistoryEntries] = useState<CanvasHistoryEntry[]>([
    {
      id: historyIdRef.current,
      label: "Canvas Init",
      snapshot: [],
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const mouseRef = useRef<CanvasMousePosition>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
  const toolPieCenterRef = useRef(toolPieCenter);
  const selectedPieActionRef = useRef(selectedPieAction);
  const activeTargetPlane = useMemo(
    () => workPlanes.find((plane) => plane.id === activeTargetPlaneId) ?? null,
    [activeTargetPlaneId, workPlanes]
  );
  const boardWidth = activeTargetPlane?.size.width ?? CANVAS_BOARD_SIZE_MM;
  const boardHeight = activeTargetPlane?.size.height ?? CANVAS_BOARD_SIZE_MM;
  const displayedStrokes = useMemo(
    () =>
      getPlaneSketchStrokes(planeSketches, activeTargetPlaneId).map((stroke) =>
        mapStrokeToBoard(stroke, boardWidth, boardHeight)
      ),
    [activeTargetPlaneId, boardHeight, boardWidth, planeSketches]
  );

  useEffect(() => {
    planeSketchesRef.current = planeSketches;
  }, [planeSketches]);

  useEffect(() => {
    const nextStrokeId =
      planeSketches.reduce((maxId, sketch) => {
        const sketchMaxId = sketch.strokes.reduce(
          (strokeMaxId, stroke) => Math.max(strokeMaxId, stroke.id),
          maxId
        );
        return Math.max(maxId, sketchMaxId);
      }, 0) + 1;

    strokeIdRef.current = Math.max(strokeIdRef.current, nextStrokeId);
  }, [planeSketches]);

  useEffect(() => {
    strokeDraftRef.current = strokeDraft;
  }, [strokeDraft]);

  useEffect(() => {
    onStateChange?.({
      planeSketches,
      selectedStrokeId,
      activeTool,
      activeTargetPlaneId,
      historyEntries,
      historyIndex,
    });
  }, [
    activeTool,
    activeTargetPlaneId,
    historyEntries,
    historyIndex,
    onStateChange,
    planeSketches,
    selectedStrokeId,
  ]);

  useEffect(() => {
    if (!selectionRequest || selectionRequest.workspace !== "canvas") {
      return;
    }

    onActiveTargetPlaneChange(selectionRequest.planeId);
    setSelectedStrokeId(selectionRequest.strokeId);
  }, [onActiveTargetPlaneChange, selectionRequest]);

  useEffect(() => {
    toolPieCenterRef.current = toolPieCenter;
  }, [toolPieCenter]);

  useEffect(() => {
    selectedPieActionRef.current = selectedPieAction;
  }, [selectedPieAction]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  const commitCanvasState = useCallback((label: string, nextSketches: PlaneSketch[]) => {
    const snapshot = clonePlaneSketches(nextSketches);
    const baseIndex = historyIndexRef.current;
    const nextIndex = baseIndex + 1;
    historyIndexRef.current = nextIndex;

    onPlaneSketchesChange(snapshot);

    setHistoryEntries((current) => {
      const nextEntry: CanvasHistoryEntry = {
        id: historyIdRef.current + 1,
        label,
        snapshot,
      };
      historyIdRef.current += 1;
      return [...current.slice(0, baseIndex + 1), nextEntry];
    });
    setHistoryIndex(nextIndex);
  }, [onPlaneSketchesChange]);

  const applyHistorySnapshot = useCallback((snapshot: PlaneSketch[]) => {
    setStrokeDraft(null);
    strokeDraftRef.current = null;
    onPlaneSketchesChange(clonePlaneSketches(snapshot));
  }, [onPlaneSketchesChange]);

  useEffect(() => {
    if (!renameRequest || renameRequest.workspace !== "canvas") {
      return;
    }

    const trimmedName = renameRequest.nextName.trim();
    if (!trimmedName) {
      return;
    }

    const nextSketches = renameStrokeInSketches(
      planeSketchesRef.current,
      renameRequest.objectId,
      trimmedName
    );
    planeSketchesRef.current = nextSketches;
    commitCanvasState("Rename Stroke", nextSketches);
  }, [renameRequest, commitCanvasState]);

  useEffect(() => {
    if (
      selectedStrokeId !== null &&
      !displayedStrokes.some((stroke) => stroke.id === selectedStrokeId)
    ) {
      setSelectedStrokeId(null);
    }
  }, [displayedStrokes, selectedStrokeId]);

  const undoCanvas = useCallback(() => {
    if (historyIndexRef.current <= 0) {
      return;
    }

    const nextIndex = historyIndexRef.current - 1;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    applyHistorySnapshot(historyEntries[nextIndex].snapshot);
  }, [applyHistorySnapshot, historyEntries]);

  const redoCanvas = useCallback(() => {
    if (historyIndexRef.current >= historyEntries.length - 1) {
      return;
    }

    const nextIndex = historyIndexRef.current + 1;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    applyHistorySnapshot(historyEntries[nextIndex].snapshot);
  }, [applyHistorySnapshot, historyEntries]);

  const copyCanvas = useCallback(() => {
    setClipboardStrokes(
      displayedStrokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => ({ ...point })),
      }))
    );
  }, [displayedStrokes]);

  const clearCanvas = useCallback(() => {
    if (!activeTargetPlaneId) {
      return;
    }

    setStrokeDraft(null);
    setSelectedStrokeId(null);
    const nextSketches = upsertPlaneSketchStrokes(
      planeSketchesRef.current,
      activeTargetPlaneId,
      []
    );
    planeSketchesRef.current = nextSketches;
    commitCanvasState("Clear Canvas", nextSketches);
    setActiveToolLabel("Clear");
    setToolLabelVisible(true);
  }, [activeTargetPlaneId, commitCanvasState]);

  const cutCanvas = useCallback(() => {
    if (!activeTargetPlaneId) {
      return;
    }

    copyCanvas();
    setStrokeDraft(null);
    setSelectedStrokeId(null);
    const nextSketches = upsertPlaneSketchStrokes(
      planeSketchesRef.current,
      activeTargetPlaneId,
      []
    );
    planeSketchesRef.current = nextSketches;
    commitCanvasState("Cut Canvas", nextSketches);
    setActiveToolLabel("Cut");
    setToolLabelVisible(true);
  }, [activeTargetPlaneId, commitCanvasState, copyCanvas]);

  const pasteCanvas = useCallback(() => {
    if (!activeTargetPlaneId || !clipboardStrokes || clipboardStrokes.length === 0) {
      return;
    }

    const pastedStrokes = clipboardStrokes.map((stroke) => ({
      id: strokeIdRef.current++,
      name: `${stroke.name} Copy`,
      points: stroke.points.map((point) =>
        offsetStrokePoint(point, 10, boardWidth, boardHeight)
      ),
    }));
    const currentStrokes = getPlaneSketchStrokes(
      planeSketchesRef.current,
      activeTargetPlaneId
    ).map((stroke) => mapStrokeToBoard(stroke, boardWidth, boardHeight));
    const nextStrokes = [...currentStrokes, ...pastedStrokes].map(
      (stroke) => mapStrokeToPlaneLocal(stroke, boardWidth, boardHeight)
    );
    const nextSketches = upsertPlaneSketchStrokes(
      planeSketchesRef.current,
      activeTargetPlaneId,
      nextStrokes
    );
    planeSketchesRef.current = nextSketches;
    setStrokeDraft(null);
    setSelectedStrokeId(null);
    commitCanvasState("Paste Canvas", nextSketches);
    setActiveToolLabel("Paste");
    setToolLabelVisible(true);
  }, [activeTargetPlaneId, boardHeight, boardWidth, clipboardStrokes, commitCanvasState]);

  const handleStrokeStart = useCallback((point: CanvasPoint) => {
    if (strokeSessionActiveRef.current || !activeTargetPlaneId) {
      return;
    }

    strokeSessionActiveRef.current = true;
    const nextDraft: CanvasStroke = {
      id: strokeIdRef.current++,
      name: `Stroke ${strokeIdRef.current - 1}`,
      points: [point],
    };
    setStrokeDraft(nextDraft);
  }, [activeTargetPlaneId]);

  const handleStrokeAppend = useCallback((point: CanvasPoint) => {
    if (!strokeSessionActiveRef.current) {
      return;
    }

    setStrokeDraft((current) => {
      if (!current) {
        return current;
      }

      const lastPoint = current.points[current.points.length - 1] ?? null;
      if (pointsEqual(lastPoint, point)) {
        return current;
      }

      return {
        ...current,
        points: [...current.points, point],
      };
    });
  }, []);

  const handleStrokeCommit = useCallback(() => {
    if (!strokeSessionActiveRef.current) {
      return;
    }

    strokeSessionActiveRef.current = false;
    const currentDraft = strokeDraftRef.current;
    setStrokeDraft(null);
    strokeDraftRef.current = null;

    if (!currentDraft || currentDraft.points.length < 1) {
      return;
    }

    if (!activeTargetPlaneId) {
      return;
    }

    const nextStrokes = [
      ...getPlaneSketchStrokes(planeSketchesRef.current, activeTargetPlaneId),
      mapStrokeToPlaneLocal(currentDraft, boardWidth, boardHeight),
    ];
    const nextSketches = upsertPlaneSketchStrokes(
      planeSketchesRef.current,
      activeTargetPlaneId,
      nextStrokes
    );
    planeSketchesRef.current = nextSketches;
    commitCanvasState(getStrokeHistoryLabel(currentDraft), nextSketches);
  }, [activeTargetPlaneId, boardHeight, boardWidth, commitCanvasState]);

  const handleStrokeCancel = useCallback(() => {
    strokeSessionActiveRef.current = false;
    setStrokeDraft(null);
    strokeDraftRef.current = null;
  }, []);

  const handleSelectStroke = useCallback((strokeId: number | null) => {
    setSelectedStrokeId(strokeId);
  }, []);

  const handleEraseStroke = useCallback((strokeId: number) => {
    if (!eraseSessionActiveRef.current) {
      return;
    }

    const match = findStrokeById(planeSketchesRef.current, strokeId);
    if (!match) {
      return;
    }

    const nextSketches = deleteStrokeFromSketches(planeSketchesRef.current, strokeId);
    planeSketchesRef.current = nextSketches;
    setStrokeDraft(null);
    setSelectedStrokeId((current) => (current === strokeId ? null : current));
    eraseSessionDirtyRef.current = true;
    setActiveToolLabel("Erase");
    setToolLabelVisible(true);
  }, []);

  const handleEraseSessionStart = useCallback(() => {
    eraseSessionActiveRef.current = true;
    eraseSessionDirtyRef.current = false;
  }, []);

  const handleEraseSessionEnd = useCallback(() => {
    if (!eraseSessionActiveRef.current) {
      return;
    }

    eraseSessionActiveRef.current = false;

    if (!eraseSessionDirtyRef.current) {
      return;
    }

    eraseSessionDirtyRef.current = false;
    commitCanvasState("Erase Stroke", planeSketchesRef.current);
  }, [commitCanvasState]);

  const deleteSelectedStroke = useCallback(() => {
    if (selectedStrokeId === null) {
      return;
    }

    const nextSketches = deleteStrokeFromSketches(
      planeSketchesRef.current,
      selectedStrokeId
    );
    planeSketchesRef.current = nextSketches;
    setStrokeDraft(null);
    setSelectedStrokeId(null);
    commitCanvasState("Delete Stroke", nextSketches);
    setActiveToolLabel("Delete");
    setToolLabelVisible(true);
  }, [commitCanvasState, selectedStrokeId]);

  const applyPieAction = useCallback((action: CanvasPieAction) => {
    if (action === "none") {
      return;
    }

    setToolLabelVisible(true);
    setActiveToolLabel(formatCanvasToolLabel(action));

    if (action === "inking" || action === "select" || action === "erase") {
      setActiveTool(action);
      return;
    }

    if (action === "clear") {
      clearCanvas();
      return;
    }
  }, [clearCanvas]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToolLabelVisible(false);
    }, CANVAS_TOOL_LABEL_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeToolLabel, isActive]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const nextMouse = { x: event.clientX, y: event.clientY };
      mouseRef.current = nextMouse;

      if (!toolPieOpenRef.current) {
        return;
      }

      setSelectedPieAction(
        getHoveredCanvasPieAction(toolPieCenterRef.current, nextMouse)
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const modifierPressed = event.metaKey || event.ctrlKey;
      const textInputActive = isTextInputActive();

      if (modifierPressed && !toolPieOpenRef.current && !textInputActive) {
        const key = event.key.toLowerCase();

        if (key === "z") {
          event.preventDefault();
          undoCanvas();
          return;
        }

        if (key === "y") {
          event.preventDefault();
          redoCanvas();
          return;
        }

        if (key === "c") {
          event.preventDefault();
          copyCanvas();
          return;
        }

        if (key === "v") {
          event.preventDefault();
          pasteCanvas();
          return;
        }

        if (key === "x") {
          event.preventDefault();
          cutCanvas();
          return;
        }
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !textInputActive
      ) {
        event.preventDefault();
        deleteSelectedStroke();
        return;
      }

      if (event.key === "`" && !event.repeat) {
        event.preventDefault();

        toolPieCancelledRef.current = false;
        toolPieOpenRef.current = true;
        toolPieCenterRef.current = mouseRef.current;
        selectedPieActionRef.current = "none";
        setToolPieCenter(mouseRef.current);
        setSelectedPieAction("none");
        setToolPieOpen(true);
      }

      if (event.key === "Escape" && toolPieOpenRef.current) {
        toolPieCancelledRef.current = true;
        toolPieOpenRef.current = false;
        selectedPieActionRef.current = "none";
        setToolPieOpen(false);
        setSelectedPieAction("none");
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "`" || !toolPieOpenRef.current) {
        return;
      }

      event.preventDefault();
      toolPieOpenRef.current = false;
      setToolPieOpen(false);

      if (!toolPieCancelledRef.current) {
        applyPieAction(selectedPieActionRef.current);
      }

      toolPieCancelledRef.current = false;
      selectedPieActionRef.current = "none";
      setSelectedPieAction("none");
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
    applyPieAction,
    copyCanvas,
    cutCanvas,
    deleteSelectedStroke,
    isActive,
    pasteCanvas,
    redoCanvas,
    undoCanvas,
  ]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyEntries.length - 1;
  const toolLabel = useMemo(() => activeToolLabel, [activeToolLabel]);

  return (
    <div className="canvas-workspace">
      <UndoRedoOverlay
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undoCanvas}
        onRedo={redoCanvas}
      />

      <div className="canvas-workspace__body">
        <CanvasViewport
          activeTool={activeTool}
          activeTargetPlane={activeTargetPlane}
          boardWidth={boardWidth}
          boardHeight={boardHeight}
          isActive={isActive}
          drawingEnabled={Boolean(activeTargetPlaneId)}
          selectedStrokeId={selectedStrokeId}
          strokeDraft={strokeDraft}
          strokes={displayedStrokes}
          onClearSelection={() => setSelectedStrokeId(null)}
          onEraseSessionEnd={handleEraseSessionEnd}
          onEraseSessionStart={handleEraseSessionStart}
          onEraseStroke={handleEraseStroke}
          onSelectStroke={handleSelectStroke}
          onStrokeAppend={handleStrokeAppend}
          onStrokeCancel={handleStrokeCancel}
          onStrokeCommit={handleStrokeCommit}
          onStrokeStart={handleStrokeStart}
        />
      </div>

      <CanvasHistoryWindow
        collapsed={historyCollapsed}
        onToggleCollapsed={() => setHistoryCollapsed((current) => !current)}
        historyEntries={historyEntries}
        historyIndex={historyIndex}
        onSelectHistoryIndex={(index) => {
          historyIndexRef.current = index;
          setHistoryIndex(index);
          applyHistorySnapshot(historyEntries[index].snapshot);
        }}
      />

      <div
        className={`canvas-workspace__tool-label${
          toolLabelVisible ? " canvas-workspace__tool-label--visible" : ""
        }`}
      >
        {toolLabel}
      </div>

      <div className="canvas-workspace__target-chip">
        <label className="canvas-workspace__target-label" htmlFor="canvas-target-plane">
          Target
        </label>
        <select
          id="canvas-target-plane"
          className="canvas-workspace__target-select"
          onChange={(event) =>
            onActiveTargetPlaneChange(event.target.value || null)
          }
          value={activeTargetPlaneId ?? ""}
        >
          <option value="">No work plane selected</option>
          {workPlanes.map((plane) => (
            <option key={plane.id} value={plane.id}>
              {plane.name}
            </option>
          ))}
        </select>
      </div>

      {toolPieOpen && (
        <CanvasToolPieMenu
          center={toolPieCenter}
          selectedAction={selectedPieAction}
        />
      )}
    </div>
  );
}
