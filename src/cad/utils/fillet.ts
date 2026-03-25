import * as THREE from "three";
import type { FilletEdgeId, MeshGeometryData, SolidBody } from "../types";
import { booleanOperation, cleanMeshGeometry, geometryToMeshData } from "./booleanCSG";

export type BodyEdgeDescriptor = {
  id: FilletEdgeId;
  axis: "x" | "y" | "z";
  start: [number, number, number];
  end: [number, number, number];
  maxRadius: number;
};

export type FilletBuildResult = {
  meshData: MeshGeometryData;
  appliedRadius: number;
  maxRadius: number;
};

export type FilletFeatureInput = {
  edgeId: FilletEdgeId;
  radius: number;
};

const FILLET_EPSILON = 1e-3;

function edgeRadiusLimit(body: SolidBody, edgeId: FilletEdgeId) {
  const width = Math.max(0.1, body.width ?? 0.1);
  const height = Math.max(0.1, body.height ?? 0.1);
  const depth = Math.max(0.1, Math.abs(body.depth));

  if (
    edgeId === "top-front" ||
    edgeId === "top-back" ||
    edgeId === "bottom-front" ||
    edgeId === "bottom-back"
  ) {
    return Math.min(height, depth) * 0.5;
  }

  if (
    edgeId === "top-left" ||
    edgeId === "top-right" ||
    edgeId === "bottom-left" ||
    edgeId === "bottom-right"
  ) {
    return Math.min(width, depth) * 0.5;
  }

  return Math.min(width, height) * 0.5;
}

export function isFilletCapableBody(body: SolidBody) {
  return Number.isFinite(body.width) && Number.isFinite(body.height) && Number.isFinite(body.depth);
}

export function getRectBodyEdges(body: SolidBody): BodyEdgeDescriptor[] {
  if (!isFilletCapableBody(body)) return [];

  const width = Math.max(0.1, body.width ?? 0.1);
  const height = Math.max(0.1, body.height ?? 0.1);
  const depth = Math.max(0.1, Math.abs(body.depth));

  const xMin = body.center[0] - width / 2;
  const xMax = body.center[0] + width / 2;
  const yMin = body.center[1] - height / 2;
  const yMax = body.center[1] + height / 2;
  const zRaw = body.direction * depth;
  const zMin = Math.min(0, zRaw);
  const zMax = Math.max(0, zRaw);

  const maxRadiusFor = (id: FilletEdgeId) => Math.max(FILLET_EPSILON, edgeRadiusLimit(body, id) - FILLET_EPSILON);

  return [
    {
      id: "top-front",
      axis: "x",
      start: [xMin, yMax, zMax],
      end: [xMax, yMax, zMax],
      maxRadius: maxRadiusFor("top-front"),
    },
    {
      id: "top-back",
      axis: "x",
      start: [xMin, yMin, zMax],
      end: [xMax, yMin, zMax],
      maxRadius: maxRadiusFor("top-back"),
    },
    {
      id: "bottom-front",
      axis: "x",
      start: [xMin, yMax, zMin],
      end: [xMax, yMax, zMin],
      maxRadius: maxRadiusFor("bottom-front"),
    },
    {
      id: "bottom-back",
      axis: "x",
      start: [xMin, yMin, zMin],
      end: [xMax, yMin, zMin],
      maxRadius: maxRadiusFor("bottom-back"),
    },
    {
      id: "top-left",
      axis: "y",
      start: [xMin, yMin, zMax],
      end: [xMin, yMax, zMax],
      maxRadius: maxRadiusFor("top-left"),
    },
    {
      id: "top-right",
      axis: "y",
      start: [xMax, yMin, zMax],
      end: [xMax, yMax, zMax],
      maxRadius: maxRadiusFor("top-right"),
    },
    {
      id: "bottom-left",
      axis: "y",
      start: [xMin, yMin, zMin],
      end: [xMin, yMax, zMin],
      maxRadius: maxRadiusFor("bottom-left"),
    },
    {
      id: "bottom-right",
      axis: "y",
      start: [xMax, yMin, zMin],
      end: [xMax, yMax, zMin],
      maxRadius: maxRadiusFor("bottom-right"),
    },
    {
      id: "vertical-front-left",
      axis: "z",
      start: [xMin, yMax, zMin],
      end: [xMin, yMax, zMax],
      maxRadius: maxRadiusFor("vertical-front-left"),
    },
    {
      id: "vertical-front-right",
      axis: "z",
      start: [xMax, yMax, zMin],
      end: [xMax, yMax, zMax],
      maxRadius: maxRadiusFor("vertical-front-right"),
    },
    {
      id: "vertical-back-left",
      axis: "z",
      start: [xMin, yMin, zMin],
      end: [xMin, yMin, zMax],
      maxRadius: maxRadiusFor("vertical-back-left"),
    },
    {
      id: "vertical-back-right",
      axis: "z",
      start: [xMax, yMin, zMin],
      end: [xMax, yMin, zMax],
      maxRadius: maxRadiusFor("vertical-back-right"),
    },
  ];
}

