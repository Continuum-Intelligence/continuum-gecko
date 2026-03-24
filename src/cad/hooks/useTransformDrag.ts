import { useEffect } from "react";
import {
  PIXEL_TO_DEGREES,
  PIXEL_TO_SCALE,
  PIXEL_TO_MM,
  ROTATION_SNAP_INCREMENT,
  SCALE_SNAP_INCREMENT,
} from "../constants";
import {
  clampScale,
  degreesToRadians,
  radiansToDegrees,
  snapToIncrement,
  snapVectorComponent,
} from "../helpers/sceneMath";
import type {
  SceneHistoryEntry,
  SceneSnapshot,
  TransformDragState,
  TransformSubject,
  Vector3Tuple,
} from "../types";
import { snapshotsEqual } from "../helpers/history";

// ============================================
// TRANSFORM DRAG HOOK
// ============================================

export function useTransformDrag({
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
}: {
  transformDragState: TransformDragState;
  historyIndex: number;
  getCurrentSceneSnapshot: () => SceneSnapshot;
  setHistoryEntries: React.Dispatch<React.SetStateAction<SceneHistoryEntry[]>>;
  setHistoryIndex: React.Dispatch<React.SetStateAction<number>>;
  historyEntryIdCounterRef: React.RefObject<number>;
  setTransformDragState: React.Dispatch<React.SetStateAction<TransformDragState>>;
  setHoveredTransformAxis: (axis: "x" | "y" | "z" | null) => void;
  updateSceneObjectPosition: (subject: TransformSubject, position: Vector3Tuple) => void;
  updateSceneObjectRotation: (subject: TransformSubject, rotation: Vector3Tuple) => void;
  updateSceneObjectScale: (subject: TransformSubject, scale: Vector3Tuple) => void;
}) {
  useEffect(() => {
    if (!transformDragState) return;

    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - transformDragState.startMouse.x;
      const deltaY = event.clientY - transformDragState.startMouse.y;

      if (transformDragState.mode === "move") {
        let nextValue = 0;

        if (transformDragState.axis === "x") {
          nextValue = transformDragState.startPosition[0] + deltaX * PIXEL_TO_MM;
        }

        if (transformDragState.axis === "y") {
          nextValue = transformDragState.startPosition[1] + deltaX * PIXEL_TO_MM;
        }

        if (transformDragState.axis === "z") {
          nextValue = transformDragState.startPosition[2] - deltaY * PIXEL_TO_MM;
        }

        updateSceneObjectPosition(
          transformDragState.subject,
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

        updateSceneObjectRotation(transformDragState.subject, nextRotation);
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

        nextScale[axisIndex] = clampScale(
          snapToIncrement(
            transformDragState.startScale[axisIndex] + deltaScale,
            SCALE_SNAP_INCREMENT
          )
        );

        updateSceneObjectScale(transformDragState.subject, nextScale);
      }
    };

    const handleMouseUp = () => {
      const currentSnapshot = getCurrentSceneSnapshot();

      if (!snapshotsEqual(transformDragState.startSnapshot, currentSnapshot)) {
        const nextEntry: SceneHistoryEntry = {
          id: `history-${historyEntryIdCounterRef.current ?? 0}`,
          label:
            transformDragState.mode === "move"
              ? "Move Object"
              : transformDragState.mode === "rotate"
                ? "Rotate Object"
                : "Scale Object",
          snapshot: currentSnapshot,
        };

        if (historyEntryIdCounterRef.current != null) {
          historyEntryIdCounterRef.current += 1;
        }

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
  }, [
    getCurrentSceneSnapshot,
    historyEntryIdCounterRef,
    historyIndex,
    setHistoryEntries,
    setHistoryIndex,
    setHoveredTransformAxis,
    setTransformDragState,
    transformDragState,
    updateSceneObjectPosition,
    updateSceneObjectRotation,
    updateSceneObjectScale,
  ]);
}
