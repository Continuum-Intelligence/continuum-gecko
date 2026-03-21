import { createSelection } from "../../cad/helpers/sceneMath";
import type { SceneSelection } from "../../cad/types";
import type { PlaneSketch } from "../sketch/types";
import type { CadHierarchyState, CanvasHierarchyState, HierarchyNode } from "./types";

// ============================================
// HELPERS
// ============================================

export function getHierarchySelectedId(
  activeWorkspace: "cad" | "canvas",
  cadState: CadHierarchyState | null,
  canvasState: CanvasHierarchyState | null
) {
  if (activeWorkspace === "cad") {
    if (cadState?.primarySelection?.objectKind === "plane") {
      return `cad-work-plane-${cadState.primarySelection.objectId}`;
    }
    return null;
  }

  if (canvasState && canvasState.selectedStrokeId !== null) {
    return `canvas-stroke-${canvasState.selectedStrokeId}`;
  }

  return null;
}

export function buildHierarchyTree(
  cadState: CadHierarchyState | null,
  planeSketches: PlaneSketch[]
): HierarchyNode {
  const planeNameById = new Map(
    (cadState?.workPlanes ?? []).map((plane) => [plane.id, plane.name])
  );

  const cadWorkPlaneNodes: HierarchyNode[] =
    cadState?.workPlanes.map((plane) => ({
      id: `cad-work-plane-${plane.id}`,
      name: plane.name,
      kind: "workPlane",
      workspace: "cad",
      visible: plane.visible,
      selectable: true,
      source: { workspace: "cad", type: "workPlane", objectId: plane.id },
      children: [],
    })) ?? [];

  const cadDimensionNodes: HierarchyNode[] =
    cadState?.dimensions.map((dimension, index) => ({
      id: `cad-dimension-${dimension.id}`,
      name: `Distance ${index + 1}`,
      kind: "dimension",
      workspace: "cad",
      visible: true,
      selectable: false,
      source: { workspace: "cad", type: "dimension", objectId: dimension.id },
      children: [],
    })) ?? [];

  const canvasSketchNodes: HierarchyNode[] = planeSketches.map((sketch) => ({
    id: `canvas-plane-sketch-${sketch.planeId}`,
    name: planeNameById.get(sketch.planeId) ?? sketch.planeId,
    kind: "drawing",
    workspace: "canvas",
    visible: true,
    selectable: false,
    source: null,
    children: sketch.strokes.map((stroke, index) => ({
      id: `canvas-stroke-${stroke.id}`,
      name: stroke.name || `Stroke ${index + 1}`,
      kind: "stroke",
      workspace: "canvas",
      visible: true,
      selectable: true,
      source: {
        workspace: "canvas",
        type: "stroke",
        objectId: stroke.id,
        planeId: sketch.planeId,
      },
      children: [],
    })),
  }));

  return {
    id: "project-root",
    name: "Project",
    kind: "project",
    workspace: "shared",
    visible: true,
    selectable: false,
    source: null,
    children: [
      {
        id: "workspace-cad",
        name: "CAD",
        kind: "workspace",
        workspace: "cad",
        visible: true,
        selectable: false,
        source: null,
        children: [
          {
            id: "cad-group-work-planes",
            name: "Work Planes",
            kind: "group",
            workspace: "cad",
            visible: true,
            selectable: false,
            source: null,
            children: cadWorkPlaneNodes,
          },
          {
            id: "cad-group-dimensions",
            name: "Dimensions",
            kind: "group",
            workspace: "cad",
            visible: true,
            selectable: false,
            source: null,
            children: cadDimensionNodes,
          },
        ],
      },
      {
        id: "workspace-canvas",
        name: "Canvas",
        kind: "workspace",
        workspace: "canvas",
        visible: true,
        selectable: false,
        source: null,
        children: [
          {
            id: "canvas-group-drawings",
            name: "Drawings",
            kind: "group",
            workspace: "canvas",
            visible: true,
            selectable: false,
            source: null,
            children: canvasSketchNodes,
          },
        ],
      },
    ],
  };
}

export function getCadSelectionRequestFromHierarchyId(
  nodeId: string
): SceneSelection {
  const prefix = "cad-work-plane-";
  if (!nodeId.startsWith(prefix)) {
    return null;
  }

  const objectId = nodeId.slice(prefix.length);
  return createSelection("plane", objectId, "object");
}
