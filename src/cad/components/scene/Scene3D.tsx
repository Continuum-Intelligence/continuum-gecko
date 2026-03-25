import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { PlaneSketch } from "../../../shared/sketch/types";
import {
  DEFAULT_CAMERA_TARGET,
  WORK_PLANE_EDGE_IDS,
  WORK_PLANE_FACE_ID,
  WORK_PLANE_VERTEX_IDS,
  WORLD_UP,
  nonSelectableProps,
} from "../../constants";
import { useDimensionOverlay } from "../../hooks/useDimensionOverlay";
import {
  createSelection,
  getPlaneSelectionHighlight,
  getWorkPlaneEdgeLocalPoints,
  getWorkPlaneVertexLocalPoint,
} from "../../helpers/sceneMath";
import type {
  CameraState,
  BodyFaceId,
  DimensionOverlayItem,
  DistanceDimension,
  FilletEdgeId,
  SketchCircle,
  SketchRectangle,
  SceneSelection,
  SolidBody,
  TransformAxis,
  TransformDragState,
  TransformMode,
  TransformTarget,
  Vector3Tuple,
  ViewAction,
  WorkPlane,
  WorkPlaneEdgeId,
  WorkPlaneVertexId,
} from "../../types";
import { PlaneSketches } from "./PlaneSketches";
import { EXPORTABLE_GEOMETRY_FLAG } from "../../../utils/exportSTL";
import { meshDataToGeometry } from "../../utils/booleanCSG";
import { DESIGN_HEALTH_BODY_ID_FLAG } from "../../utils/printCheck";
import { getRectBodyEdges, isFilletCapableBody } from "../../utils/fillet";

// ============================================
// CAMERA SYSTEM
// ============================================

function CameraSetup() {
  const { camera } = useThree();

  useEffect(() => {
    camera.up.copy(WORLD_UP);
    camera.lookAt(DEFAULT_CAMERA_TARGET);
  }, [camera]);

  return null;
}

function CameraObserver({
  controlsRef,
  cameraStateRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  cameraStateRef: React.RefObject<CameraState>;
}) {
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    cameraStateRef.current.offset.copy(controls.object.position).sub(controls.target);
    cameraStateRef.current.up.copy(controls.object.up);
  });

  return null;
}

function CameraAnimator({
  controlsRef,
  desiredPositionRef,
  desiredTargetRef,
  isAnimatingRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  desiredPositionRef: React.RefObject<THREE.Vector3>;
  desiredTargetRef: React.RefObject<THREE.Vector3>;
  isAnimatingRef: React.RefObject<boolean>;
}) {
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || !isAnimatingRef.current) return;

    const camera = controls.object;
    const desiredPosition = desiredPositionRef.current;
    const desiredTarget = desiredTargetRef.current;

    camera.position.lerp(desiredPosition, 0.12);
    controls.target.lerp(desiredTarget, 0.12);

    camera.up.copy(WORLD_UP);
    controls.update();

    const positionSettled =
      camera.position.distanceToSquared(desiredPosition) < 0.0001;
    const targetSettled =
      controls.target.distanceToSquared(desiredTarget) < 0.0001;

    if (positionSettled && targetSettled) {
      camera.position.copy(desiredPosition);
      controls.target.copy(desiredTarget);
      controls.update();
      isAnimatingRef.current = false;
    }
  });

  return null;
}

// ============================================
// VIEWPORT HELPERS
// ============================================

function BaseGrid() {
  const majorGrid = useMemo(
    () => new THREE.GridHelper(500, 50, "#9aa3af", "#9aa3af"),
    []
  );
  const minorGrid = useMemo(
    () => new THREE.GridHelper(500, 500, "#e4e7eb", "#e4e7eb"),
    []
  );

  useEffect(() => {
    const configureGrid = (grid: THREE.GridHelper, opacity: number, zOffset: number) => {
      grid.rotation.x = Math.PI / 2;
      grid.position.z = zOffset;
      grid.renderOrder = 0;
      const material = Array.isArray(grid.material) ? grid.material : [grid.material];
      material.forEach((mat) => {
        mat.transparent = true;
        mat.opacity = opacity;
        mat.depthWrite = false;
      });
    };
    configureGrid(minorGrid, 0.22, -0.006);
    configureGrid(majorGrid, 0.42, -0.004);
  }, [majorGrid, minorGrid]);

  useEffect(
    () => () => {
      majorGrid.geometry.dispose();
      (Array.isArray(majorGrid.material)
        ? majorGrid.material
        : [majorGrid.material]
      ).forEach((mat) => mat.dispose());
      minorGrid.geometry.dispose();
      (Array.isArray(minorGrid.material)
        ? minorGrid.material
        : [minorGrid.material]
      ).forEach((mat) => mat.dispose());
    },
    [majorGrid, minorGrid]
  );

  return (
    <group>
      <primitive object={minorGrid} {...nonSelectableProps} />
      <primitive object={majorGrid} {...nonSelectableProps} />
    </group>
  );
}

function Axes() {
  const extent = 250;

  return (
    <group>
      <line {...nonSelectableProps}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([-extent, 0, 0, extent, 0, 0]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#ff4d4f" transparent opacity={0.72} />
      </line>

      <line {...nonSelectableProps}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, -extent, 0, 0, extent, 0]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#22c55e" transparent opacity={0.72} />
      </line>

      <line {...nonSelectableProps}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, 0, -extent, 0, 0, extent]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#3b82f6" transparent opacity={0.72} />
      </line>
    </group>
  );
}

function OriginMarker() {
  return (
    <mesh position={[0, 0, 0]} {...nonSelectableProps}>
      <sphereGeometry args={[0.03, 16, 16]} />
      <meshBasicMaterial color="#222222" />
    </mesh>
  );
}