export function getEdgeDescriptor(body: SolidBody, edgeId: FilletEdgeId) {
  return getRectBodyEdges(body).find((edge) => edge.id === edgeId) ?? null;
}

export function clampFilletRadius(body: SolidBody, edgeId: FilletEdgeId, radius: number) {
  const edge = getEdgeDescriptor(body, edgeId);
  if (!edge) return FILLET_EPSILON;
  return THREE.MathUtils.clamp(radius, FILLET_EPSILON, edge.maxRadius);
}

function createRectBodyGeometry(body: SolidBody) {
  const width = Math.max(0.1, body.width ?? 0.1);
  const height = Math.max(0.1, body.height ?? 0.1);
  const depth = Math.max(0.1, Math.abs(body.depth));
  const zCenter = (body.direction * depth) / 2;
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(body.center[0], body.center[1], zCenter);
  return geometry;
}

function applySingleRectEdgeFillet(
  targetGeometry: THREE.BufferGeometry,
  body: SolidBody,
  edgeId: FilletEdgeId,
  radius: number
) {
  const edge = getEdgeDescriptor(body, edgeId);
  if (!edge) return null;

  const appliedRadius = clampFilletRadius(body, edgeId, radius);
  if (!Number.isFinite(appliedRadius) || appliedRadius <= FILLET_EPSILON) return null;

  const start = new THREE.Vector3(...edge.start);
  const end = new THREE.Vector3(...edge.end);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const edgeLength = start.distanceTo(end) + 0.02;

  const width = Math.max(0.1, body.width ?? 0.1);
  const height = Math.max(0.1, body.height ?? 0.1);
  const depth = Math.max(0.1, Math.abs(body.depth));
  const xMax = body.center[0] + width / 2;
  const xMin = body.center[0] - width / 2;
  const yMax = body.center[1] + height / 2;
  const yMin = body.center[1] - height / 2;
  const zMax = Math.max(0, body.direction * depth);
  const zMin = Math.min(0, body.direction * depth);

  const inwardX =
    Math.abs(start.x - xMax) < FILLET_EPSILON
      ? -1
      : Math.abs(start.x - xMin) < FILLET_EPSILON
        ? 1
        : 0;
  const inwardY =
    Math.abs(start.y - yMax) < FILLET_EPSILON
      ? -1
      : Math.abs(start.y - yMin) < FILLET_EPSILON
        ? 1
        : 0;
  const inwardZ =
    Math.abs(start.z - zMax) < FILLET_EPSILON
      ? -1
      : Math.abs(start.z - zMin) < FILLET_EPSILON
        ? 1
        : 0;

  const blockSize =
    edge.axis === "x"
      ? [edgeLength, appliedRadius, appliedRadius]
      : edge.axis === "y"
        ? [appliedRadius, edgeLength, appliedRadius]
        : [appliedRadius, appliedRadius, edgeLength];

  const blockCenter = midpoint.clone();
  if (edge.axis !== "x") blockCenter.x += inwardX * (appliedRadius / 2);
  if (edge.axis !== "y") blockCenter.y += inwardY * (appliedRadius / 2);
  if (edge.axis !== "z") blockCenter.z += inwardZ * (appliedRadius / 2);

  const cylinderCenter = midpoint.clone();
  if (edge.axis !== "x") cylinderCenter.x += inwardX * appliedRadius;
  if (edge.axis !== "y") cylinderCenter.y += inwardY * appliedRadius;
  if (edge.axis !== "z") cylinderCenter.z += inwardZ * appliedRadius;

  const blockGeometry = new THREE.BoxGeometry(...(blockSize as [number, number, number]));
  const cylinderGeometry = new THREE.CylinderGeometry(
    appliedRadius,
    appliedRadius,
    edgeLength,
    32,
    1,
    false
  );

  if (edge.axis === "x") {
    cylinderGeometry.rotateZ(Math.PI / 2);
  } else if (edge.axis === "z") {
    cylinderGeometry.rotateX(Math.PI / 2);
  }

  blockGeometry.translate(blockCenter.x, blockCenter.y, blockCenter.z);
  cylinderGeometry.translate(cylinderCenter.x, cylinderCenter.y, cylinderCenter.z);

  try {
    const cutter = booleanOperation(blockGeometry, cylinderGeometry, "subtract");
    const next = booleanOperation(targetGeometry, cutter, "subtract");
    const cleaned = cleanMeshGeometry(next);

    blockGeometry.dispose();
    cylinderGeometry.dispose();
    cutter.dispose();
    next.dispose();

    return {
      geometry: cleaned,
      appliedRadius,
      maxRadius: edge.maxRadius,
    };
  } catch {
    blockGeometry.dispose();
    cylinderGeometry.dispose();
    return null;
  }
}

