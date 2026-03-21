import * as THREE from "three";
import { EXPORTABLE_GEOMETRY_FLAG } from "./exportSTL";

export type OptimizeForPrintingMode = "optimize" | "autofix";

type BoundsMetrics = {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
};

type OptimizationPlan = {
  hasChanges: boolean;
  uniformScale: number;
  pivot: [number, number, number];
  offset: [number, number, number];
  centerXY: boolean;
  groundToBuildPlate: boolean;
};

export type OptimizeForPrintingResult = {
  canOptimize: boolean;
  issues: string[];
  appliedChanges: string[];
  suggestedWarnings: string[];
  metrics: {
    boundingBox: BoundsMetrics;
    minDimension: number;
    maxDimension: number;
    scaleApplied: number;
  };
  plan: OptimizationPlan;
};

type OptimizeForPrintingOptions = {
  mode?: OptimizeForPrintingMode;
};

const DEFAULT_RESULT: OptimizeForPrintingResult = {
  canOptimize: false,
  issues: ["No exportable model geometry found."],
  appliedChanges: [],
  suggestedWarnings: ["Create or show model geometry before running print tools."],
  metrics: {
    boundingBox: {
      min: [0, 0, 0],
      max: [0, 0, 0],
      size: [0, 0, 0],
    },
    minDimension: 0,
    maxDimension: 0,
    scaleApplied: 1,
  },
  plan: {
    hasChanges: false,
    uniformScale: 1,
    pivot: [0, 0, 0],
    offset: [0, 0, 0],
    centerXY: false,
    groundToBuildPlate: false,
  },
};

function collectExportableMeshes(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];

  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (!node.visible) return;
    if (!node.userData?.[EXPORTABLE_GEOMETRY_FLAG]) return;
    if (!(node.geometry instanceof THREE.BufferGeometry)) return;
    meshes.push(node);
  });

  return meshes;
}

function cloneResult(result: OptimizeForPrintingResult): OptimizeForPrintingResult {
  return {
    ...result,
    issues: [...result.issues],
    appliedChanges: [...result.appliedChanges],
    suggestedWarnings: [...result.suggestedWarnings],
    metrics: {
      ...result.metrics,
      boundingBox: {
        min: [...result.metrics.boundingBox.min] as [number, number, number],
        max: [...result.metrics.boundingBox.max] as [number, number, number],
        size: [...result.metrics.boundingBox.size] as [number, number, number],
      },
    },
    plan: {
      ...result.plan,
      pivot: [...result.plan.pivot] as [number, number, number],
      offset: [...result.plan.offset] as [number, number, number],
    },
  };
}

export function optimizeForPrinting(
  sourceRoot: THREE.Object3D,
  options: OptimizeForPrintingOptions = {}
): OptimizeForPrintingResult {
  const mode = options.mode ?? "optimize";
  const meshes = collectExportableMeshes(sourceRoot);

  if (meshes.length === 0) {
    return cloneResult(DEFAULT_RESULT);
  }

  sourceRoot.updateWorldMatrix(true, true);

  const bounds = new THREE.Box3();
  meshes.forEach((mesh) => bounds.expandByObject(mesh));

  if (bounds.isEmpty()) {
    return cloneResult(DEFAULT_RESULT);
  }

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const minDimension = Math.min(size.x, size.y, size.z);
  const maxDimension = Math.max(size.x, size.y, size.z);
  const thinRatio = maxDimension > 0 ? minDimension / maxDimension : 0;

  const issues: string[] = [];
  const warnings: string[] = [];
  const appliedChanges: string[] = [];

  if (minDimension < 1) {
    issues.push(
      `Very thin overall dimension detected (${minDimension.toFixed(2)} mm).`
    );
  } else if (minDimension < 2) {
    warnings.push(
      `Small minimum dimension (${minDimension.toFixed(2)} mm) may be fragile.`
    );
  }

  if (thinRatio < 0.02) {
    issues.push("Model has highly thin proportions that can fail during printing.");
  }

  let uniformScale = 1;

  if (maxDimension < 20) {
    uniformScale = Math.max(uniformScale, 20 / Math.max(maxDimension, 0.001));
    issues.push("Model appears very small for reliable printing.");
  }

  if (minDimension < 1.2) {
    uniformScale = Math.max(uniformScale, 1.2 / Math.max(minDimension, 0.001));
  }

  if (maxDimension > 300) {
    const downscale = 300 / maxDimension;
    uniformScale = uniformScale === 1 ? downscale : Math.min(uniformScale, downscale);
    warnings.push("Model is very large and may exceed common build volumes.");
  }

  if (mode === "autofix") {
    if (uniformScale > 1.5) uniformScale = 1.5;
    if (uniformScale < 0.7) uniformScale = 0.7;
  }

  const hasScaleChange = Math.abs(uniformScale - 1) > 0.02;

  const scaledMin = bounds.min
    .clone()
    .sub(center)
    .multiplyScalar(uniformScale)
    .add(center);

  const centerXY = Math.abs(center.x) > 0.5 || Math.abs(center.y) > 0.5;
  const groundToBuildPlate = scaledMin.z < -0.1 || scaledMin.z > 0.1;

  const offset = new THREE.Vector3(
    centerXY ? -center.x : 0,
    centerXY ? -center.y : 0,
    groundToBuildPlate ? -scaledMin.z : 0
  );

  if (hasScaleChange) {
    appliedChanges.push(`Uniform scale adjusted to ${uniformScale.toFixed(3)}x.`);
  }
  if (centerXY) {
    appliedChanges.push("Model centered on the XY print area.");
  }
  if (groundToBuildPlate) {
    appliedChanges.push("Model grounded to Z=0 build plate.");
  }
  if (appliedChanges.length === 0) {
    appliedChanges.push("No transform changes required.");
  }

  return {
    canOptimize: true,
    issues,
    appliedChanges,
    suggestedWarnings: warnings,
    metrics: {
      boundingBox: {
        min: [bounds.min.x, bounds.min.y, bounds.min.z],
        max: [bounds.max.x, bounds.max.y, bounds.max.z],
        size: [size.x, size.y, size.z],
      },
      minDimension,
      maxDimension,
      scaleApplied: uniformScale,
    },
    plan: {
      hasChanges: hasScaleChange || centerXY || groundToBuildPlate,
      uniformScale,
      pivot: [center.x, center.y, center.z],
      offset: [offset.x, offset.y, offset.z],
      centerXY,
      groundToBuildPlate,
    },
  };
}
