import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  createOverlayArrow,
  getSelectionAnchorPoint,
  projectWorldPointToScreen,
} from "../helpers/sceneMath";
import type {
  DimensionOverlayItem,
  DistanceDimension,
  WorkPlane,
} from "../types";

// ============================================
// DIMENSION OVERLAY HOOK
// ============================================

export function buildDimensionOverlayItems(
  dimensions: DistanceDimension[],
  workPlanes: WorkPlane[],
  camera: THREE.Camera,
  width: number,
  height: number
): DimensionOverlayItem[] {
  return dimensions.flatMap((dimension) => {
    const fromPoint = getSelectionAnchorPoint(dimension.from, workPlanes);
    const toPoint = getSelectionAnchorPoint(dimension.to, workPlanes);

    if (!fromPoint || !toPoint) return [];

    const start = projectWorldPointToScreen(fromPoint, camera, width, height);
    const end = projectWorldPointToScreen(toPoint, camera, width, height);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length < 1) return [];

    const direction = { x: dx / length, y: dy / length };

    return [
      {
        id: dimension.id,
        start,
        end,
        label: {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2 - 18,
        },
        value: fromPoint.distanceTo(toPoint),
        fromArrow: createOverlayArrow(start, direction, 12, 5),
        toArrow: createOverlayArrow(
          end,
          { x: -direction.x, y: -direction.y },
          12,
          5
        ),
      },
    ];
  });
}

export function useDimensionOverlay({
  dimensions,
  workPlanes,
  camera,
  width,
  height,
  controlsRef,
}: {
  dimensions: DistanceDimension[];
  workPlanes: WorkPlane[];
  camera: THREE.Camera;
  width: number;
  height: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const [cameraTick, setCameraTick] = useState(0);
  const lastCameraStateRef = useRef("");

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const handleChange = () => {
      const key = `${controls.object.position.toArray().join(",")}|${controls.target
        .toArray()
        .join(",")}|${controls.object.up.toArray().join(",")}`;

      if (key === lastCameraStateRef.current) return;
      lastCameraStateRef.current = key;
      setCameraTick((current) => current + 1);
    };

    handleChange();
    controls.addEventListener("change", handleChange);

    return () => {
      controls.removeEventListener("change", handleChange);
    };
  }, [controlsRef]);

  return useMemo(
    () =>
      buildDimensionOverlayItems(
        dimensions,
        workPlanes,
        camera,
        width,
        height
      ),
    [camera, cameraTick, dimensions, height, width, workPlanes]
  );
}