export function buildBodyMeshWithFillets(
  body: SolidBody,
  fillets: FilletFeatureInput[]
): {
  meshData: MeshGeometryData;
  appliedByEdge: Partial<Record<FilletEdgeId, { appliedRadius: number; maxRadius: number }>>;
} | null {
  if (!isFilletCapableBody(body)) return null;

  let currentGeometry: THREE.BufferGeometry = createRectBodyGeometry(body);
  const appliedByEdge: Partial<
    Record<FilletEdgeId, { appliedRadius: number; maxRadius: number }>
  > = {};

  try {
    for (const fillet of fillets) {
      const next = applySingleRectEdgeFillet(
        currentGeometry,
        body,
        fillet.edgeId,
        fillet.radius
      );
      currentGeometry.dispose();
      if (!next) return null;
      currentGeometry = next.geometry;
      appliedByEdge[fillet.edgeId] = {
        appliedRadius: next.appliedRadius,
        maxRadius: next.maxRadius,
      };
    }

    const meshData = geometryToMeshData(currentGeometry);
    currentGeometry.dispose();
    if (meshData.positions.length === 0) return null;

    return { meshData, appliedByEdge };
  } catch {
    currentGeometry.dispose();
    return null;
  }
}

export function buildRectEdgeFilletMeshData(
  body: SolidBody,
  edgeId: FilletEdgeId,
  radius: number
): FilletBuildResult | null {
  const next = buildBodyMeshWithFillets(body, [{ edgeId, radius }]);
  if (!next) return null;
  const edgeMeta = next.appliedByEdge[edgeId];
  if (!edgeMeta) return null;
  return {
    meshData: next.meshData,
    appliedRadius: edgeMeta.appliedRadius,
    maxRadius: edgeMeta.maxRadius,
  };
}
