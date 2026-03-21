import { memo, useMemo } from "react";
import { nonSelectableProps } from "../../constants";
import type { WorkPlane } from "../../types";
import type { PlaneSketch } from "../../../shared/sketch/types";
import { buildPlaneSketchLinePoints } from "../../../shared/sketch/planeSketchProjection";

// ============================================
// PLANE SKETCHES
// ============================================

const WorkPlaneSketchRenderer = memo(function WorkPlaneSketchRenderer({
  plane,
  sketch,
}: {
  plane: WorkPlane;
  sketch: PlaneSketch;
}) {
  return (
    <group position={plane.position} rotation={plane.rotation} scale={plane.scale}>
      {sketch.strokes.map((stroke) => {
        if (stroke.points.length === 0) {
          return null;
        }

        if (stroke.points.length === 1) {
          const point = stroke.points[0];
          if (!point) {
            return null;
          }

          return (
            <mesh
              key={`plane-sketch-point-${stroke.id}`}
              position={[point.x, point.y, 0.04]}
              renderOrder={3}
              {...nonSelectableProps}
            >
              <sphereGeometry args={[0.7, 16, 16]} />
              <meshBasicMaterial color="#111111" />
            </mesh>
          );
        }

        const points = buildPlaneSketchLinePoints(stroke);

        return (
          <line key={`plane-sketch-stroke-${stroke.id}`} {...nonSelectableProps}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[points, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color="#111111" />
          </line>
        );
      })}
    </group>
  );
});

export const PlaneSketches = memo(function PlaneSketches({
  workPlanes,
  planeSketches,
}: {
  workPlanes: WorkPlane[];
  planeSketches: PlaneSketch[];
}) {
  const planeById = useMemo(
    () => new Map(workPlanes.map((plane) => [plane.id, plane])),
    [workPlanes]
  );

  return (
    <>
      {planeSketches.map((sketch) => {
        const plane = planeById.get(sketch.planeId);
        if (!plane || !plane.visible || sketch.strokes.length === 0) {
          return null;
        }

        return (
          <WorkPlaneSketchRenderer
            key={`plane-sketch-${sketch.planeId}`}
            plane={plane}
            sketch={sketch}
          />
        );
      })}
    </>
  );
});