const ActiveSketchPlaneOverlay = memo(function ActiveSketchPlaneOverlay({
  plane,
}: {
  plane: {
    id: string;
    position: Vector3Tuple;
    rotation: Vector3Tuple;
    scale: Vector3Tuple;
    sourceKind?: "workplane" | "face";
  } | null;
}) {
  if (!plane) return null;
  const planeSize = plane.sourceKind === "face" ? 80 : 120;
  const half = planeSize / 2;
  const gridStep = plane.sourceKind === "face" ? 8 : 10;
  const lines: number[] = [];
  for (let x = -half; x <= half + 1e-6; x += gridStep) {
    lines.push(x, -half, 0.002, x, half, 0.002);
  }
  for (let y = -half; y <= half + 1e-6; y += gridStep) {
    lines.push(-half, y, 0.002, half, y, 0.002);
  }

  return (
    <group position={plane.position} rotation={plane.rotation} scale={plane.scale}>
      <mesh renderOrder={6} {...nonSelectableProps}>
        <planeGeometry args={[planeSize, planeSize]} />
        <meshBasicMaterial
          color={plane.sourceKind === "face" ? "#9fc7df" : "#a6d0e8"}
          transparent
          opacity={plane.sourceKind === "face" ? 0.12 : 0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <lineSegments renderOrder={7} {...nonSelectableProps}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(lines), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={plane.sourceKind === "face" ? "#46647a" : "#5d7387"}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
});

// ============================================
// SCENE OBJECTS
// ============================================

const WorkPlaneMesh = memo(function WorkPlaneMesh({
  plane,
  primarySelection,
  secondarySelection,
  activePlaneId,
  selectionEnabled,
  onSelect,
}: {
  plane: WorkPlane;
  primarySelection: SceneSelection;
  secondarySelection: SceneSelection;
  activePlaneId: string | null;
  selectionEnabled: boolean;
  onSelect: (selection: SceneSelection, additive: boolean) => void;
}) {
  const planeGeometry = useMemo(
    () => new THREE.PlaneGeometry(plane.size.width, plane.size.height),
    [plane.size.height, plane.size.width]
  );
  const outlineGeometry = useMemo(
    () => new THREE.EdgesGeometry(planeGeometry),
    [planeGeometry]
  );

  useEffect(() => {
    return () => {
      outlineGeometry.dispose();
      planeGeometry.dispose();
    };
  }, [outlineGeometry, planeGeometry]);

  const highlight = useMemo(
    () => getPlaneSelectionHighlight(primarySelection, secondarySelection, plane.id),
    [plane.id, primarySelection, secondarySelection]
  );
  const edgeLineZOffset = 0.02;
  const edgeThickness = 3;
  const vertexRadius = 2.6;
  const getRoleColor = (role: "primary" | "secondary" | null) =>
    role ? "#050505" : "#0f172a";
  const getFaceColor = (role: "primary" | "secondary" | null) =>
    role ? "#050505" : "#7dd3fc";
  const isActive = activePlaneId === plane.id;
  const faceOpacity = highlight.faceRole ? 0.4 : isActive ? 0.12 : 0.015;
  const faceColor = highlight.faceRole
    ? getFaceColor(highlight.faceRole)
    : isActive
      ? "#8ccbe6"
      : "#aab4c2";
  const outlineOpacity = highlight.faceRole ? 1 : isActive ? 0.86 : 0.26;
  const outlineColor = highlight.faceRole
    ? getRoleColor(highlight.faceRole)
    : isActive
      ? "#51667f"
      : "#8894a3";
  const planeSurfaceZ = isActive ? 0.02 : 0.01;
  const outlineZ = isActive ? 0.03 : 0.018;

  const renderEdgeHitTarget = (edgeId: WorkPlaneEdgeId) => {
    const halfWidth = plane.size.width / 2;
    const halfHeight = plane.size.height / 2;
    const isHorizontal = edgeId === "top" || edgeId === "bottom";

    let position: Vector3Tuple = [0, halfHeight, 0];
    if (edgeId === "right") position = [halfWidth, 0, 0];
    if (edgeId === "bottom") position = [0, -halfHeight, 0];
    if (edgeId === "left") position = [-halfWidth, 0, 0];

    return (
      <mesh
        key={edgeId}
        position={position}
        {...(!selectionEnabled ? nonSelectableProps : {})}
        onClick={(event) => {
          if (!selectionEnabled) return;
          event.stopPropagation();
          onSelect(
            createSelection("plane", plane.id, "edge", edgeId),
            event.shiftKey
          );
        }}
      >
        <boxGeometry
          args={[
            isHorizontal ? plane.size.width : edgeThickness * 2,
            isHorizontal ? edgeThickness * 2 : plane.size.height,
            0.8,
          ]}
        />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    );
  };

  const renderVertexHitTarget = (vertexId: WorkPlaneVertexId) => {
    const localPoint = getWorkPlaneVertexLocalPoint(plane, vertexId);

    return (
      <mesh
        key={vertexId}
        position={[localPoint.x, localPoint.y, localPoint.z]}
        {...(!selectionEnabled ? nonSelectableProps : {})}
        onClick={(event) => {
          if (!selectionEnabled) return;
          event.stopPropagation();
          onSelect(
            createSelection("plane", plane.id, "vertex", vertexId),
            event.shiftKey
          );
        }}
      >
        <sphereGeometry args={[vertexRadius, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    );
  };

  return (
    <group position={plane.position} rotation={plane.rotation} scale={plane.scale}>
      <mesh
        position={[0, 0, planeSurfaceZ]}
        renderOrder={1}
        {...(!selectionEnabled ? nonSelectableProps : {})}
        onClick={(event) => {
          if (!selectionEnabled) return;
          event.stopPropagation();
          onSelect(
            createSelection("plane", plane.id, "face", WORK_PLANE_FACE_ID),
            event.shiftKey
          );
        }}
      >
        <primitive object={planeGeometry} attach="geometry" />
        <meshBasicMaterial
          color={faceColor}
          transparent
          opacity={faceOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
        />
      </mesh>

      <lineSegments position={[0, 0, outlineZ]} renderOrder={2}>
        <primitive object={outlineGeometry} attach="geometry" />
        <lineBasicMaterial
          color={outlineColor}
          transparent
          opacity={outlineOpacity}
        />
      </lineSegments>

      {WORK_PLANE_EDGE_IDS.map((edgeId) => {
        const [start, end] = getWorkPlaneEdgeLocalPoints(plane, edgeId);
        const role = highlight.selectedEdgeRoleById[edgeId];
        const edgePoints = new Float32Array([
          start.x,
          start.y,
          edgeLineZOffset,
          end.x,
          end.y,
          edgeLineZOffset,
        ]);

        return (
          <group key={`edge-highlight-${edgeId}`}>
            <line {...nonSelectableProps}>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[edgePoints, 3]}
                />
              </bufferGeometry>
              <lineBasicMaterial
                color={getRoleColor(role)}
                transparent
                linewidth={12}
                opacity={role ? 1 : 0}
              />
            </line>
            {renderEdgeHitTarget(edgeId)}
          </group>
        );
      })}

      {WORK_PLANE_VERTEX_IDS.map((vertexId) => {
        const localPoint = getWorkPlaneVertexLocalPoint(plane, vertexId);
        const role = highlight.selectedVertexRoleById[vertexId];

        return (
          <group key={`vertex-highlight-${vertexId}`}>
            <mesh
              position={[localPoint.x, localPoint.y, edgeLineZOffset]}
              scale={role ? 1.18 : 0.85}
              {...nonSelectableProps}
            >
              <sphereGeometry args={[0.62, 16, 16]} />
              <meshBasicMaterial
                color={getRoleColor(role)}
                transparent
                opacity={role ? 1 : 0}
              />
            </mesh>
            {renderVertexHitTarget(vertexId)}
          </group>
        );
      })}
    </group>
  );
});

const WorkPlanes = memo(function WorkPlanes({
  workPlanes,
  primarySelection,
  secondarySelection,
  activePlaneId,
  selectionEnabled,
  onSelect,
}: {
  workPlanes: WorkPlane[];
  primarySelection: SceneSelection;
  secondarySelection: SceneSelection;
  activePlaneId: string | null;
  selectionEnabled: boolean;
  onSelect: (selection: SceneSelection, additive: boolean) => void;
}) {
  return (
    <>
      {workPlanes
        .filter((plane) => plane.visible)
        .map((plane) => (
          <WorkPlaneMesh
            key={plane.id}
            plane={plane}
            primarySelection={primarySelection}
            secondarySelection={secondarySelection}
            activePlaneId={activePlaneId}
            selectionEnabled={selectionEnabled}
            onSelect={onSelect}
          />
        ))}
    </>
  );
});

const CircleCurve = memo(function CircleCurve({
  radius,
  zOffset = 0.06,
  color = "#1f2937",
  opacity = 1,
}: {
  radius: number;
  zOffset?: number;
  color?: string;
  opacity?: number;
}) {
  const points = useMemo(() => {
    const segments = 72;
    const values: number[] = [];

    for (let i = 0; i <= segments; i += 1) {
      const t = (i / segments) * Math.PI * 2;
      values.push(Math.cos(t) * radius, Math.sin(t) * radius, zOffset);
    }

    return new Float32Array(values);
  }, [radius, zOffset]);

  return (
    <line {...nonSelectableProps}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
    </line>
  );
});

const SketchCircleItem = memo(function SketchCircleItem({
  circle,
  selected,
  curveSelected,
  extrudeModeArmed,
  onSelectSketchCircle,
  onSelectSketchCurve,
}: {
  circle: SketchCircle;
  selected: boolean;
  curveSelected: boolean;
  extrudeModeArmed: boolean;
  onSelectSketchCircle: (id: string | null) => void;
  onSelectSketchCurve: (selection: {
    profileId: string;
    profileType: "circle";
    curveKind: "circle";
  }, additive: boolean) => void;
}) {
  const accentRingGeometry = useMemo(
    () =>
      new THREE.RingGeometry(
        Math.max(0.1, circle.radius - 0.18),
        circle.radius + 0.18,
        64
      ),
    [circle.radius]
  );
  const fillGeometry = useMemo(
    () => new THREE.CircleGeometry(Math.max(0.2, circle.radius), 64),
    [circle.radius]
  );
  const pickRingGeometry = useMemo(
    () =>
      new THREE.RingGeometry(
        Math.max(0.1, circle.radius - 1.2),
        circle.radius + 1.2,
        48
      ),
    [circle.radius]
  );

  useEffect(
    () => () => {
      accentRingGeometry.dispose();
      fillGeometry.dispose();
      pickRingGeometry.dispose();
    },
    [accentRingGeometry, fillGeometry, pickRingGeometry]
  );

  return (
    <group
      position={circle.planePosition}
      rotation={circle.planeRotation}
      scale={circle.planeScale}
    >
      <group position={[circle.center[0], circle.center[1], 0]}>
        <CircleCurve
          radius={circle.radius}
          color={curveSelected ? "#020617" : selected ? "#0f172a" : "#1f2937"}
          opacity={selected ? 1 : 0.92}
          zOffset={0.085}
        />
        <mesh position={[0, 0, 0.07]} {...nonSelectableProps}>
          <sphereGeometry args={[0.42, 16, 16]} />
          <meshBasicMaterial
            color={selected ? "#0f172a" : "#334155"}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </mesh>
        <mesh geometry={accentRingGeometry} {...nonSelectableProps}>
          <meshBasicMaterial
            transparent
            opacity={selected ? 0.6 : 0.34}
            color={selected ? "#111827" : "#334155"}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh
          geometry={fillGeometry}
          onClick={(event) => {
            event.stopPropagation();
            onSelectSketchCircle(circle.id);
          }}
        >
          <meshBasicMaterial
            transparent
            opacity={selected ? 0.12 : extrudeModeArmed ? 0.08 : 0.04}
            color={selected ? "#0f172a" : extrudeModeArmed ? "#64748b" : "#334155"}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh
          geometry={pickRingGeometry}
          onClick={(event) => {
            event.stopPropagation();
            onSelectSketchCurve(
              {
                profileId: circle.id,
                profileType: "circle",
                curveKind: "circle",
              },
              event.shiftKey
            );
          }}
        >
          <meshBasicMaterial
            transparent
            opacity={curveSelected ? 0.24 : selected ? 0.12 : 0.03}
            color={curveSelected ? "#111827" : selected ? "#e2e8f0" : "#cbd5e1"}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
});

const SketchCircles = memo(function SketchCircles({
  circles,
  selectedSketchCircleId,
  selectedCurveSelections,
  extrudeModeArmed,
  onSelectSketchCircle,
  onSelectSketchCurve,
}: {
  circles: SketchCircle[];
  selectedSketchCircleId: string | null;
  selectedCurveSelections: Array<{
    profileId: string;
    curveKind: "circle" | "rectangle-edge";
    edgeId?: "top" | "right" | "bottom" | "left";
  }>;
  extrudeModeArmed: boolean;
  onSelectSketchCircle: (id: string | null) => void;
  onSelectSketchCurve: (selection: {
    profileId: string;
    profileType: "circle";
    curveKind: "circle";
  }, additive: boolean) => void;
}) {
  return (
    <>
      {circles.map((circle) => (
        <SketchCircleItem
          key={circle.id}
          circle={circle}
          selected={selectedSketchCircleId === circle.id}
          curveSelected={selectedCurveSelections.some(
            (selection) =>
              selection.profileId === circle.id && selection.curveKind === "circle"
          )}
          extrudeModeArmed={extrudeModeArmed}
          onSelectSketchCircle={onSelectSketchCircle}
          onSelectSketchCurve={onSelectSketchCurve}
        />
      ))}
    </>
  );
});

const RectangleCurve = memo(function RectangleCurve({
  width,
  height,
  color,
  opacity,
  zOffset,
}: {
  width: number;
  height: number;
  color: string;
  opacity: number;
  zOffset: number;
}) {
  const points = useMemo(() => {
    const w = Math.max(0.1, width) / 2;
    const h = Math.max(0.1, height) / 2;
    return new Float32Array([
      -w,
      -h,
      zOffset,
      w,
      -h,
      zOffset,
      w,
      h,
      zOffset,
      -w,
      h,
      zOffset,
      -w,
      -h,
      zOffset,
    ]);
  }, [height, width, zOffset]);

  return (
    <lineLoop {...nonSelectableProps}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineLoop>
  );
});

const SketchRectangleItem = memo(function SketchRectangleItem({
  rectangle,
  selected,
  selectedEdges,
  extrudeModeArmed,
  onSelectSketchCircle,
  onSelectSketchCurve,
}: {
  rectangle: SketchRectangle;
  selected: boolean;
  selectedEdges: Array<"top" | "right" | "bottom" | "left">;
  extrudeModeArmed: boolean;
  onSelectSketchCircle: (id: string | null) => void;
  onSelectSketchCurve: (
    selection: {
      profileId: string;
      profileType: "rectangle";
      curveKind: "rectangle-edge";
      edgeId: "top" | "right" | "bottom" | "left";
    },
    additive: boolean
  ) => void;
}) {
  const fillGeometry = useMemo(
    () =>
      new THREE.PlaneGeometry(
        Math.max(0.2, rectangle.width),
        Math.max(0.2, rectangle.height)
      ),
    [rectangle.height, rectangle.width]
  );

  useEffect(
    () => () => {
      fillGeometry.dispose();
    },
    [fillGeometry]
  );

  return (
    <group
      position={rectangle.planePosition}
      rotation={rectangle.planeRotation}
      scale={rectangle.planeScale}
    >
      <group position={[rectangle.center[0], rectangle.center[1], 0]}>
        <RectangleCurve
          width={rectangle.width}
          height={rectangle.height}
          color={selectedEdges.length > 0 ? "#020617" : selected ? "#0f172a" : "#1f2937"}
          opacity={selected ? 1 : 0.92}
          zOffset={0.085}
        />
        {(["top", "right", "bottom", "left"] as const).map((edgeId) => {
          const halfW = Math.max(0.1, rectangle.width) / 2;
          const halfH = Math.max(0.1, rectangle.height) / 2;
          const isHorizontal = edgeId === "top" || edgeId === "bottom";
          const selectedEdge = selectedEdges.includes(edgeId);
          const position: Vector3Tuple =
            edgeId === "top"
              ? [0, halfH, 0.1]
              : edgeId === "bottom"
                ? [0, -halfH, 0.1]
                : edgeId === "left"
                  ? [-halfW, 0, 0.1]
                  : [halfW, 0, 0.1];

          return (
            <mesh
              key={`${rectangle.id}-${edgeId}`}
              position={position}
              onClick={(event) => {
                event.stopPropagation();
                onSelectSketchCurve(
                  {
                    profileId: rectangle.id,
                    profileType: "rectangle",
                    curveKind: "rectangle-edge",
                    edgeId,
                  },
                  event.shiftKey
                );
              }}
            >
              <boxGeometry
                args={[
                  isHorizontal ? Math.max(0.3, rectangle.width) : 1.2,
                  isHorizontal ? 1.2 : Math.max(0.3, rectangle.height),
                  0.2,
                ]}
              />
              <meshBasicMaterial
                transparent
                opacity={selectedEdge ? 0.24 : 0.03}
                color={selectedEdge ? "#111827" : "#cbd5e1"}
                depthWrite={false}
              />
            </mesh>
          );
        })}
        <mesh
          geometry={fillGeometry}
          onClick={(event) => {
            event.stopPropagation();
            onSelectSketchCircle(rectangle.id);
          }}
        >
          <meshBasicMaterial
            transparent
            opacity={selected ? 0.1 : extrudeModeArmed ? 0.07 : 0.03}
            color={selected ? "#0f172a" : extrudeModeArmed ? "#64748b" : "#334155"}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
});

const SketchRectangles = memo(function SketchRectangles({
  rectangles,
  selectedSketchCircleId,
  selectedCurveSelections,
  extrudeModeArmed,
  onSelectSketchCircle,
  onSelectSketchCurve,
}: {
  rectangles: SketchRectangle[];
  selectedSketchCircleId: string | null;
  selectedCurveSelections: Array<{
    profileId: string;
    curveKind: "circle" | "rectangle-edge";
    edgeId?: "top" | "right" | "bottom" | "left";
  }>;
  extrudeModeArmed: boolean;
  onSelectSketchCircle: (id: string | null) => void;
  onSelectSketchCurve: (
    selection: {
      profileId: string;
      profileType: "rectangle";
      curveKind: "rectangle-edge";
      edgeId: "top" | "right" | "bottom" | "left";
    },
    additive: boolean
  ) => void;
}) {
  return (
    <>
      {rectangles.map((rectangle) => (
        <SketchRectangleItem
          key={rectangle.id}
          rectangle={rectangle}
          selected={selectedSketchCircleId === rectangle.id}
          selectedEdges={selectedCurveSelections
            .filter(
              (selection) =>
                selection.profileId === rectangle.id &&
                selection.curveKind === "rectangle-edge" &&
                selection.edgeId
            )
            .map((selection) => selection.edgeId as "top" | "right" | "bottom" | "left")}
          extrudeModeArmed={extrudeModeArmed}
          onSelectSketchCircle={onSelectSketchCircle}
          onSelectSketchCurve={onSelectSketchCurve}
        />
      ))}
    </>
  );
});

const SketchCirclePreview = memo(function SketchCirclePreview({
  preview,
}: {
  preview: {
    planePosition: Vector3Tuple;
    planeRotation: Vector3Tuple;
    planeScale: Vector3Tuple;
    center: [number, number];
    radius: number;
  } | null;
}) {
  if (!preview || preview.radius <= 0) return null;

  return (
    <group
      position={preview.planePosition}
      rotation={preview.planeRotation}
      scale={preview.planeScale}
    >
      <group position={[preview.center[0], preview.center[1], 0]}>
        <CircleCurve
          radius={preview.radius}
          zOffset={0.1}
          color="#0b1220"
          opacity={1}
        />
        <mesh position={[0, 0, 0.08]} {...nonSelectableProps}>
          <sphereGeometry args={[0.45, 20, 20]} />
          <meshBasicMaterial color="#0b1220" transparent opacity={0.9} depthWrite={false} />
        </mesh>
        <mesh {...nonSelectableProps}>
          <ringGeometry
            args={[Math.max(0.1, preview.radius - 0.22), preview.radius + 0.22, 96]}
          />
          <meshBasicMaterial
            transparent
            opacity={0.7}
            color="#0b1220"
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
});

const SketchRectanglePreview = memo(function SketchRectanglePreview({
  preview,
}: {
  preview: {
    planePosition: Vector3Tuple;
    planeRotation: Vector3Tuple;
    planeScale: Vector3Tuple;
    center: [number, number];
    width: number;
    height: number;
  } | null;
}) {
  if (!preview || preview.width <= 0 || preview.height <= 0) return null;

  return (
    <group
      position={preview.planePosition}
      rotation={preview.planeRotation}
      scale={preview.planeScale}
    >
      <group position={[preview.center[0], preview.center[1], 0]}>
        <RectangleCurve
          width={preview.width}
          height={preview.height}
          zOffset={0.1}
          color="#0b1220"
          opacity={1}
        />
        <mesh {...nonSelectableProps}>
          <planeGeometry args={[preview.width, preview.height]} />
          <meshBasicMaterial
            transparent
            opacity={0.14}
            color="#0b1220"
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
});

const ExtrudePreviewBody = memo(function ExtrudePreviewBody({
  preview,
}: {
  preview: {
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
  } | null;
}) {
  if (!preview || preview.depth <= 0) return null;

  return (
    <group
      position={preview.planePosition}
      rotation={preview.planeRotation}
      scale={preview.planeScale}
    >
      {preview.sourceProfileType === "circle" ? (
        <mesh
          position={[
            preview.center[0],
            preview.center[1],
            (preview.direction * preview.depth) / 2,
          ]}
          rotation={[Math.PI / 2, 0, 0]}
          {...nonSelectableProps}
        >
          <cylinderGeometry
            args={[Math.max(0.1, preview.radius ?? 0.1), Math.max(0.1, preview.radius ?? 0.1), preview.depth, 28]}
          />
          <meshStandardMaterial
            color="#97a9be"
            transparent
            opacity={0.5}
            metalness={0.1}
            roughness={0.36}
            depthWrite={false}
          />
        </mesh>
      ) : (
        <mesh
          position={[
            preview.center[0],
            preview.center[1],
            (preview.direction * preview.depth) / 2,
          ]}
          {...nonSelectableProps}
        >
          <boxGeometry
            args={[
              Math.max(0.1, preview.width ?? 0.1),
              Math.max(0.1, preview.height ?? 0.1),
              preview.depth,
            ]}
          />
          <meshStandardMaterial
            color="#97a9be"
            transparent
            opacity={0.5}
            metalness={0.1}
            roughness={0.36}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
});

const BooleanPreviewMesh = memo(function BooleanPreviewMesh({
  meshData,
}: {
  meshData: SolidBody["meshData"];
}) {
  const geometry = useMemo(() => {
    if (!meshData) return null;
    return meshDataToGeometry(meshData);
  }, [meshData]);

  useEffect(
    () => () => {
      geometry?.dispose();
    },
    [geometry]
  );

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} {...nonSelectableProps}>
      <meshStandardMaterial
        color="#8fa1b7"
        transparent
        opacity={0.45}
        metalness={0.1}
        roughness={0.38}
        depthWrite={false}
      />
    </mesh>
  );
});

function applyHealthTint(
  color: string,
  status: "idle" | "ok" | "warning" | "error",
  selected: boolean
) {
  if (status === "idle" || status === "ok") return color;
  const base = new THREE.Color(color);
  const tint = new THREE.Color(status === "error" ? "#cf5656" : "#bea15a");
  const intensity = status === "error" ? (selected ? 0.28 : 0.2) : selected ? 0.2 : 0.14;
  base.lerp(tint, intensity);
  return `#${base.getHexString()}`;
}

function getHealthEmissive(status: "idle" | "ok" | "warning" | "error") {
  if (status === "error") return "#3a1010";
  if (status === "warning") return "#352612";
  return "#000000";
}

function getHealthEmissiveIntensity(
  status: "idle" | "ok" | "warning" | "error",
  selected: boolean
) {
  if (status === "error") return selected ? 0.24 : 0.14;
  if (status === "warning") return selected ? 0.16 : 0.09;
  return 0;
}

const SolidBodyMesh = memo(function SolidBodyMesh({
  body,
  selected,
  booleanRole,
  selectedFaceId,
  selectedEdgeId,
  onSelectSolidBody,
  onSelectSolidFace,
  onHoverSolidFace,
  onSelectSolidEdge,
  healthStatus,
  filletModeActive,
  holeModeActive,
  previewMeshData,
}: {
  body: SolidBody;
  selected: boolean;
  booleanRole: "base" | "tool" | null;
  selectedFaceId: BodyFaceId | null;
  selectedEdgeId: FilletEdgeId | null;
  onSelectSolidBody: (id: string | null) => void;
  onSelectSolidFace: (
    bodyId: string,
    faceId: BodyFaceId,
    hit?: { point: Vector3Tuple; normal: Vector3Tuple }
  ) => void;
  onHoverSolidFace: (
    bodyId: string,
    faceId: BodyFaceId,
    hit?: { point: Vector3Tuple; normal: Vector3Tuple }
  ) => void;
  onSelectSolidEdge: (bodyId: string, edgeId: FilletEdgeId) => void;
  healthStatus: "idle" | "ok" | "warning" | "error";
  filletModeActive: boolean;
  holeModeActive: boolean;
  previewMeshData: SolidBody["meshData"] | null;
}) {
  const bodyTransform = body.transform ?? {
    position: [0, 0, 0] as Vector3Tuple,
    rotation: [0, 0, 0] as Vector3Tuple,
    scale: [1, 1, 1] as Vector3Tuple,
  };
  const sideGeometry = useMemo(() => {
    if (previewMeshData) {
      return meshDataToGeometry(previewMeshData);
    }
    if (body.profileType === "mesh" && body.meshData) {
      return meshDataToGeometry(body.meshData);
    }
    if (body.profileType === "rectangle") {
      return new THREE.BoxGeometry(
        Math.max(0.1, body.width ?? 0.1),
        Math.max(0.1, body.height ?? 0.1),
        body.depth
      );
    }
    const radius = Math.max(0.1, body.radius ?? 0.1);
    return new THREE.CylinderGeometry(radius, radius, body.depth, 64);
  }, [body.depth, body.height, body.meshData, body.profileType, body.radius, body.width, previewMeshData]);
  const capGeometry = useMemo(() => {
    if (previewMeshData) {
      return meshDataToGeometry(previewMeshData);
    }
    if (body.profileType === "mesh" && body.meshData) {
      return meshDataToGeometry(body.meshData);
    }
    if (body.profileType === "rectangle") {
      return new THREE.BoxGeometry(
        Math.max(0.1, body.width ?? 0.1),
        Math.max(0.1, body.height ?? 0.1),
        body.depth
      );
    }
    const radius = Math.max(0.1, body.radius ?? 0.1);
    return new THREE.CylinderGeometry(radius, radius, body.depth, 64);
  }, [body.depth, body.height, body.meshData, body.profileType, body.radius, body.width, previewMeshData]);
  const edgeGeometry = useMemo(() => {
    const thresholdAngle = body.profileType === "mesh" || previewMeshData ? 82 : 18;
    return new THREE.EdgesGeometry(capGeometry, thresholdAngle);
  }, [body.profileType, capGeometry, previewMeshData]);

  const edgeDescriptors = useMemo(() => getRectBodyEdges(body), [body]);
  const renderAsMesh = body.profileType === "mesh" || !!previewMeshData;

  useEffect(
    () => () => {
      edgeGeometry.dispose();
      sideGeometry.dispose();
      capGeometry.dispose();
    },
    [capGeometry, edgeGeometry, sideGeometry]
  );

  return (
    <group
      position={bodyTransform.position}
      rotation={bodyTransform.rotation}
      scale={bodyTransform.scale}
    >
      <group
        position={body.planePosition}
        rotation={body.planeRotation}
        scale={body.planeScale}
      >
        <mesh
          position={
            renderAsMesh
              ? [0, 0, 0]
              : [body.center[0], body.center[1], ((body.direction ?? 1) * body.depth) / 2]
          }
          rotation={body.profileType === "circle" && !renderAsMesh ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
          userData={{
            [EXPORTABLE_GEOMETRY_FLAG]: true,
            [DESIGN_HEALTH_BODY_ID_FLAG]: body.id,
          }}
          onClick={(event) => {
            event.stopPropagation();
            onSelectSolidBody(body.id);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            const normal = event.face?.normal
              ? event.face.normal
                  .clone()
                  .applyMatrix3(new THREE.Matrix3().getNormalMatrix(event.object.matrixWorld))
                  .normalize()
              : new THREE.Vector3(0, 0, 1);
            onSelectSolidFace(body.id, "side", {
              point: [event.point.x, event.point.y, event.point.z],
              normal: [normal.x, normal.y, normal.z],
            });
          }}
          onPointerMove={(event) => {
            if (!holeModeActive) return;
            const normal = event.face?.normal
              ? event.face.normal
                  .clone()
                  .applyMatrix3(new THREE.Matrix3().getNormalMatrix(event.object.matrixWorld))
                  .normalize()
              : new THREE.Vector3(0, 0, 1);
            onHoverSolidFace(body.id, "side", {
              point: [event.point.x, event.point.y, event.point.z],
              normal: [normal.x, normal.y, normal.z],
            });
          }}
        >
          <primitive attach="geometry" object={sideGeometry} />
          <meshStandardMaterial
            color={applyHealthTint(
              selectedFaceId === "side"
                ? holeModeActive
                  ? "#dbeeff"
                  : "#eef4fc"
                : booleanRole === "base"
                  ? "#dbeafe"
                  : booleanRole === "tool"
                    ? "#fee2e2"
                    : selected
                      ? "#dbe4f0"
                      : "#b8c3d2",
              healthStatus,
              selected
            )}
            emissive={getHealthEmissive(healthStatus)}
            emissiveIntensity={getHealthEmissiveIntensity(healthStatus, selected) + (holeModeActive && selectedFaceId === "side" ? 0.09 : 0)}
            metalness={0.12}
            roughness={0.28}
          />
        </mesh>
        {!renderAsMesh ? (
          <>
            <mesh
              position={[
                body.center[0],
                body.center[1],
                (body.direction ?? 1) * body.depth + 0.01,
              ]}
              userData={{
                [EXPORTABLE_GEOMETRY_FLAG]: false,
                [DESIGN_HEALTH_BODY_ID_FLAG]: body.id,
              }}
              onClick={(event) => {
                event.stopPropagation();
                const normal = event.face?.normal
                  ? event.face.normal
                      .clone()
                      .applyMatrix3(new THREE.Matrix3().getNormalMatrix(event.object.matrixWorld))
                      .normalize()
                  : new THREE.Vector3(0, 0, 1);
                onSelectSolidFace(body.id, "top", {
                  point: [event.point.x, event.point.y, event.point.z],
                  normal: [normal.x, normal.y, normal.z],
                });
              }}
              onPointerMove={(event) => {
                if (!holeModeActive) return;
                const normal = event.face?.normal
                  ? event.face.normal
                      .clone()
                      .applyMatrix3(new THREE.Matrix3().getNormalMatrix(event.object.matrixWorld))
                      .normalize()
                  : new THREE.Vector3(0, 0, 1);
                onHoverSolidFace(body.id, "top", {
                  point: [event.point.x, event.point.y, event.point.z],
                  normal: [normal.x, normal.y, normal.z],
                });
              }}
            >
              {body.profileType === "rectangle" ? (
                <planeGeometry
                  args={[
                    Math.max(0.1, (body.width ?? 0.1) * 0.985),
                    Math.max(0.1, (body.height ?? 0.1) * 0.985),
                  ]}
                />
              ) : (
                <circleGeometry args={[Math.max(0.1, (body.radius ?? 0.1) * 0.985), 64]} />
              )}
              <meshStandardMaterial
                color={applyHealthTint(
                  selectedFaceId === "top"
                    ? holeModeActive
                      ? "#dbeeff"
                      : "#f2f7ff"
                    : selected
                      ? "#e5ecf5"
                      : "#cfd8e4",
                  healthStatus,
                  selected
                )}
                emissive={getHealthEmissive(healthStatus)}
                emissiveIntensity={getHealthEmissiveIntensity(healthStatus, selected) + (holeModeActive && selectedFaceId === "top" ? 0.09 : 0)}
                metalness={0.08}
                roughness={0.3}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh
              position={[body.center[0], body.center[1], 0.01]}
              rotation={[Math.PI, 0, 0]}
              userData={{
                [EXPORTABLE_GEOMETRY_FLAG]: false,
                [DESIGN_HEALTH_BODY_ID_FLAG]: body.id,
              }}
              onClick={(event) => {
                event.stopPropagation();
                const normal = event.face?.normal
                  ? event.face.normal
                      .clone()
                      .applyMatrix3(new THREE.Matrix3().getNormalMatrix(event.object.matrixWorld))
                      .normalize()
                  : new THREE.Vector3(0, 0, -1);
                onSelectSolidFace(body.id, "bottom", {
                  point: [event.point.x, event.point.y, event.point.z],
                  normal: [normal.x, normal.y, normal.z],
                });
              }}
              onPointerMove={(event) => {
                if (!holeModeActive) return;
                const normal = event.face?.normal
                  ? event.face.normal
                      .clone()
                      .applyMatrix3(new THREE.Matrix3().getNormalMatrix(event.object.matrixWorld))
                      .normalize()
                  : new THREE.Vector3(0, 0, -1);
                onHoverSolidFace(body.id, "bottom", {
                  point: [event.point.x, event.point.y, event.point.z],
                  normal: [normal.x, normal.y, normal.z],
                });
              }}
            >
              {body.profileType === "rectangle" ? (
                <planeGeometry
                  args={[
                    Math.max(0.1, (body.width ?? 0.1) * 0.985),
                    Math.max(0.1, (body.height ?? 0.1) * 0.985),
                  ]}
                />
              ) : (
                <circleGeometry args={[Math.max(0.1, (body.radius ?? 0.1) * 0.985), 64]} />
              )}
              <meshStandardMaterial
                color={applyHealthTint(
                  selectedFaceId === "bottom"
                    ? holeModeActive
                      ? "#dbeeff"
                      : "#f2f7ff"
                    : selected
                      ? "#dce4ef"
                      : "#c5cfdd",
                  healthStatus,
                  selected
                )}
                emissive={getHealthEmissive(healthStatus)}
                emissiveIntensity={getHealthEmissiveIntensity(healthStatus, selected) + (holeModeActive && selectedFaceId === "bottom" ? 0.09 : 0)}
                metalness={0.08}
                roughness={0.34}
                side={THREE.DoubleSide}
              />
            </mesh>
          </>
        ) : null}
        {isFilletCapableBody(body) && (selected || filletModeActive) ? (
          <group>
            {edgeDescriptors.map((edge) => {
              const edgeActive = selectedEdgeId === edge.id;
              return (
                <line
                  key={edge.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectSolidEdge(body.id, edge.id);
                  }}
                >
                  <bufferGeometry>
                    <bufferAttribute
                      attach="attributes-position"
                      args={[
                        new Float32Array([
                          edge.start[0],
                          edge.start[1],
                          edge.start[2],
                          edge.end[0],
                          edge.end[1],
                          edge.end[2],
                        ]),
                        3,
                      ]}
                    />
                  </bufferGeometry>
                  <lineBasicMaterial
                    color={edgeActive ? "#8dd1ff" : "#4f6278"}
                    transparent
                    opacity={edgeActive ? 0.95 : 0.58}
                  />
                </line>
              );
            })}
          </group>
        ) : null}
        <lineSegments
          position={
            renderAsMesh
              ? [0, 0, 0]
              : [body.center[0], body.center[1], ((body.direction ?? 1) * body.depth) / 2]
          }
          rotation={body.profileType === "circle" && !renderAsMesh ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
          geometry={edgeGeometry}
          {...nonSelectableProps}
        >
          <lineBasicMaterial
            color={
              booleanRole === "base"
                ? "#1d4ed8"
                : booleanRole === "tool"
                  ? "#b91c1c"
                  : selected || selectedFaceId
                    ? "#0f172a"
                    : body.profileType === "mesh"
                      ? "#334155"
                      : "#334155"
            }
            transparent
            opacity={
              body.profileType === "mesh"
                ? selected || selectedFaceId
                  ? 0.36
                  : 0.18
                : selected || selectedFaceId
                  ? 0.72
                  : 0.52
            }
          />
        </lineSegments>
      </group>
    </group>
  );
});

const SolidBodies = memo(function SolidBodies({
  solidBodies,
  booleanModeActive,
  booleanBaseBodyId,
  booleanToolBodyId,
  selectedSolidBodyId,
  selectedSolidFace,
  selectedSolidEdge,
  onSelectSolidBody,
  onSelectSolidFace,
  onHoverSolidFace,
  onSelectSolidEdge,
  designHealthStatusByBody,
  filletModeActive,
  holeModeActive,
  filletPreviewBodyId,
  filletPreviewMeshData,
}: {
  solidBodies: SolidBody[];
  booleanModeActive: boolean;
  booleanBaseBodyId: string | null;
  booleanToolBodyId: string | null;
  selectedSolidBodyId: string | null;
  selectedSolidFace: { bodyId: string; faceId: BodyFaceId } | null;
  selectedSolidEdge: { bodyId: string; edgeId: FilletEdgeId } | null;
  onSelectSolidBody: (id: string | null) => void;
  onSelectSolidFace: (
    bodyId: string,
    faceId: BodyFaceId,
    hit?: { point: Vector3Tuple; normal: Vector3Tuple }
  ) => void;
  onHoverSolidFace: (
    bodyId: string,
    faceId: BodyFaceId,
    hit?: { point: Vector3Tuple; normal: Vector3Tuple }
  ) => void;
  onSelectSolidEdge: (bodyId: string, edgeId: FilletEdgeId) => void;
  designHealthStatusByBody: Record<string, "idle" | "ok" | "warning" | "error">;
  filletModeActive: boolean;
  holeModeActive: boolean;
  filletPreviewBodyId: string | null;
  filletPreviewMeshData: SolidBody["meshData"] | null;
}) {
  return (
    <group>
      {solidBodies.map((body) => {
        const selected = selectedSolidBodyId === body.id;
        return (
          <SolidBodyMesh
            key={body.id}
            body={body}
            selected={selected}
            booleanRole={
              booleanModeActive
                ? body.id === booleanBaseBodyId
                  ? "base"
                  : body.id === booleanToolBodyId
                    ? "tool"
                    : null
                : null
            }
            selectedFaceId={
              selectedSolidFace?.bodyId === body.id ? selectedSolidFace.faceId : null
            }
            selectedEdgeId={
              selectedSolidEdge?.bodyId === body.id ? selectedSolidEdge.edgeId : null
            }
            onSelectSolidBody={onSelectSolidBody}
            onSelectSolidFace={onSelectSolidFace}
            onHoverSolidFace={onHoverSolidFace}
            onSelectSolidEdge={onSelectSolidEdge}
            healthStatus={designHealthStatusByBody[body.id] ?? "idle"}
            filletModeActive={filletModeActive}
            holeModeActive={
              holeModeActive &&
              selectedSolidFace?.bodyId === body.id
            }
            previewMeshData={filletPreviewBodyId === body.id ? filletPreviewMeshData : null}
          />
        );
      })}
    </group>
  );
});

function ExtrudeArrowManipulator({
  preview,
  onDepthChange,
  onConfirm,
  onCancel,
}: {
  preview: {
    sourceProfileType: "circle" | "rectangle";
    planePosition: Vector3Tuple;
    planeRotation: Vector3Tuple;
    planeScale: Vector3Tuple;
    center: [number, number];
    depth: number;
    direction: 1 | -1;
    radius?: number;
    width?: number;
    height?: number;
  } | null;
  onDepthChange: (signedDepth: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { camera, gl } = useThree();
  const [dragging, setDragging] = useState(false);
  const previewRef = useRef(preview);
  const draggingRef = useRef(false);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  useEffect(() => {
    const raycaster = new THREE.Raycaster();

    const computeSignedDepth = (event: PointerEvent) => {
      const currentPreview = previewRef.current;
      if (!currentPreview) return null;

      const origin = new THREE.Vector3(...currentPreview.planePosition);
      const rotationEuler = new THREE.Euler(...currentPreview.planeRotation);
      const normal = new THREE.Vector3(0, 0, 1).applyEuler(rotationEuler).normalize();
      const basisX = new THREE.Vector3(1, 0, 0).applyEuler(rotationEuler);
      const basisY = new THREE.Vector3(0, 1, 0).applyEuler(rotationEuler);
      const worldCenter = origin
        .clone()
        .addScaledVector(basisX, currentPreview.center[0] * currentPreview.planeScale[0])
        .addScaledVector(basisY, currentPreview.center[1] * currentPreview.planeScale[1]);

      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      const linePoint = worldCenter;
      const lineDir = normal;
      const rayOrigin = raycaster.ray.origin;
      const rayDir = raycaster.ray.direction;

      const w0 = linePoint.clone().sub(rayOrigin);
      const b = lineDir.dot(rayDir);
      const d = lineDir.dot(w0);
      const e = rayDir.dot(w0);
      const denom = 1 - b * b;

      if (Math.abs(denom) > 1e-5) {
        const worldSignedDepth = (b * e - d) / denom;
        return worldSignedDepth / Math.max(0.0001, currentPreview.planeScale[2]);
      }

      return null;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      const signedDepth = computeSignedDepth(event);
      if (signedDepth === null) return;
      onDepthChange(signedDepth);
    };

    const handlePointerUp = () => {
      if (!draggingRef.current) return;
      setDragging(false);
      onConfirm();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDragging(false);
        onCancel();
      }
    };

    gl.domElement.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      gl.domElement.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [camera, gl, onCancel, onConfirm, onDepthChange]);

  if (!preview) return null;

  const handleBaseZ = preview.direction * preview.depth;
  const arrowStemLength = 9;
  const arrowHeadOffset = handleBaseZ + arrowStemLength;

  return (
    <group
      position={preview.planePosition}
      rotation={preview.planeRotation}
      scale={preview.planeScale}
    >
      <group position={[preview.center[0], preview.center[1], 0]}>
        <line {...nonSelectableProps}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([0, 0, handleBaseZ, 0, 0, arrowHeadOffset]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#0f172a" transparent opacity={0.95} />
        </line>

        <mesh
          position={[0, 0, arrowHeadOffset]}
          rotation={[0, 0, preview.direction > 0 ? 0 : Math.PI]}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.button !== 0) return;
            setDragging(true);
          }}
        >
          <coneGeometry args={[1.5, 3.4, 24]} />
          <meshStandardMaterial color="#1e293b" metalness={0.15} roughness={0.35} />
        </mesh>

        <mesh
          position={[0, 0, handleBaseZ + arrowStemLength / 2]}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.button !== 0) return;
            setDragging(true);
          }}
        >
          <cylinderGeometry args={[0.35, 0.35, arrowStemLength, 20]} />
          <meshStandardMaterial color="#334155" metalness={0.12} roughness={0.4} />
        </mesh>

        <mesh
          position={[0, 0, handleBaseZ + arrowStemLength / 2]}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.button !== 0) return;
            setDragging(true);
          }}
        >
          <cylinderGeometry args={[2.2, 2.2, arrowStemLength + 4, 18]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

function SketchPlaneInteraction({
  sketchModeActive,
  activeSketchPlane,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  sketchModeActive: boolean;
  activeSketchPlane: {
    id: string;
    position: Vector3Tuple;
    rotation: Vector3Tuple;
    scale: Vector3Tuple;
    sourceKind?: "workplane" | "face";
  } | null;
  onPointerDown: (
    localPoint: [number, number],
    planeState: {
      id: string;
      position: Vector3Tuple;
      rotation: Vector3Tuple;
      scale: Vector3Tuple;
    }
  ) => void;
  onPointerMove: (localPoint: [number, number]) => void;
  onPointerUp: () => void;
}) {
  const inverseSketchMatrix = useMemo(() => {
    if (!activeSketchPlane) return null;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...activeSketchPlane.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...activeSketchPlane.rotation)),
      new THREE.Vector3(...activeSketchPlane.scale)
    );
    return matrix.invert();
  }, [activeSketchPlane]);

  const toLocalPoint = useCallback(
    (worldPoint: THREE.Vector3): [number, number] => {
      if (!inverseSketchMatrix) return [0, 0];
      const local = worldPoint.clone().applyMatrix4(inverseSketchMatrix);
      return [local.x, local.y];
    },
    [inverseSketchMatrix]
  );

  if (!sketchModeActive || !activeSketchPlane) return null;

  return (
    <group
      position={activeSketchPlane.position}
      rotation={activeSketchPlane.rotation}
      scale={activeSketchPlane.scale}
    >
      <mesh
        position={[0, 0, 0.05]}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(
            toLocalPoint(event.point.clone()),
            activeSketchPlane
          );
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
          onPointerMove(toLocalPoint(event.point.clone()));
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          onPointerUp();
        }}
      >
        <planeGeometry args={[1200, 1200]} />
        <meshBasicMaterial transparent opacity={0.001} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ============================================
// GIZMOS
// ============================================

function MoveAxisHandle({
  axis,
  color,
  hoveredAxis,
  activeAxis,
  onHover,
  onPointerDown,
}: {
  axis: Exclude<TransformAxis, null>;
  color: string;
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHover: (axis: TransformAxis) => void;
  onPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  const axisLength = 36;
  const coneOffset = axisLength / 2 + 3;
  const hasFocusAxis = hoveredAxis !== null || activeAxis !== null;
  const isActive = hoveredAxis === axis || activeAxis === axis;
  const opacity = isActive ? 1 : hasFocusAxis ? 0.24 : 0.92;
  const coneScale = isActive ? 1.22 : 1;
  const lineScale = isActive ? 1.08 : 1;

  let linePoints = new Float32Array([
    -axisLength / 2,
    0,
    0,
    axisLength / 2,
    0,
    0,
  ]);
  let conePosition: Vector3Tuple = [coneOffset, 0, 0];
  let coneRotation: Vector3Tuple = [0, 0, -Math.PI / 2];
  let hitPosition: Vector3Tuple = [axisLength / 4 + 2, 0, 0];
  let hitRotation: Vector3Tuple = [0, 0, -Math.PI / 2];

  if (axis === "y") {
    linePoints = new Float32Array([0, -axisLength / 2, 0, 0, axisLength / 2, 0]);
    conePosition = [0, coneOffset, 0];
    coneRotation = [0, 0, 0];
    hitPosition = [0, axisLength / 4 + 2, 0];
    hitRotation = [0, 0, 0];
  }

  if (axis === "z") {
    linePoints = new Float32Array([0, 0, -axisLength / 2, 0, 0, axisLength / 2]);
    conePosition = [0, 0, coneOffset];
    coneRotation = [Math.PI / 2, 0, 0];
    hitPosition = [0, 0, axisLength / 4 + 2];
    hitRotation = [Math.PI / 2, 0, 0];
  }

  return (
    <group>
      <line {...nonSelectableProps}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePoints, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={opacity} />
      </line>

      <mesh
        position={conePosition}
        rotation={coneRotation}
        scale={coneScale}
        {...nonSelectableProps}
      >
        <coneGeometry args={[1.4, 4, 16]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>

      <mesh
        position={hitPosition}
        rotation={hitRotation}
        scale={[lineScale, 1, 1]}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(axis);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          if (activeAxis !== axis) {
            onHover(null);
          }
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(axis, event);
        }}
      >
        <cylinderGeometry args={[4, 4, axisLength / 2 + 10, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function getAxisVisualState(
  axis: Exclude<TransformAxis, null>,
  hoveredAxis: TransformAxis,
  activeAxis: TransformAxis
) {
  const hasFocusAxis = hoveredAxis !== null || activeAxis !== null;
  const isActive = hoveredAxis === axis || activeAxis === axis;

  return {
    opacity: isActive ? 1 : hasFocusAxis ? 0.24 : 0.92,
    emphasisScale: isActive ? 1.18 : 1,
    lineScale: isActive ? 1.08 : 1,
  };
}

function MoveGizmo(props: {
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHoverAxis: (axis: TransformAxis) => void;
  onAxisPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  return (
    <group>
      <MoveAxisHandle axis="x" color="#ff4d4f" {...props} onHover={props.onHoverAxis} onPointerDown={props.onAxisPointerDown} />
      <MoveAxisHandle axis="y" color="#22c55e" {...props} onHover={props.onHoverAxis} onPointerDown={props.onAxisPointerDown} />
      <MoveAxisHandle axis="z" color="#3b82f6" {...props} onHover={props.onHoverAxis} onPointerDown={props.onAxisPointerDown} />
    </group>
  );
}

function RotateAxisHandle({
  axis,
  color,
  hoveredAxis,
  activeAxis,
  onHover,
  onPointerDown,
}: {
  axis: Exclude<TransformAxis, null>;
  color: string;
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHover: (axis: TransformAxis) => void;
  onPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  const { opacity, emphasisScale } = getAxisVisualState(
    axis,
    hoveredAxis,
    activeAxis
  );

  let rotation: Vector3Tuple = [0, 0, 0];
  if (axis === "x") rotation = [0, Math.PI / 2, 0];
  if (axis === "y") rotation = [Math.PI / 2, 0, 0];

  return (
    <group>
      <mesh rotation={rotation} scale={emphasisScale} {...nonSelectableProps}>
        <torusGeometry
          args={[18, axis === hoveredAxis || axis === activeAxis ? 0.55 : 0.35, 18, 72]}
        />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
      <mesh
        rotation={rotation}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(axis);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          if (activeAxis !== axis) onHover(null);
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(axis, event);
        }}
      >
        <torusGeometry args={[18, 2.2, 18, 72]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function RotateGizmo(props: {
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHoverAxis: (axis: TransformAxis) => void;
  onAxisPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  return (
    <group>
      <RotateAxisHandle axis="x" color="#ff4d4f" {...props} onHover={props.onHoverAxis} onPointerDown={props.onAxisPointerDown} />
      <RotateAxisHandle axis="y" color="#22c55e" {...props} onHover={props.onHoverAxis} onPointerDown={props.onAxisPointerDown} />
      <RotateAxisHandle axis="z" color="#3b82f6" {...props} onHover={props.onHoverAxis} onPointerDown={props.onAxisPointerDown} />
    </group>
  );
}

function ScaleAxisHandle({
  axis,
  color,
  hoveredAxis,
  activeAxis,
  onHover,
  onPointerDown,
}: {
  axis: Exclude<TransformAxis, null>;
  color: string;
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHover: (axis: TransformAxis) => void;
  onPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  const axisLength = 30;
  const handleOffset = axisLength / 2 + 2;
  const { opacity, emphasisScale } = getAxisVisualState(
    axis,
    hoveredAxis,
    activeAxis
  );

  let linePoints = new Float32Array([
    -axisLength / 2,
    0,
    0,
    axisLength / 2,
    0,
    0,
  ]);
  let handlePosition: Vector3Tuple = [handleOffset, 0, 0];
  let hitPosition: Vector3Tuple = [axisLength / 4 + 2, 0, 0];
  let hitRotation: Vector3Tuple = [0, 0, -Math.PI / 2];

  if (axis === "y") {
    linePoints = new Float32Array([0, -axisLength / 2, 0, 0, axisLength / 2, 0]);
    handlePosition = [0, handleOffset, 0];
    hitPosition = [0, axisLength / 4 + 2, 0];
    hitRotation = [0, 0, 0];
  }

  if (axis === "z") {
    linePoints = new Float32Array([0, 0, -axisLength / 2, 0, 0, axisLength / 2]);
    handlePosition = [0, 0, handleOffset];
    hitPosition = [0, 0, axisLength / 4 + 2];
    hitRotation = [Math.PI / 2, 0, 0];
  }

  return (
    <group>
      <line {...nonSelectableProps}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePoints, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={opacity} />
      </line>
      <mesh position={handlePosition} scale={emphasisScale} {...nonSelectableProps}>
        <boxGeometry args={[2.4, 2.4, 2.4]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
      <mesh
        position={hitPosition}
        rotation={hitRotation}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(axis);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          if (activeAxis !== axis) onHover(null);
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(axis, event);
        }}
      >
        <cylinderGeometry args={[4, 4, axisLength / 2 + 8, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function ScaleGizmo(props: {
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHoverAxis: (axis: TransformAxis) => void;
  onAxisPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  return (
    <group>
      <ScaleAxisHandle axis="x" color="#ff4d4f" {...props} onHover={props.onHoverAxis} onPointerDown={props.onAxisPointerDown} />
      <ScaleAxisHandle axis="y" color="#22c55e" {...props} onHover={props.onHoverAxis} onPointerDown={props.onAxisPointerDown} />
      <ScaleAxisHandle axis="z" color="#3b82f6" {...props} onHover={props.onHoverAxis} onPointerDown={props.onAxisPointerDown} />
    </group>
  );
}

function TransformGizmo({
  mode,
  target,
  hoveredAxis,
  activeAxis,
  onHoverAxis,
  onAxisPointerDown,
}: {
  mode: TransformMode;
  target: TransformTarget | null;
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHoverAxis: (axis: TransformAxis) => void;
  onAxisPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  if (!mode || !target) return null;

  return (
    <group position={target.position} rotation={target.rotation}>
      {mode === "move" && (
        <MoveGizmo
          hoveredAxis={hoveredAxis}
          activeAxis={activeAxis}
          onHoverAxis={onHoverAxis}
          onAxisPointerDown={onAxisPointerDown}
        />
      )}
      {mode === "rotate" && (
        <RotateGizmo
          hoveredAxis={hoveredAxis}
          activeAxis={activeAxis}
          onHoverAxis={onHoverAxis}
          onAxisPointerDown={onAxisPointerDown}
        />
      )}
      {mode === "scale" && (
        <ScaleGizmo
          hoveredAxis={hoveredAxis}
          activeAxis={activeAxis}
          onHoverAxis={onHoverAxis}
          onAxisPointerDown={onAxisPointerDown}
        />
      )}
    </group>
  );
}

function getSolidBodyTransform(body: SolidBody) {
  return body.transform ?? {
    position: [0, 0, 0] as Vector3Tuple,
    rotation: [0, 0, 0] as Vector3Tuple,
    scale: [1, 1, 1] as Vector3Tuple,
  };
}

function buildSolidBodyMatrix(body: SolidBody) {
  const transform = getSolidBodyTransform(body);
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
    localMatrix.makeTranslation(
      body.center[0],
      body.center[1],
      ((body.direction ?? 1) * body.depth) / 2
    );
  } else if (body.profileType === "rectangle") {
    localMatrix.makeTranslation(
      body.center[0],
      body.center[1],
      ((body.direction ?? 1) * body.depth) / 2
    );
  } else {
    localMatrix.identity();
  }
  return transformMatrix.multiply(planeMatrix.multiply(localMatrix));
}

function getBodyGizmoTarget(body: SolidBody) {
  if (body.profileType === "mesh" && body.meshData) {
    const geometry = meshDataToGeometry(body.meshData);
    geometry.applyMatrix4(buildSolidBodyMatrix(body));
    geometry.computeBoundingBox();
    const center = geometry.boundingBox
      ? geometry.boundingBox.getCenter(new THREE.Vector3())
      : new THREE.Vector3();
    geometry.dispose();
    return [center.x, center.y, center.z] as Vector3Tuple;
  }

  const localCenter = new THREE.Vector3(
    body.center[0],
    body.center[1],
    ((body.direction ?? 1) * body.depth) / 2
  );
  localCenter.applyMatrix4(buildSolidBodyMatrix(body));
  return [localCenter.x, localCenter.y, localCenter.z] as Vector3Tuple;
}

function BodyMoveGizmo({
  target,
  hoveredAxis,
  activeAxis,
  onHoverAxis,
  onAxisPointerDown,
}: {
  target: Vector3Tuple | null;
  hoveredAxis: TransformAxis;
  activeAxis: TransformAxis;
  onHoverAxis: (axis: TransformAxis) => void;
  onAxisPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
}) {
  const { camera } = useThree();
  const gizmoRef = useRef<THREE.Group | null>(null);

  useFrame(() => {
    if (!gizmoRef.current || !target) return;
    const distance = camera.position.distanceTo(
      new THREE.Vector3(target[0], target[1], target[2])
    );
    const scale = Math.max(0.06, distance * 0.085);
    gizmoRef.current.scale.setScalar(scale);
  });

  if (!target) return null;

  return (
    <group ref={gizmoRef} position={target}>
      <MoveGizmo
        hoveredAxis={hoveredAxis}
        activeAxis={activeAxis}
        onHoverAxis={onHoverAxis}
        onAxisPointerDown={onAxisPointerDown}
      />
    </group>
  );
}

// ============================================
// OVERLAY PROJECTION BRIDGE
// ============================================

function DimensionOverlayProjectionBridge({
  dimensions,
  workPlanes,
  controlsRef,
  onOverlayChange,
}: {
  dimensions: DistanceDimension[];
  workPlanes: WorkPlane[];
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  onOverlayChange: (items: DimensionOverlayItem[]) => void;
}) {
  const { camera, size } = useThree();
  const items = useDimensionOverlay({
    dimensions,
    workPlanes,
    camera,
    width: size.width,
    height: size.height,
    controlsRef,
  });

  useEffect(() => {
    onOverlayChange(items);
  }, [items, onOverlayChange]);

  return null;
}

// ============================================
// MAIN SCENE
// ============================================

export const Scene3D = memo(function Scene3D({
  controlsRef,
  desiredPositionRef,
  desiredTargetRef,
  isAnimatingRef,
  cameraStateRef,
  workPlanes,
  planeSketches,
  sketchCircles,
  sketchRectangles,
  sketchCirclePreview,
  sketchRectanglePreview,
  extrudePreview,
  extrudeModeArmed,
  solidBodies,
  booleanModeActive,
  booleanBaseBodyId,
  booleanToolBodyId,
  booleanPreviewMeshData,
  selectedSketchCircleId,
  selectedSketchCurves,
  selectedSolidBodyId,
  selectedSolidFace,
  selectedSolidEdge,
  sketchModeActive,
  activeSketchPlane,
  dimensions,
  primarySelection,
  secondarySelection,
  planeSelectionEnabled,
  onSelectObject,
  onSelectSketchCircle,
  onSelectSketchCurve,
  onSelectSolidBody,
  onSelectSolidFace,
  onHoverSolidFace,
  onSelectSolidEdge,
  onSketchPlanePointerDown,
  onSketchPlanePointerMove,
  onSketchPlanePointerUp,
  onExtrudePreviewDepthChange,
  onConfirmExtrudePreview,
  onCancelExtrudePreview,
  moveModeActive,
  moveDragActive,
  moveHoveredAxis,
  moveGizmoTargetBodyId,
  onMoveHoverAxis,
  onMoveAxisPointerDown,
  onDimensionOverlayChange,
  transformMode,
  transformTarget,
  hoveredTransformAxis,
  transformDragState,
  onHoverTransformAxis,
  onTransformAxisPointerDown,
  exportRootRef,
  designHealthStatusByBody,
  filletModeActive,
  filletPreviewBodyId,
  filletPreviewMeshData,
  holeModeActive,
  holePreview,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  desiredPositionRef: React.RefObject<THREE.Vector3>;
  desiredTargetRef: React.RefObject<THREE.Vector3>;
  isAnimatingRef: React.RefObject<boolean>;
  cameraStateRef: React.RefObject<CameraState>;
  workPlanes: WorkPlane[];
  planeSketches: PlaneSketch[];
  sketchCircles: SketchCircle[];
  sketchRectangles: SketchRectangle[];
  sketchCirclePreview: {
    planeId: string;
    planePosition: Vector3Tuple;
    planeRotation: Vector3Tuple;
    planeScale: Vector3Tuple;
    center: [number, number];
    radius: number;
    dragging: boolean;
  } | null;
  sketchRectanglePreview: {
    planeId: string;
    planePosition: Vector3Tuple;
    planeRotation: Vector3Tuple;
    planeScale: Vector3Tuple;
    center: [number, number];
    width: number;
    height: number;
    dragging: boolean;
  } | null;
  extrudePreview: {
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
  } | null;
  extrudeModeArmed: boolean;
  solidBodies: SolidBody[];
  booleanModeActive: boolean;
  booleanBaseBodyId: string | null;
  booleanToolBodyId: string | null;
  booleanPreviewMeshData: SolidBody["meshData"] | null;
  selectedSketchCircleId: string | null;
  selectedSketchCurves: Array<{
    profileId: string;
    curveKind: "circle" | "rectangle-edge";
    edgeId?: "top" | "right" | "bottom" | "left";
  }>;
  selectedSolidBodyId: string | null;
  selectedSolidFace: { bodyId: string; faceId: BodyFaceId } | null;
  selectedSolidEdge: { bodyId: string; edgeId: FilletEdgeId } | null;
  sketchModeActive: boolean;
  activeSketchPlane: {
    id: string;
    position: Vector3Tuple;
    rotation: Vector3Tuple;
    scale: Vector3Tuple;
    sourceKind?: "workplane" | "face";
  } | null;
  dimensions: DistanceDimension[];
  primarySelection: SceneSelection;
  secondarySelection: SceneSelection;
  planeSelectionEnabled: boolean;
  onSelectObject: (selection: SceneSelection, additive: boolean) => void;
  onSelectSketchCircle: (id: string | null) => void;
  onSelectSketchCurve: (
    selection:
      | {
          profileId: string;
          profileType: "circle";
          curveKind: "circle";
        }
      | {
          profileId: string;
          profileType: "rectangle";
          curveKind: "rectangle-edge";
          edgeId: "top" | "right" | "bottom" | "left";
        },
    additive: boolean
  ) => void;
  onSelectSolidBody: (id: string | null) => void;
  onSelectSolidFace: (
    bodyId: string,
    faceId: BodyFaceId,
    hit?: { point: Vector3Tuple; normal: Vector3Tuple }
  ) => void;
  onHoverSolidFace: (
    bodyId: string,
    faceId: BodyFaceId,
    hit?: { point: Vector3Tuple; normal: Vector3Tuple }
  ) => void;
  onSelectSolidEdge: (bodyId: string, edgeId: FilletEdgeId) => void;
  onSketchPlanePointerDown: (
    localPoint: [number, number],
    planeState: {
      id: string;
      position: Vector3Tuple;
      rotation: Vector3Tuple;
      scale: Vector3Tuple;
    }
  ) => void;
  onSketchPlanePointerMove: (localPoint: [number, number]) => void;
  onSketchPlanePointerUp: () => void;
  onExtrudePreviewDepthChange: (signedDepth: number) => void;
  onConfirmExtrudePreview: () => void;
  onCancelExtrudePreview: () => void;
  moveModeActive: boolean;
  moveDragActive: boolean;
  moveHoveredAxis: TransformAxis;
  moveGizmoTargetBodyId: string | null;
  onMoveHoverAxis: (axis: TransformAxis) => void;
  onMoveAxisPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
  onDimensionOverlayChange: (items: DimensionOverlayItem[]) => void;
  transformMode: TransformMode;
  transformTarget: TransformTarget | null;
  hoveredTransformAxis: TransformAxis;
  transformDragState: TransformDragState;
  onHoverTransformAxis: (axis: TransformAxis) => void;
  onTransformAxisPointerDown: (
    axis: Exclude<TransformAxis, null>,
    event: ThreeEvent<PointerEvent>
  ) => void;
  exportRootRef: React.RefObject<THREE.Group | null>;
  designHealthStatusByBody: Record<string, "idle" | "ok" | "warning" | "error">;
  filletModeActive: boolean;
  filletPreviewBodyId: string | null;
  filletPreviewMeshData: SolidBody["meshData"] | null;
  holeModeActive: boolean;
  holePreview: {
    center: Vector3Tuple;
    normal: Vector3Tuple;
    diameter: number;
    depth: number;
  } | null;
}) {
  const moveGizmoTarget = useMemo(() => {
    if (!moveModeActive || !moveGizmoTargetBodyId) return null;
    const body = solidBodies.find((item) => item.id === moveGizmoTargetBodyId);
    if (!body) return null;
    return getBodyGizmoTarget(body);
  }, [moveGizmoTargetBodyId, moveModeActive, solidBodies]);

  return (
    <Canvas
      camera={{ position: [5, -5, 5], fov: 50, near: 0.1, far: 1000 }}
      style={{ background: "#f5f6f8" }}
      onPointerMissed={(event) => {
        if (extrudePreview !== null) return;
        onSelectSketchCircle(null);
        onSelectSolidBody(null);
        onSelectObject(null, !!event.shiftKey);
      }}
    >
      <CameraSetup />
      <CameraAnimator
        controlsRef={controlsRef}
        desiredPositionRef={desiredPositionRef}
        desiredTargetRef={desiredTargetRef}
        isAnimatingRef={isAnimatingRef}
      />
      <CameraObserver controlsRef={controlsRef} cameraStateRef={cameraStateRef} />
      <DimensionOverlayProjectionBridge
        dimensions={dimensions}
        workPlanes={workPlanes}
        controlsRef={controlsRef}
        onOverlayChange={onDimensionOverlayChange}
      />
      <ambientLight intensity={1} />
      <WorkPlanes
        workPlanes={workPlanes}
        primarySelection={primarySelection}
        secondarySelection={secondarySelection}
        activePlaneId={activeSketchPlane?.id ?? null}
        selectionEnabled={planeSelectionEnabled}
        onSelect={onSelectObject}
      />
      <PlaneSketches workPlanes={workPlanes} planeSketches={planeSketches} />
      <ActiveSketchPlaneOverlay plane={activeSketchPlane} />
      <SketchPlaneInteraction
        sketchModeActive={sketchModeActive}
        activeSketchPlane={activeSketchPlane}
        onPointerDown={onSketchPlanePointerDown}
        onPointerMove={onSketchPlanePointerMove}
        onPointerUp={onSketchPlanePointerUp}
      />
      <SketchCircles
        circles={sketchCircles}
        selectedSketchCircleId={selectedSketchCircleId}
        selectedCurveSelections={selectedSketchCurves}
        extrudeModeArmed={extrudeModeArmed}
        onSelectSketchCircle={onSelectSketchCircle}
        onSelectSketchCurve={onSelectSketchCurve}
      />
      <SketchRectangles
        rectangles={sketchRectangles}
        selectedSketchCircleId={selectedSketchCircleId}
        selectedCurveSelections={selectedSketchCurves}
        extrudeModeArmed={extrudeModeArmed}
        onSelectSketchCircle={onSelectSketchCircle}
        onSelectSketchCurve={onSelectSketchCurve}
      />
      <SketchCirclePreview preview={sketchCirclePreview} />
      <SketchRectanglePreview preview={sketchRectanglePreview} />
      <ExtrudePreviewBody preview={extrudePreview} />
      {holePreview ? (
        <group {...nonSelectableProps}>
          <mesh
            position={[
              holePreview.center[0] - holePreview.normal[0] * (holePreview.depth / 2),
              holePreview.center[1] - holePreview.normal[1] * (holePreview.depth / 2),
              holePreview.center[2] - holePreview.normal[2] * (holePreview.depth / 2),
            ]}
            quaternion={new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              new THREE.Vector3(
                -holePreview.normal[0],
                -holePreview.normal[1],
                -holePreview.normal[2]
              ).normalize()
            )}
            {...nonSelectableProps}
          >
            <cylinderGeometry
              args={[
                Math.max(0.1, holePreview.diameter / 2),
                Math.max(0.1, holePreview.diameter / 2),
                Math.max(0.1, holePreview.depth),
                48,
              ]}
            />
            <meshStandardMaterial color="#5f93b9" transparent opacity={0.32} metalness={0.1} roughness={0.42} />
          </mesh>
          <line {...nonSelectableProps}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[
                  new Float32Array([
                    holePreview.center[0],
                    holePreview.center[1],
                    holePreview.center[2],
                    holePreview.center[0] - holePreview.normal[0] * holePreview.depth,
                    holePreview.center[1] - holePreview.normal[1] * holePreview.depth,
                    holePreview.center[2] - holePreview.normal[2] * holePreview.depth,
                  ]),
                  3,
                ]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#2f5c7f" transparent opacity={0.72} />
          </line>
          <mesh
            position={holePreview.center}
            {...nonSelectableProps}
          >
            <sphereGeometry args={[Math.max(0.2, holePreview.diameter * 0.04), 14, 14]} />
            <meshBasicMaterial color="#2f5c7f" />
          </mesh>
          <mesh
            position={[
              holePreview.center[0] + holePreview.normal[0] * 0.04,
              holePreview.center[1] + holePreview.normal[1] * 0.04,
              holePreview.center[2] + holePreview.normal[2] * 0.04,
            ]}
            quaternion={new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 0, 1),
              new THREE.Vector3(
                holePreview.normal[0],
                holePreview.normal[1],
                holePreview.normal[2]
              ).normalize()
            )}
            {...nonSelectableProps}
          >
            <ringGeometry
              args={[
                Math.max(0.1, holePreview.diameter / 2) * 0.94,
                Math.max(0.1, holePreview.diameter / 2),
                64,
              ]}
            />
            <meshBasicMaterial color="#1f4766" transparent opacity={0.85} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ) : null}
      {booleanModeActive && booleanPreviewMeshData ? (
        <BooleanPreviewMesh meshData={booleanPreviewMeshData} />
      ) : null}
      <ExtrudeArrowManipulator
        preview={extrudePreview}
        onDepthChange={onExtrudePreviewDepthChange}
        onConfirm={onConfirmExtrudePreview}
        onCancel={onCancelExtrudePreview}
      />
      <group ref={exportRootRef}>
        <SolidBodies
          solidBodies={solidBodies}
          booleanModeActive={booleanModeActive}
          booleanBaseBodyId={booleanBaseBodyId}
          booleanToolBodyId={booleanToolBodyId}
          selectedSolidBodyId={selectedSolidBodyId}
          selectedSolidFace={selectedSolidFace}
          selectedSolidEdge={selectedSolidEdge}
          onSelectSolidBody={onSelectSolidBody}
          onSelectSolidFace={onSelectSolidFace}
          onHoverSolidFace={onHoverSolidFace}
          onSelectSolidEdge={onSelectSolidEdge}
          designHealthStatusByBody={designHealthStatusByBody}
          filletModeActive={filletModeActive}
          holeModeActive={holeModeActive}
          filletPreviewBodyId={filletPreviewBodyId}
          filletPreviewMeshData={filletPreviewMeshData}
        />
      </group>
      <TransformGizmo
        mode={transformMode}
        target={transformTarget}
        hoveredAxis={hoveredTransformAxis}
        activeAxis={transformDragState?.axis ?? null}
        onHoverAxis={onHoverTransformAxis}
        onAxisPointerDown={onTransformAxisPointerDown}
      />
      {moveModeActive ? (
        <BodyMoveGizmo
          target={moveGizmoTarget}
          hoveredAxis={moveHoveredAxis}
          activeAxis={moveDragActive ? moveHoveredAxis : null}
          onHoverAxis={onMoveHoverAxis}
          onAxisPointerDown={onMoveAxisPointerDown}
        />
      ) : null}
      <BaseGrid />
      <Axes />
      <OriginMarker />
      <OrbitControls
        ref={controlsRef}
        target={[0, 0, 0]}
        enabled={!transformDragState && extrudePreview === null && !moveDragActive}
      />
    </Canvas>
  );
});

// ============================================
// VIEW CUBE
// ============================================

function FaceLabel({
  text,
  normal,
  up,
  fontSize,
  color,
}: {
  text: string;
  normal: [number, number, number];
  up: [number, number, number];
  fontSize: number;
  color: string;
}) {
  const { position, quaternion } = useMemo(() => {
    const normalVector = new THREE.Vector3(...normal).normalize();
    const upVector = new THREE.Vector3(...up).normalize();
    const rightVector = new THREE.Vector3()
      .crossVectors(upVector, normalVector)
      .normalize();
    const correctedUp = new THREE.Vector3()
      .crossVectors(normalVector, rightVector)
      .normalize();
    const matrix = new THREE.Matrix4().makeBasis(
      rightVector,
      correctedUp,
      normalVector
    );

    return {
      position: normalVector.clone().multiplyScalar(0.67),
      quaternion: new THREE.Quaternion().setFromRotationMatrix(matrix),
    };
  }, [color, fontSize, normal, text, up]);

  return (
    <Text
      position={position}
      quaternion={quaternion}
      fontSize={fontSize}
      color={color}
      anchorX="center"
      anchorY="middle"
    >
      {text}
    </Text>
  );
}

function OrientationCubeScene({
  cameraStateRef,
  onViewSelect,
}: {
  cameraStateRef: React.RefObject<CameraState>;
  onViewSelect: (action: ViewAction) => void;
}) {
  const { camera } = useThree();

  const handleCubeClick = (event: ThreeEvent<PointerEvent>) => {
    if (event.faceIndex == null) return;

    const face = Math.floor(event.faceIndex / 2);

    if (face === 0) onViewSelect("right");
    if (face === 1) onViewSelect("left");
    if (face === 2) onViewSelect("back");
    if (face === 3) onViewSelect("front");
    if (face === 4) onViewSelect("top");
    if (face === 5) onViewSelect("bottom");
  };

  useFrame(() => {
    const offset = cameraStateRef.current.offset;
    if (offset.lengthSq() === 0) return;

    const direction = offset.clone().normalize().multiplyScalar(4.5);
    camera.position.copy(direction);
    camera.up.copy(cameraStateRef.current.up).normalize();
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  });

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 6]} intensity={0.9} />
      <group>
        <mesh onClick={handleCubeClick}>
          <boxGeometry args={[1.2, 1.2, 1.2]} />
          <meshStandardMaterial color="#303036" metalness={0.08} roughness={0.82} />
        </mesh>
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(1.2, 1.2, 1.2)]} />
          <lineBasicMaterial color="#8f8f95" />
        </lineSegments>
        <FaceLabel text="FRONT" normal={[0, -1, 0]} up={[0, 0, 1]} fontSize={0.16} color="#f4f4f5" />
        <FaceLabel text="BACK" normal={[0, 1, 0]} up={[0, 0, 1]} fontSize={0.16} color="#dadade" />
        <FaceLabel text="RIGHT" normal={[1, 0, 0]} up={[0, 0, 1]} fontSize={0.14} color="#dadade" />
        <FaceLabel text="LEFT" normal={[-1, 0, 0]} up={[0, 0, 1]} fontSize={0.14} color="#dadade" />
        <FaceLabel text="TOP" normal={[0, 0, 1]} up={[0, 1, 0]} fontSize={0.16} color="#f4f4f5" />
        <FaceLabel text="BTM" normal={[0, 0, -1]} up={[0, -1, 0]} fontSize={0.13} color="#c8c8cc" />
        <group position={[-0.95, -0.95, -0.95]}>
          <line>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[new Float32Array([0, 0, 0, 0.72, 0, 0]), 3]} />
            </bufferGeometry>
            <lineBasicMaterial color="#ef4444" />
          </line>
          <line>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[new Float32Array([0, 0, 0, 0, 0.72, 0]), 3]} />
            </bufferGeometry>
            <lineBasicMaterial color="#22c55e" />
          </line>
          <line>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[new Float32Array([0, 0, 0, 0, 0, 0.72]), 3]} />
            </bufferGeometry>
            <lineBasicMaterial color="#3b82f6" />
          </line>
          <Text position={[0.83, 0, 0]} fontSize={0.16} color="#ef4444" anchorX="center" anchorY="middle">X</Text>
          <Text position={[0, 0.83, 0]} fontSize={0.16} color="#22c55e" anchorX="center" anchorY="middle">Y</Text>
          <Text position={[0, 0, 0.83]} fontSize={0.16} color="#3b82f6" anchorX="center" anchorY="middle">Z</Text>
        </group>
      </group>
    </>
  );
}

export const ViewCubeOverlay = memo(function ViewCubeOverlay({
  cameraStateRef,
  onViewSelect,
}: {
  cameraStateRef: React.RefObject<CameraState>;
  onViewSelect: (action: ViewAction) => void;
}) {
  return (
    <div className="view-cube-overlay">
      <div className="view-cube-overlay__cube">
        <Canvas
          camera={{ position: [0, 0, 4.5], fov: 32, near: 0.1, far: 20 }}
          gl={{ alpha: true, antialias: true }}
        >
          <OrientationCubeScene
            cameraStateRef={cameraStateRef}
            onViewSelect={onViewSelect}
          />
        </Canvas>
      </div>
    </div>
  );
});
