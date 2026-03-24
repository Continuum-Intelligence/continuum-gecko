import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { WorkPlane } from "../../cad/types";
import {
  CANVAS_BOARD_BACKGROUND,
  CANVAS_BOARD_BORDER,
  CANVAS_GRID_MAJOR_COLOR,
  CANVAS_GRID_MAJOR_STEP_MM,
  CANVAS_GRID_MINOR_COLOR,
  CANVAS_GRID_MINOR_STEP_MM,
  CANVAS_ZOOM_MAX,
  CANVAS_ZOOM_MIN,
  CANVAS_ZOOM_SENSITIVITY,
} from "../constants";
import type {
  CanvasPoint,
  CanvasStroke,
  CanvasTool,
  CanvasViewportState,
} from "../types";

// ============================================
// HELPERS
// ============================================

function clampZoom(zoom: number) {
  return Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, zoom));
}

function fitBoardZoom(
  width: number,
  height: number,
  boardWidth: number,
  boardHeight: number
) {
  const paddedWidth = Math.max(1, width - 48);
  const paddedHeight = Math.max(1, height - 48);

  return Math.min(paddedWidth / boardWidth, paddedHeight / boardHeight);
}

function formatCursor(
  activeTool: CanvasTool,
  drawingEnabled: boolean,
  isSpacePressed: boolean,
  isPanning: boolean,
  isDrawing: boolean
) {
  if (isPanning) {
    return "grabbing";
  }

  if (isSpacePressed) {
    return "grab";
  }

  if ((activeTool === "inking" && drawingEnabled) || isDrawing) {
    return "crosshair";
  }

  return "default";
}

function getBoardMetrics(
  surface: HTMLDivElement | null,
  surfaceWidth: number,
  surfaceHeight: number,
  viewportState: CanvasViewportState,
  boardWidth: number,
  boardHeight: number
) {
  const contentOffsetX = surface?.clientLeft ?? 0;
  const contentOffsetY = surface?.clientTop ?? 0;
  const halfBoardWidth = boardWidth / 2;
  const halfBoardHeight = boardHeight / 2;
  const centerX = contentOffsetX + surfaceWidth / 2 + viewportState.panX;
  const centerY = contentOffsetY + surfaceHeight / 2 + viewportState.panY;
  const boardLeft = centerX - halfBoardWidth * viewportState.zoom;
  const boardTop = centerY - halfBoardHeight * viewportState.zoom;
  const boardScreenWidth = boardWidth * viewportState.zoom;
  const boardScreenHeight = boardHeight * viewportState.zoom;

  return {
    boardLeft,
    boardTop,
    boardScreenWidth,
    boardScreenHeight,
    centerX,
    centerY,
  };
}

function snapPointFromPointer(
  clientX: number,
  clientY: number,
  surface: HTMLDivElement,
  surfaceWidth: number,
  surfaceHeight: number,
  viewportState: CanvasViewportState,
  boardWidth: number,
  boardHeight: number
) {
  const rect = surface.getBoundingClientRect();
  const pointerX = clientX - rect.left - surface.clientLeft;
  const pointerY = clientY - rect.top - surface.clientTop;
  const { boardLeft, boardTop } = getBoardMetrics(
    surface,
    surfaceWidth,
    surfaceHeight,
    viewportState,
    boardWidth,
    boardHeight
  );

  const localX = (pointerX - boardLeft) / viewportState.zoom;
  const localY = (pointerY - boardTop) / viewportState.zoom;

  if (
    localX < 0 ||
    localX > boardWidth ||
    localY < 0 ||
    localY > boardHeight
  ) {
    return null;
  }

  return {
    x: Math.round(localX / CANVAS_GRID_MINOR_STEP_MM) * CANVAS_GRID_MINOR_STEP_MM,
    y: Math.round(localY / CANVAS_GRID_MINOR_STEP_MM) * CANVAS_GRID_MINOR_STEP_MM,
  };
}

