import * as THREE from "three";
import { EXPORTABLE_GEOMETRY_FLAG } from "../../utils/exportSTL";

export const DESIGN_HEALTH_BODY_ID_FLAG = "designHealthBodyId";

export type DesignReport = {
  isValid: boolean;
  ok: string[];
  errors: string[];
  warnings: string[];
  metrics: {
    boundingBox: {
      min: [number, number, number];
      max: [number, number, number];
      size: [number, number, number];
    };
    minDimension: number;
    maxDimension: number;
  };
};

const MIN_THICKNESS_MM = 1;
const GROUNDED_EPSILON = 0.05;
const SMALL_MODEL_MM = 1;
const LARGE_MODEL_MM = 1000;
const OVERHANG_DEG = 45;
const MAX_NORMAL_SAMPLES = 5000;

function emptyMetrics() {
  return {
    boundingBox: {
      min: [0, 0, 0] as [number, number, number],
      max: [0, 0, 0] as [number, number, number],
      size: [0, 0, 0] as [number, number, number],
    },
    minDimension: 0,
    maxDimension: 0,
  };
}

export function analyzeDesign(object3D: THREE.Object3D): DesignReport {
  object3D.updateWorldMatrix(true, true);

  const errors: string[] = [];
  const warnings: string[] = [];
  const ok: string[] = [];

  const globalBox = new THREE.Box3();
  let hasGeometry = false;
  let totalVertexCount = 0;
  let totalFaceCount = 0;
  let hasOverhang = false;

  const up = new THREE.Vector3(0, 0, 1);
  const normalMatrix = new THREE.Matrix3();
  const thresholdDot = Math.cos(THREE.MathUtils.degToRad(OVERHANG_DEG));
  const tempBox = new THREE.Box3();

  object3D.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (!node.visible) return;
    if (!node.userData?.[EXPORTABLE_GEOMETRY_FLAG]) return;
    if (!(node.geometry instanceof THREE.BufferGeometry)) return;

    const geometry = node.geometry;
    const position = geometry.getAttribute("position");
    if (!position || position.count === 0) return;

    hasGeometry = true;
    totalVertexCount += position.count;
    totalFaceCount += geometry.index ? Math.floor(geometry.index.count / 3) : Math.floor(position.count / 3);

    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      tempBox.copy(geometry.boundingBox).applyMatrix4(node.matrixWorld);
      globalBox.union(tempBox);
    }

    const normal = geometry.getAttribute("normal");
    if (!normal || normal.count === 0) return;

    normalMatrix.getNormalMatrix(node.matrixWorld);
    const worldNormal = new THREE.Vector3();
    const sampleStep = Math.max(1, Math.floor(normal.count / MAX_NORMAL_SAMPLES));
    for (let i = 0; i < normal.count; i += sampleStep) {
      worldNormal
        .fromBufferAttribute(normal, i)
        .applyMatrix3(normalMatrix)
        .normalize();

      if (worldNormal.dot(up) < -thresholdDot) {
        hasOverhang = true;
        break;
      }
    }
  });

  if (!hasGeometry || totalVertexCount === 0 || totalFaceCount === 0) {
    errors.push("Invalid or empty geometry");
    return {
      isValid: false,
      ok,
      errors,
      warnings,
      metrics: emptyMetrics(),
    };
  }

  const size = globalBox.getSize(new THREE.Vector3());
  const minDimension = Math.min(size.x, size.y, size.z);
  const maxDimension = Math.max(size.x, size.y, size.z);

  if (minDimension < MIN_THICKNESS_MM) {
    errors.push("Wall too thin for printing");
  } else {
    ok.push("Minimum thickness looks acceptable");
  }

  if (globalBox.min.z > GROUNDED_EPSILON) {
    warnings.push("Object not grounded — may print in air");
  } else {
    ok.push("Model is grounded");
  }

  if (hasOverhang) {
    warnings.push("Overhang detected — may need supports");
  } else {
    ok.push("No severe overhangs detected");
  }

  if (maxDimension < SMALL_MODEL_MM) {
    warnings.push("Model scale is very small (< 1 mm)");
  } else if (maxDimension > LARGE_MODEL_MM) {
    warnings.push("Model scale is very large (> 1000 mm)");
  } else {
    ok.push("Model scale is within common print range");
  }

  return {
    isValid: errors.length === 0,
    ok,
    errors,
    warnings,
    metrics: {
      boundingBox: {
        min: [globalBox.min.x, globalBox.min.y, globalBox.min.z],
        max: [globalBox.max.x, globalBox.max.y, globalBox.max.z],
        size: [size.x, size.y, size.z],
      },
      minDimension,
      maxDimension,
    },
  };
}
