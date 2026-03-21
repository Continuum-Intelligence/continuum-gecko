import type {
  DistanceDimension,
  SceneHistoryEntry,
  SceneSelection,
  WorkPlane,
} from "../../cad/types";
import type { CanvasHistoryEntry, CanvasTool } from "../../canvas/types";
import type { PlaneSketch } from "../sketch/types";

// ============================================
// TYPES
// ============================================

export type HierarchyWorkspace = "shared" | "cad" | "canvas";

export type HierarchyItemKind =
  | "project"
  | "workspace"
  | "group"
  | "workPlane"
  | "dimension"
  | "drawing"
  | "stroke";

export type HierarchySourceRef =
  | { workspace: "cad"; type: "workPlane"; objectId: string }
  | { workspace: "cad"; type: "dimension"; objectId: string }
  | { workspace: "canvas"; type: "stroke"; objectId: number; planeId: string }
  | null;

export type HierarchyNode = {
  id: string;
  name: string;
  kind: HierarchyItemKind;
  workspace: HierarchyWorkspace;
  visible: boolean;
  selectable: boolean;
  source: HierarchySourceRef;
  children: HierarchyNode[];
};

export type CadHierarchyState = {
  workPlanes: WorkPlane[];
  dimensions: DistanceDimension[];
  primarySelection: SceneSelection;
  secondarySelection: SceneSelection;
  historyEntries: SceneHistoryEntry[];
  historyIndex: number;
};

export type CanvasHierarchyState = {
  planeSketches: PlaneSketch[];
  selectedStrokeId: number | null;
  activeTool: CanvasTool;
  activeTargetPlaneId: string | null;
  historyEntries: CanvasHistoryEntry[];
  historyIndex: number;
};

export type HierarchySelectionRequest =
  | {
      workspace: "cad";
      selection: SceneSelection;
      targetId: string;
      token: number;
    }
  | {
      workspace: "canvas";
      strokeId: number | null;
      planeId: string | null;
      targetId: string;
      token: number;
    };

export type HierarchyRenameRequest =
  | {
      workspace: "cad";
      objectId: string;
      nextName: string;
      token: number;
    }
  | {
      workspace: "canvas";
      objectId: number;
      nextName: string;
      token: number;
    };