function projectPointToScreen(
  point: CanvasPoint,
  surface: HTMLDivElement | null,
  surfaceWidth: number,
  surfaceHeight: number,
  viewportState: CanvasViewportState,
  boardWidth: number,
  boardHeight: number
) {
  const { boardLeft, boardTop } = getBoardMetrics(
    surface,
    surfaceWidth,
    surfaceHeight,
    viewportState,
    boardWidth,
    boardHeight
  );

  return {
    x: boardLeft + point.x * viewportState.zoom,
    y: boardTop + point.y * viewportState.zoom,
  };
}

function buildStrokePath(
  stroke: CanvasStroke,
  surface: HTMLDivElement | null,
  surfaceWidth: number,
  surfaceHeight: number,
  viewportState: CanvasViewportState,
  boardWidth: number,
  boardHeight: number
) {
  if (stroke.points.length === 0) {
    return "";
  }

  return stroke.points
    .map((point, index) => {
      const projected = projectPointToScreen(
        point,
        surface,
        surfaceWidth,
        surfaceHeight,
        viewportState,
        boardWidth,
        boardHeight
      );
      return `${index === 0 ? "M" : "L"} ${projected.x} ${projected.y}`;
    })
    .join(" ");
}

function buildStrokeScreenPoints(
  stroke: CanvasStroke,
  surface: HTMLDivElement | null,
  surfaceWidth: number,
  surfaceHeight: number,
  viewportState: CanvasViewportState,
  boardWidth: number,
  boardHeight: number
) {
  return stroke.points.map((point) =>
    projectPointToScreen(
      point,
      surface,
      surfaceWidth,
      surfaceHeight,
      viewportState,
      boardWidth,
      boardHeight
    )
  );
}

function getBoardPointFromPointer(
  clientX: number,
  clientY: number,
  surface: HTMLDivElement | null,
  surfaceWidth: number,
  surfaceHeight: number,
  viewportState: CanvasViewportState,
  boardWidth: number,
  boardHeight: number
) {
  if (!surface) {
    return null;
  }

  const rect = surface.getBoundingClientRect();
  const pointerX = clientX - rect.left - surface.clientLeft;
  const pointerY = clientY - rect.top - surface.clientTop;
  const { boardLeft, boardTop } = getBoardMetrics(
    surface,
    surfaceWidth,
    surfaceHeight,
    viewportState,
    boardWidth,
    boardHeight
  );

  const localX = (pointerX - boardLeft) / viewportState.zoom;
  const localY = (pointerY - boardTop) / viewportState.zoom;

  if (
    localX < 0 ||
    localX > boardWidth ||
    localY < 0 ||
    localY > boardHeight
  ) {
    return null;
  }

  return { x: localX, y: localY };
}

function getPointToSegmentDistance(
  point: CanvasPoint,
  start: CanvasPoint,
  end: CanvasPoint
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection =
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
  const t = Math.max(0, Math.min(1, projection));
  const nearestX = start.x + t * dx;
  const nearestY = start.y + t * dy;

  return Math.hypot(point.x - nearestX, point.y - nearestY);
}

function getStrokeDistance(point: CanvasPoint, stroke: CanvasStroke) {
  if (stroke.points.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (stroke.points.length === 1) {
    const lonePoint = stroke.points[0];
    return lonePoint
      ? Math.hypot(point.x - lonePoint.x, point.y - lonePoint.y)
      : Number.POSITIVE_INFINITY;
  }

  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < stroke.points.length - 1; index += 1) {
    const start = stroke.points[index];
    const end = stroke.points[index + 1];
    if (!start || !end) {
      continue;
    }

    const distance = getPointToSegmentDistance(point, start, end);
    if (distance < nearestDistance) {
      nearestDistance = distance;
    }
  }

  return nearestDistance;
}

function hitTestStroke(
  point: CanvasPoint | null,
  strokes: CanvasStroke[],
  tolerance: number
) {
  if (!point) {
    return null;
  }

  let nearestStrokeId: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const stroke of strokes) {
    const distance = getStrokeDistance(point, stroke);
    if (distance <= tolerance && distance < nearestDistance) {
      nearestStrokeId = stroke.id;
      nearestDistance = distance;
    }
  }

  return nearestStrokeId;
}

