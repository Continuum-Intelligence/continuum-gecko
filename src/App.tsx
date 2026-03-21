import { useCallback, useEffect, useMemo, useState } from "react";
import { CanvasWorkspace } from "./canvas/components/CanvasWorkspace";
import { CadWorkspace } from "./cad/components/CadWorkspace";
import { HierarchyPanel } from "./components/ui/HierarchyPanel";
import {
  buildHierarchyTree,
  getCadSelectionRequestFromHierarchyId,
  getHierarchySelectedId,
} from "./shared/hierarchy/buildHierarchy";
import type {
  CadHierarchyState,
  CanvasHierarchyState,
  HierarchyNode,
  HierarchyRenameRequest,
  HierarchySelectionRequest,
} from "./shared/hierarchy/types";
import {
  clonePlaneSketches,
  removePlaneSketchesForMissingPlanes,
} from "./shared/sketch/helpers";
import type { PlaneSketch } from "./shared/sketch/types";

type WorkspaceTab = "cad" | "canvas";

// ============================================
// APP
// ============================================

function App() {
  // --------------------------------------------
  // Workspace Session
  // --------------------------------------------
  // Both workspaces stay mounted so their internal session state survives tab
  // switches. Only the active workspace keeps input handlers enabled.
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceTab>("cad");

  // --------------------------------------------
  // Shared Hierarchy State
  // --------------------------------------------

  const [cadHierarchyState, setCadHierarchyState] =
    useState<CadHierarchyState | null>(null);
  const [canvasHierarchyState, setCanvasHierarchyState] =
    useState<CanvasHierarchyState | null>(null);
  const [hierarchyCollapsed, setHierarchyCollapsed] = useState(true);
  const [planeSketches, setPlaneSketches] = useState<PlaneSketch[]>([]);
  const [activeCanvasTargetPlaneId, setActiveCanvasTargetPlaneId] = useState<
    string | null
  >(null);
  const [expandedHierarchyIds, setExpandedHierarchyIds] = useState<Set<string>>(
    () =>
      new Set([
        "project-root",
        "workspace-cad",
        "workspace-canvas",
        "cad-group-work-planes",
        "cad-group-dimensions",
        "canvas-group-drawings",
        "canvas-drawing-1",
      ])
  );
  const [selectionRequest, setSelectionRequest] =
    useState<HierarchySelectionRequest | null>(null);
  const [selectionRequestToken, setSelectionRequestToken] = useState(0);
  const [renameRequest, setRenameRequest] =
    useState<HierarchyRenameRequest | null>(null);
  const [renameRequestToken, setRenameRequestToken] = useState(0);

  const handleSelectCad = useCallback(() => {
    setActiveWorkspace("cad");
  }, []);

  const handleSelectCanvas = useCallback(() => {
    setActiveWorkspace("canvas");
  }, []);

  const hierarchyRoot = useMemo(
    () => buildHierarchyTree(cadHierarchyState, planeSketches),
    [cadHierarchyState, planeSketches]
  );

  useEffect(() => {
    const workPlaneIds = cadHierarchyState?.workPlanes.map((plane) => plane.id) ?? [];

    setPlaneSketches((current) => {
      const next = removePlaneSketchesForMissingPlanes(current, workPlaneIds);
      return next.length === current.length ? current : next;
    });

    setActiveCanvasTargetPlaneId((current) => {
      if (current && workPlaneIds.includes(current)) {
        return current;
      }

      const selectedPlaneId =
        cadHierarchyState?.primarySelection?.objectKind === "plane"
          ? cadHierarchyState.primarySelection.objectId
          : null;

      return selectedPlaneId && workPlaneIds.includes(selectedPlaneId)
        ? selectedPlaneId
        : null;
    });
  }, [cadHierarchyState]);

  const selectedHierarchyId = useMemo(
    () =>
      getHierarchySelectedId(
        activeWorkspace,
        cadHierarchyState,
        canvasHierarchyState
      ),
    [activeWorkspace, cadHierarchyState, canvasHierarchyState]
  );

  const handleToggleExpanded = useCallback((id: string) => {
    setExpandedHierarchyIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectHierarchyNode = useCallback(
    (node: HierarchyNode) => {
      if (!node.selectable || !node.source) {
        return;
      }

      const nextToken = selectionRequestToken + 1;
      setSelectionRequestToken(nextToken);
      const shouldDeselect = selectedHierarchyId === node.id;

      if (node.source.workspace === "cad" && node.source.type === "workPlane") {
        setActiveWorkspace("cad");
        setSelectionRequest({
          workspace: "cad",
          selection: shouldDeselect
            ? null
            : getCadSelectionRequestFromHierarchyId(node.id),
          targetId: node.id,
          token: nextToken,
        });
        return;
      }

      if (node.source.workspace === "canvas" && node.source.type === "stroke") {
        setActiveWorkspace("canvas");
        setSelectionRequest({
          workspace: "canvas",
          strokeId: shouldDeselect ? null : node.source.objectId,
          planeId: shouldDeselect ? null : node.source.planeId,
          targetId: node.id,
          token: nextToken,
        });
      }
    },
    [selectedHierarchyId, selectionRequestToken]
  );

  const handleRenameHierarchyNode = useCallback(
    (node: HierarchyNode, nextName: string) => {
      if (!node.source) {
        return;
      }

      const token = renameRequestToken + 1;
      setRenameRequestToken(token);

      if (node.source.workspace === "cad" && node.source.type === "workPlane") {
        setRenameRequest({
          workspace: "cad",
          objectId: node.source.objectId,
          nextName,
          token,
        });
        return;
      }

      if (node.source.workspace === "canvas" && node.source.type === "stroke") {
        setRenameRequest({
          workspace: "canvas",
          objectId: node.source.objectId,
          nextName,
          token,
        });
      }
    },
    [renameRequestToken]
  );

  return (
    <div className="workspace-shell">
      <HierarchyPanel
        collapsed={hierarchyCollapsed}
        expandedIds={expandedHierarchyIds}
        root={hierarchyRoot}
        selectedId={selectedHierarchyId}
        onRenameNode={handleRenameHierarchyNode}
        onSelectNode={handleSelectHierarchyNode}
        onToggleCollapsed={() => setHierarchyCollapsed((current) => !current)}
        onToggleExpanded={handleToggleExpanded}
      />

      <nav className="workspace-tabs" aria-label="Workspace tabs">
        <button
          type="button"
          className={`workspace-tabs__button${
            activeWorkspace === "cad" ? " workspace-tabs__button--active" : ""
          }`}
          onClick={handleSelectCad}
        >
          Home
        </button>
        <button
          type="button"
          className={`workspace-tabs__button${
            activeWorkspace === "canvas" ? " workspace-tabs__button--active" : ""
          }`}
          onClick={handleSelectCanvas}
        >
          Canvas
        </button>
      </nav>

      <div
        className={`workspace-view${
          activeWorkspace === "cad" ? " workspace-view--active" : ""
        }`}
        aria-hidden={activeWorkspace !== "cad"}
      >
        <CadWorkspace
          isActive={activeWorkspace === "cad"}
          planeSketches={planeSketches}
          onStateChange={setCadHierarchyState}
          renameRequest={renameRequest}
          selectionRequest={selectionRequest}
        />
      </div>

      <div
        className={`workspace-view${
          activeWorkspace === "canvas" ? " workspace-view--active" : ""
        }`}
        aria-hidden={activeWorkspace !== "canvas"}
      >
        <CanvasWorkspace
          isActive={activeWorkspace === "canvas"}
          workPlanes={cadHierarchyState?.workPlanes ?? []}
          planeSketches={planeSketches}
          activeTargetPlaneId={activeCanvasTargetPlaneId}
          onPlaneSketchesChange={(nextSketches) =>
            setPlaneSketches(clonePlaneSketches(nextSketches))
          }
          onActiveTargetPlaneChange={setActiveCanvasTargetPlaneId}
          onStateChange={setCanvasHierarchyState}
          renameRequest={renameRequest}
          selectionRequest={selectionRequest}
        />
      </div>
    </div>
  );
}

export default App;
