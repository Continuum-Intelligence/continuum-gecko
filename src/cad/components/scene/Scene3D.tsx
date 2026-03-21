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
  DimensionOverlayItem,
  DistanceDimension,
  SketchCircle,
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
  const extent = 250;
  const minorStep = 1;
  const majorStep = 10;
  const { minorPositions, majorPositions } = useMemo(() => {
    const minor: number[] = [];
    const major: number[] = [];

    for (let i = -extent; i <= extent; i += minorStep) {
      if (i % majorStep === 0) {
        major.push(i);
      } else {
        minor.push(i);
      }
    }

    return {
      minorPositions: minor,
      majorPositions: major,
    };
  }, []);

  return (
    <group>
      {minorPositions.map((i) => (
        <group key={`minor-${i}`}>
          <line {...nonSelectableProps}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([-extent, i, 0, extent, i, 0]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#e4e7eb" />
          </line>

          <line {...nonSelectableProps}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([i, -extent, 0, i, extent, 0]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#e4e7eb" />
          </line>
        </group>
      ))}

      {majorPositions.map((i) => (
        <group key={`major-${i}`}>
          <line {...nonSelectableProps}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([-extent, i, 0, extent, i, 0]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#9aa3af" />
          </line>

          <line {...nonSelectableProps}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([i, -extent, 0, i, extent, 0]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#9aa3af" />
          </line>
        </group>
      ))}
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
        <lineBasicMaterial color="#ff4d4f" />
      </line>

      <line {...nonSelectableProps}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, -extent, 0, 0, extent, 0]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#22c55e" />
      </line>

      <line {...nonSelectableProps}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, 0, -extent, 0, 0, extent]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#3b82f6" />
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

// ============================================
// SCENE OBJECTS
// ============================================

const WorkPlaneMesh = memo(function WorkPlaneMesh({
  plane,
  primarySelection,
  secondarySelection,
  onSelect,
}: {
  plane: WorkPlane;
  primarySelection: SceneSelection;
  secondarySelection: SceneSelection;
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
        onClick={(event) => {
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
        onClick={(event) => {
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
        renderOrder={1}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(
            createSelection("plane", plane.id, "face", WORK_PLANE_FACE_ID),
            event.shiftKey
          );
        }}
      >
        <primitive object={planeGeometry} attach="geometry" />
        <meshBasicMaterial
          color={highlight.faceRole ? getFaceColor(highlight.faceRole) : "#7dd3fc"}
          transparent
          opacity={highlight.faceRole ? 0.44 : 0.16}
          side={THREE.DoubleSide}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>

      <lineSegments position={[0, 0, 0.02]} renderOrder={2}>
        <primitive object={outlineGeometry} attach="geometry" />
        <lineBasicMaterial
          color={highlight.faceRole ? getRoleColor(highlight.faceRole) : "#7c8b9e"}
          transparent
          opacity={highlight.faceRole ? 1 : 0.68}
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
  onSelect,
}: {
  workPlanes: WorkPlane[];
  primarySelection: SceneSelection;
  secondarySelection: SceneSelection;
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

const SketchCircles = memo(function SketchCircles({
  circles,
  selectedSketchCircleId,
  onSelectSketchCircle,
}: {
  circles: SketchCircle[];
  selectedSketchCircleId: string | null;
  onSelectSketchCircle: (id: string | null) => void;
}) {
  return (
    <>
      {circles.map((circle) => (
        <group
          key={circle.id}
          position={circle.planePosition}
          rotation={circle.planeRotation}
          scale={circle.planeScale}
        >
          <group position={[circle.center[0], circle.center[1], 0]}>
            <CircleCurve
              radius={circle.radius}
              color={selectedSketchCircleId === circle.id ? "#0f172a" : "#1f2937"}
              opacity={selectedSketchCircleId === circle.id ? 1 : 0.92}
              zOffset={0.085}
            />
            <mesh position={[0, 0, 0.07]} {...nonSelectableProps}>
              <sphereGeometry args={[0.42, 20, 20]} />
              <meshBasicMaterial
                color={selectedSketchCircleId === circle.id ? "#0f172a" : "#334155"}
                transparent
                opacity={0.9}
                depthWrite={false}
              />
            </mesh>
            <mesh {...nonSelectableProps}>
              <ringGeometry
                args={[
                  Math.max(0.1, circle.radius - 0.18),
                  circle.radius + 0.18,
                  96,
                ]}
              />
              <meshBasicMaterial
                transparent
                opacity={selectedSketchCircleId === circle.id ? 0.6 : 0.34}
                color={selectedSketchCircleId === circle.id ? "#111827" : "#334155"}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                onSelectSketchCircle(circle.id);
              }}
            >
              <circleGeometry args={[Math.max(0.2, circle.radius), 96]} />
              <meshBasicMaterial
                transparent
                opacity={selectedSketchCircleId === circle.id ? 0.1 : 0.04}
                color={selectedSketchCircleId === circle.id ? "#0f172a" : "#334155"}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                onSelectSketchCircle(circle.id);
              }}
            >
              <ringGeometry
                args={[
                  Math.max(0.1, circle.radius - 1.2),
                  circle.radius + 1.2,
                  72,
                ]}
              />
              <meshBasicMaterial
                transparent
                opacity={selectedSketchCircleId === circle.id ? 0.16 : 0.06}
                color={selectedSketchCircleId === circle.id ? "#e2e8f0" : "#cbd5e1"}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          </group>
        </group>
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

const ExtrudePreviewBody = memo(function ExtrudePreviewBody({
  preview,
}: {
  preview: {
    planePosition: Vector3Tuple;
    planeRotation: Vector3Tuple;
    planeScale: Vector3Tuple;
    center: [number, number];
    radius: number;
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
      <mesh
        position={[preview.center[0], preview.center[1], (preview.direction * preview.depth) / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        {...nonSelectableProps}
      >
        <cylinderGeometry args={[preview.radius, preview.radius, preview.depth, 72]} />
        <meshStandardMaterial
          color="#97a9be"
          transparent
          opacity={0.5}
          metalness={0.1}
          roughness={0.36}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
});

const SolidBodyMesh = memo(function SolidBodyMesh({
  body,
  selected,
  onSelectSolidBody,
}: {
  body: SolidBody;
  selected: boolean;
  onSelectSolidBody: (id: string | null) => void;
}) {
  const geometry = useMemo(
    () => new THREE.CylinderGeometry(body.radius, body.radius, body.depth, 64),
    [body.depth, body.radius]
  );
  const edgeGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  useEffect(
    () => () => {
      edgeGeometry.dispose();
      geometry.dispose();
    },
    [edgeGeometry, geometry]
  );

  return (
    <group
      position={body.planePosition}
      rotation={body.planeRotation}
      scale={body.planeScale}
    >
      <mesh
        position={[
          body.center[0],
          body.center[1],
          ((body.direction ?? 1) * body.depth) / 2,
        ]}
        rotation={[Math.PI / 2, 0, 0]}
        userData={{ [EXPORTABLE_GEOMETRY_FLAG]: true }}
        onClick={(event) => {
          event.stopPropagation();
          onSelectSolidBody(body.id);
        }}
      >
        <primitive attach="geometry" object={geometry} />
        <meshStandardMaterial
          color={selected ? "#dbe4f0" : "#b8c3d2"}
          metalness={0.12}
          roughness={0.28}
        />
      </mesh>
      <lineSegments
        position={[
          body.center[0],
          body.center[1],
          ((body.direction ?? 1) * body.depth) / 2,
        ]}
        rotation={[Math.PI / 2, 0, 0]}
        geometry={edgeGeometry}
        {...nonSelectableProps}
      >
        <lineBasicMaterial
          color={selected ? "#0f172a" : "#334155"}
          transparent
          opacity={0.52}
        />
      </lineSegments>
    </group>
  );
});

const SolidBodies = memo(function SolidBodies({
  solidBodies,
  selectedSolidBodyId,
  onSelectSolidBody,
}: {
  solidBodies: SolidBody[];
  selectedSolidBodyId: string | null;
  onSelectSolidBody: (id: string | null) => void;
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
            onSelectSolidBody={onSelectSolidBody}
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
    planePosition: Vector3Tuple;
    planeRotation: Vector3Tuple;
    planeScale: Vector3Tuple;
    center: [number, number];
    depth: number;
    direction: 1 | -1;
    radius: number;
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
  sketchCirclePreview,
  extrudePreview,
  solidBodies,
  selectedSketchCircleId,
  selectedSolidBodyId,
  sketchModeActive,
  activeSketchPlane,
  dimensions,
  primarySelection,
  secondarySelection,
  onSelectObject,
  onSelectSketchCircle,
  onSelectSolidBody,
  onSketchPlanePointerDown,
  onSketchPlanePointerMove,
  onSketchPlanePointerUp,
  onExtrudePreviewDepthChange,
  onConfirmExtrudePreview,
  onCancelExtrudePreview,
  onDimensionOverlayChange,
  transformMode,
  transformTarget,
  hoveredTransformAxis,
  transformDragState,
  onHoverTransformAxis,
  onTransformAxisPointerDown,
  exportRootRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  desiredPositionRef: React.RefObject<THREE.Vector3>;
  desiredTargetRef: React.RefObject<THREE.Vector3>;
  isAnimatingRef: React.RefObject<boolean>;
  cameraStateRef: React.RefObject<CameraState>;
  workPlanes: WorkPlane[];
  planeSketches: PlaneSketch[];
  sketchCircles: SketchCircle[];
  sketchCirclePreview: {
    planeId: string;
    planePosition: Vector3Tuple;
    planeRotation: Vector3Tuple;
    planeScale: Vector3Tuple;
    center: [number, number];
    radius: number;
    dragging: boolean;
  } | null;
  extrudePreview: {
    sourceSketchId: string;
    planePosition: Vector3Tuple;
    planeRotation: Vector3Tuple;
    planeScale: Vector3Tuple;
    center: [number, number];
    radius: number;
    depth: number;
    direction: 1 | -1;
  } | null;
  solidBodies: SolidBody[];
  selectedSketchCircleId: string | null;
  selectedSolidBodyId: string | null;
  sketchModeActive: boolean;
  activeSketchPlane: {
    id: string;
    position: Vector3Tuple;
    rotation: Vector3Tuple;
    scale: Vector3Tuple;
  } | null;
  dimensions: DistanceDimension[];
  primarySelection: SceneSelection;
  secondarySelection: SceneSelection;
  onSelectObject: (selection: SceneSelection, additive: boolean) => void;
  onSelectSketchCircle: (id: string | null) => void;
  onSelectSolidBody: (id: string | null) => void;
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
}) {
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
        onSelect={onSelectObject}
      />
      <PlaneSketches workPlanes={workPlanes} planeSketches={planeSketches} />
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
        onSelectSketchCircle={onSelectSketchCircle}
      />
      <SketchCirclePreview preview={sketchCirclePreview} />
      <ExtrudePreviewBody preview={extrudePreview} />
      <ExtrudeArrowManipulator
        preview={extrudePreview}
        onDepthChange={onExtrudePreviewDepthChange}
        onConfirm={onConfirmExtrudePreview}
        onCancel={onCancelExtrudePreview}
      />
      <group ref={exportRootRef}>
        <SolidBodies
          solidBodies={solidBodies}
          selectedSolidBodyId={selectedSolidBodyId}
          onSelectSolidBody={onSelectSolidBody}
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
      <BaseGrid />
      <Axes />
      <OriginMarker />
      <OrbitControls
        ref={controlsRef}
        target={[0, 0, 0]}
        enabled={!transformDragState && extrudePreview === null}
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