function getSnappedPointFromEvent(
  clientX: number,
  clientY: number,
  surface: HTMLDivElement | null,
  surfaceWidth: number,
  surfaceHeight: number,
  viewportState: CanvasViewportState,
  boardWidth: number,
  boardHeight: number
) {
  if (!surface) {
    return null;
  }

    return snapPointFromPointer(
      clientX,
      clientY,
      surface,
      surfaceWidth,
      surfaceHeight,
      viewportState,
      boardWidth,
      boardHeight
  );
}

// ============================================
// CANVAS VIEWPORT
// ============================================

export const CanvasViewport = memo(function CanvasViewport({
  activeTool,
  activeTargetPlane,
  boardWidth,
  boardHeight,
  drawingEnabled,
  isActive,
  selectedStrokeId,
  strokes,
  strokeDraft,
  onSelectStroke,
  onEraseSessionStart,
  onEraseSessionEnd,
  onEraseStroke,
  onClearSelection,
  onStrokeStart,
  onStrokeAppend,
  onStrokeCommit,
  onStrokeCancel,
}: {
  activeTool: CanvasTool;
  activeTargetPlane: WorkPlane | null;
  boardWidth: number;
  boardHeight: number;
  drawingEnabled: boolean;
  isActive: boolean;
  selectedStrokeId: number | null;
  strokes: CanvasStroke[];
  strokeDraft: CanvasStroke | null;
  onSelectStroke: (strokeId: number | null) => void;
  onEraseSessionStart: () => void;
  onEraseSessionEnd: () => void;
  onEraseStroke: (strokeId: number) => void;
  onClearSelection: () => void;
  onStrokeStart: (point: CanvasPoint) => void;
  onStrokeAppend: (point: CanvasPoint) => void;
  onStrokeCommit: () => void;
  onStrokeCancel: () => void;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportStateRef = useRef<CanvasViewportState>({
    panX: 0,
    panY: 0,
    zoom: 1,
  });
  const hasInitializedViewRef = useRef(false);
  const panDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const drawingPointerIdRef = useRef<number | null>(null);
  const erasingPointerIdRef = useRef<number | null>(null);

  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });
  const [viewportState, setViewportState] = useState<CanvasViewportState>({
    panX: 0,
    panY: 0,
    zoom: 1,
  });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [hoveredSnappedPoint, setHoveredSnappedPoint] = useState<CanvasPoint | null>(
    null
  );
  const hitTestTolerance = 6;

  const cursor = useMemo(
    () =>
      formatCursor(
        activeTool,
        drawingEnabled,
        isSpacePressed,
        isPanning,
        strokeDraft !== null
      ),
    [activeTool, drawingEnabled, isPanning, isSpacePressed, strokeDraft]
  );

  const strokePaths = useMemo(
    () =>
      strokes.map((stroke) => ({
        id: stroke.id,
        selected: stroke.id === selectedStrokeId,
        points: buildStrokeScreenPoints(
          stroke,
          null,
          surfaceSize.width,
          surfaceSize.height,
          viewportState,
          boardWidth,
          boardHeight
        ),
        path: buildStrokePath(
          stroke,
          null,
          surfaceSize.width,
          surfaceSize.height,
          viewportState,
          boardWidth,
          boardHeight
        ),
      })),
    [
      boardHeight,
      boardWidth,
      selectedStrokeId,
      strokes,
      surfaceSize.height,
      surfaceSize.width,
      viewportState,
    ]
  );

  const draftPath = useMemo(() => {
    if (!strokeDraft) {
      return null;
    }

    return {
      points: buildStrokeScreenPoints(
        strokeDraft,
        null,
        surfaceSize.width,
        surfaceSize.height,
        viewportState,
        boardWidth,
        boardHeight
      ),
      path: buildStrokePath(
        strokeDraft,
        null,
        surfaceSize.width,
        surfaceSize.height,
        viewportState,
        boardWidth,
        boardHeight
      ),
    };
  }, [
    boardHeight,
    boardWidth,
    strokeDraft,
    surfaceSize.height,
    surfaceSize.width,
    viewportState,
  ]);

  const cursorIndicator = useMemo(() => {
    if (!hoveredSnappedPoint || !drawingEnabled) {
      return null;
    }

    return projectPointToScreen(
      hoveredSnappedPoint,
      null,
      surfaceSize.width,
      surfaceSize.height,
      viewportState,
      boardWidth,
      boardHeight
    );
  }, [
    boardHeight,
    boardWidth,
    drawingEnabled,
    hoveredSnappedPoint,
    surfaceSize.height,
    surfaceSize.width,
    viewportState,
  ]);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const nextWidth = entry.contentRect.width;
      const nextHeight = entry.contentRect.height;
      setSurfaceSize({ width: nextWidth, height: nextHeight });

      setViewportState((current) => {
        if (hasInitializedViewRef.current) {
          return current;
        }

        const nextZoom = fitBoardZoom(
          nextWidth,
          nextHeight,
          boardWidth,
          boardHeight
        );
        const nextState = { panX: 0, panY: 0, zoom: nextZoom };
        viewportStateRef.current = nextState;
        hasInitializedViewRef.current = true;
        return nextState;
      });
    });

    resizeObserver.observe(surface);

    return () => {
      resizeObserver.disconnect();
    };
  }, [boardHeight, boardWidth]);

  useEffect(() => {
    viewportStateRef.current = viewportState;
  }, [viewportState]);

  useEffect(() => {
    const gridCanvas = gridCanvasRef.current;
    if (!gridCanvas || surfaceSize.width <= 0 || surfaceSize.height <= 0) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = Math.round(surfaceSize.width * devicePixelRatio);
    const height = Math.round(surfaceSize.height * devicePixelRatio);

    if (gridCanvas.width !== width || gridCanvas.height !== height) {
      gridCanvas.width = width;
      gridCanvas.height = height;
    }

    const context = gridCanvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    context.scale(devicePixelRatio, devicePixelRatio);

    const {
      boardLeft,
      boardTop,
      boardScreenWidth,
      boardScreenHeight,
      centerX,
      centerY,
    } =
      getBoardMetrics(
        surfaceRef.current,
        surfaceSize.width,
        surfaceSize.height,
        viewportState,
        boardWidth,
        boardHeight
      );
    const halfBoardWidth = boardWidth / 2;
    const halfBoardHeight = boardHeight / 2;

    context.fillStyle = CANVAS_BOARD_BACKGROUND;
    context.fillRect(boardLeft, boardTop, boardScreenWidth, boardScreenHeight);

    context.save();
    context.beginPath();
    context.rect(boardLeft, boardTop, boardScreenWidth, boardScreenHeight);
    context.clip();

    for (
      let position = -halfBoardWidth;
      position <= halfBoardWidth;
      position += CANVAS_GRID_MINOR_STEP_MM
    ) {
      const isMajor = position % CANVAS_GRID_MAJOR_STEP_MM === 0;
      const screenOffset = position * viewportState.zoom;
      const x = centerX + screenOffset;

      context.strokeStyle = isMajor
        ? CANVAS_GRID_MAJOR_COLOR
        : CANVAS_GRID_MINOR_COLOR;
      context.lineWidth = isMajor ? 1.05 : 0.65;

      context.beginPath();
      context.moveTo(Math.round(x) + 0.5, boardTop);
      context.lineTo(Math.round(x) + 0.5, boardTop + boardScreenHeight);
      context.stroke();
    }

    for (
      let position = -halfBoardHeight;
      position <= halfBoardHeight;
      position += CANVAS_GRID_MINOR_STEP_MM
    ) {
      const isMajor = position % CANVAS_GRID_MAJOR_STEP_MM === 0;
      const screenOffset = position * viewportState.zoom;
      const y = centerY + screenOffset;

      context.strokeStyle = isMajor
        ? CANVAS_GRID_MAJOR_COLOR
        : CANVAS_GRID_MINOR_COLOR;
      context.lineWidth = isMajor ? 1.05 : 0.65;

      context.beginPath();
      context.moveTo(boardLeft, Math.round(y) + 0.5);
      context.lineTo(boardLeft + boardScreenWidth, Math.round(y) + 0.5);
      context.stroke();
    }

    context.restore();

    context.strokeStyle = CANVAS_BOARD_BORDER;
    context.lineWidth = 1.2;
    context.strokeRect(boardLeft, boardTop, boardScreenWidth, boardScreenHeight);
  }, [boardHeight, boardWidth, surfaceSize.height, surfaceSize.width, viewportState]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === " ") {
        event.preventDefault();
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") {
        event.preventDefault();
        setIsSpacePressed(false);
        setIsPanning(false);
        panDragRef.current = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isActive]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isSpacePressed) {
      event.preventDefault();

      panDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startPanX: viewportStateRef.current.panX,
        startPanY: viewportStateRef.current.panY,
      };

      setIsPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (activeTool !== "inking") {
      const boardPoint = getBoardPointFromPointer(
        event.clientX,
        event.clientY,
        surfaceRef.current,
        surfaceSize.width,
        surfaceSize.height,
        viewportStateRef.current,
        boardWidth,
        boardHeight
      );
      const hitStrokeId = hitTestStroke(boardPoint, strokes, hitTestTolerance);

      if (activeTool === "select") {
        event.preventDefault();
        if (hitStrokeId !== null) {
          onSelectStroke(hitStrokeId);
        } else {
          onClearSelection();
        }
      }

      if (activeTool === "erase") {
        event.preventDefault();
        erasingPointerIdRef.current = event.pointerId;
        onEraseSessionStart();
        if (hitStrokeId !== null) {
          onEraseStroke(hitStrokeId);
        }
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      return;
    }

    const snappedPoint = getSnappedPointFromEvent(
      event.clientX,
      event.clientY,
      surfaceRef.current,
      surfaceSize.width,
      surfaceSize.height,
      viewportStateRef.current,
      boardWidth,
      boardHeight
    );

    if (!drawingEnabled || !snappedPoint) {
      return;
    }

    event.preventDefault();
    drawingPointerIdRef.current = event.pointerId;
    setHoveredSnappedPoint(snappedPoint);
    onStrokeStart(snappedPoint);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const snappedPoint = getSnappedPointFromEvent(
      event.clientX,
      event.clientY,
      surfaceRef.current,
      surfaceSize.width,
      surfaceSize.height,
      viewportStateRef.current,
      boardWidth,
      boardHeight
    );
    setHoveredSnappedPoint(snappedPoint);

    const panDrag = panDragRef.current;
    if (panDrag && panDrag.pointerId === event.pointerId) {
      const deltaX = event.clientX - panDrag.startX;
      const deltaY = event.clientY - panDrag.startY;
      setViewportState({
        panX: panDrag.startPanX + deltaX,
        panY: panDrag.startPanY + deltaY,
        zoom: viewportStateRef.current.zoom,
      });
      return;
    }

    if (drawingPointerIdRef.current !== event.pointerId || activeTool !== "inking") {
      if (erasingPointerIdRef.current === event.pointerId && activeTool === "erase") {
        const boardPoint = getBoardPointFromPointer(
          event.clientX,
          event.clientY,
          surfaceRef.current,
          surfaceSize.width,
          surfaceSize.height,
          viewportStateRef.current,
          boardWidth,
          boardHeight
        );
        const hitStrokeId = hitTestStroke(boardPoint, strokes, hitTestTolerance);
        if (hitStrokeId !== null) {
          onEraseStroke(hitStrokeId);
        }
      }
      return;
    }

    if (!snappedPoint) {
      return;
    }

    onStrokeAppend(snappedPoint);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panDrag = panDragRef.current;
    if (panDrag && panDrag.pointerId === event.pointerId) {
      panDragRef.current = null;
      setIsPanning(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (drawingPointerIdRef.current === event.pointerId) {
      drawingPointerIdRef.current = null;
      onStrokeCommit();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (erasingPointerIdRef.current === event.pointerId) {
      erasingPointerIdRef.current = null;
      onEraseSessionEnd();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  const handlePointerLeave = () => {
    setHoveredSnappedPoint(null);
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panDrag = panDragRef.current;
    if (panDrag && panDrag.pointerId === event.pointerId) {
      panDragRef.current = null;
      setIsPanning(false);
      setHoveredSnappedPoint(null);
      return;
    }

    if (drawingPointerIdRef.current === event.pointerId) {
      drawingPointerIdRef.current = null;
      onStrokeCancel();
      setHoveredSnappedPoint(null);
      return;
    }

    if (erasingPointerIdRef.current === event.pointerId) {
      erasingPointerIdRef.current = null;
      onEraseSessionEnd();
      setHoveredSnappedPoint(null);
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const rect = surface.getBoundingClientRect();
    const pointerX = event.clientX - rect.left - surface.clientLeft;
    const pointerY = event.clientY - rect.top - surface.clientTop;
    const previous = viewportStateRef.current;
    const nextZoom = clampZoom(
      previous.zoom * Math.exp(-event.deltaY * CANVAS_ZOOM_SENSITIVITY)
    );

    if (nextZoom === previous.zoom) {
      return;
    }

    const worldX =
      (pointerX - surfaceSize.width / 2 - previous.panX) / previous.zoom;
    const worldY =
      (pointerY - surfaceSize.height / 2 - previous.panY) / previous.zoom;

    setViewportState({
      zoom: nextZoom,
      panX: pointerX - surfaceSize.width / 2 - worldX * nextZoom,
      panY: pointerY - surfaceSize.height / 2 - worldY * nextZoom,
    });
  };

  return (
    <section className="canvas-viewport">
      <div className="canvas-viewport__frame">
        <div
          ref={surfaceRef}
          className="canvas-viewport__surface"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
          onWheel={handleWheel}
          style={{ cursor }}
        >
          <canvas ref={gridCanvasRef} className="canvas-viewport__canvas" />

          <svg
            className="canvas-viewport__svg-overlay"
            width={surfaceSize.width}
            height={surfaceSize.height}
            viewBox={`0 0 ${surfaceSize.width} ${surfaceSize.height}`}
            aria-hidden="true"
          >
            {strokePaths.map((stroke) => (
              stroke.points.length === 1 ? (
                <circle
                  key={stroke.id}
                  className={`canvas-viewport__stroke-point${
                    stroke.selected ? " canvas-viewport__stroke-point--selected" : ""
                  }`}
                  cx={stroke.points[0]?.x}
                  cy={stroke.points[0]?.y}
                  r={2.2}
                />
              ) : (
                <path
                  key={stroke.id}
                  className={`canvas-viewport__stroke${
                    stroke.selected ? " canvas-viewport__stroke--selected" : ""
                  }`}
                  d={stroke.path}
                />
              )
            ))}

            {draftPath ? (
              draftPath.points.length === 1 ? (
                <circle
                  className="canvas-viewport__stroke-point canvas-viewport__stroke-point--draft"
                  cx={draftPath.points[0]?.x}
                  cy={draftPath.points[0]?.y}
                  r={2.2}
                />
              ) : (
                <path
                  className="canvas-viewport__stroke canvas-viewport__stroke--draft"
                  d={draftPath.path}
                />
              )
            ) : null}

            {cursorIndicator ? (
              <g className="canvas-viewport__cursor-indicator">
                <circle
                  className="canvas-viewport__cursor-ring"
                  cx={cursorIndicator.x}
                  cy={cursorIndicator.y}
                  r={5}
                />
                <circle
                  className="canvas-viewport__cursor-dot"
                  cx={cursorIndicator.x}
                  cy={cursorIndicator.y}
                  r={1.7}
                />
              </g>
            ) : null}
          </svg>

          {!drawingEnabled ? (
            <div className="canvas-viewport__inactive-state">
              <div className="canvas-viewport__inactive-title">
                Select a work plane to sketch
              </div>
              <div className="canvas-viewport__inactive-subtitle">
                Canvas edits plane-bound sketch geometry, not free-floating strokes.
              </div>
            </div>
          ) : activeTargetPlane ? (
            <div className="canvas-viewport__active-plane-chip">
              {activeTargetPlane.name}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
});
