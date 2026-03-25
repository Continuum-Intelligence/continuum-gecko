import { memo } from "react";
import {
  formatSelectionLevel,
  getScaleDisplayBase,
} from "../../helpers/sceneMath";
import type {
  BooleanOperation,
  BodyFaceId,
  CadEntitySelection,
  DimensionOverlayItem,
  EditingTransformField,
  MousePosition,
  SceneHistoryEntry,
  SceneSelection,
  SketchTool,
  ToolPieAction,
  FilletEdgeId,
  TransformFieldAxis,
  TransformFieldGroup,
  TransformMode,
  TransformTarget,
  WorkPlane,
} from "../../types";
import type { DesignReport } from "../../utils/printCheck";

// ============================================
// RADIAL MENUS
// ============================================

export const CameraPieMenu = memo(function CameraPieMenu({
  center,
  selectedAction,
}: {
  center: MousePosition;
  selectedAction: "origin" | "top" | "front" | "right" | "iso";
}) {
  const radius = 72;
  const items = [
    { action: "top", label: "Top", x: 0, y: -radius },
    { action: "front", label: "Front", x: 0, y: radius },
    { action: "right", label: "Right", x: radius, y: 0 },
    { action: "iso", label: "Iso", x: radius * 0.7, y: -radius * 0.7 },
  ] as const;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
      <div
        className="camera-pie-surface"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y,
          width: 140,
          height: 140,
          borderRadius: "50%",
        }}
      />

      {items.map((item) => {
        const active = selectedAction === item.action;

        return (
          <div
            key={item.action}
            className="camera-pie-item"
            style={{
              position: "absolute",
              left: center.x + item.x,
              top: center.y + item.y,
              padding: "8px 12px",
              borderRadius: 999,
              background: active ? "#5f5f63" : "#2f2f33",
              border: active ? "1px solid #a8a8ad" : "1px solid #49494f",
              color: active ? "#f7f7f8" : "#d6d6d9",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              boxShadow: "0 8px 16px rgba(0,0,0,0.22)",
              animationDelay: `${80 + Math.abs(item.x) + Math.abs(item.y)}ms`,
            }}
          >
            {item.label}
          </div>
        );
      })}

      <div
        className="camera-pie-item camera-pie-center"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y,
          width: 58,
          height: 58,
          borderRadius: "50%",
          background: selectedAction === "origin" ? "#707076" : "#1f1f22",
          border: selectedAction === "origin" ? "1px solid #d8d8dc" : "1px solid #47474c",
          color: "#f3f3f4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.1,
          boxShadow: "0 10px 18px rgba(0,0,0,0.28)",
        }}
      >
        Focus
        <br />
        Origin
      </div>
    </div>
  );
});

export const ToolsPieMenu = memo(function ToolsPieMenu({
  center,
  selectedAction,
}: {
  center: MousePosition;
  selectedAction: ToolPieAction;
}) {
  const radius = 72;
  const toolActive = selectedAction === "createWorkPlane";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
      <div
        className="camera-pie-surface"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y,
          width: 140,
          height: 140,
          borderRadius: "50%",
        }}
      />

      <div
        className="camera-pie-item"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y - radius,
          padding: "8px 12px",
          borderRadius: 999,
          background: toolActive ? "#5f5f63" : "#2f2f33",
          border: toolActive ? "1px solid #a8a8ad" : "1px solid #49494f",
          color: toolActive ? "#f7f7f8" : "#d6d6d9",
          fontSize: 13,
          fontWeight: 600,
          whiteSpace: "nowrap",
          boxShadow: "0 8px 16px rgba(0,0,0,0.22)",
          animationDelay: "120ms",
        }}
      >
        Create Work Plane
      </div>

      <div
        className="camera-pie-item camera-pie-center"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y,
          width: 58,
          height: 58,
          borderRadius: "50%",
          background: "#1f1f22",
          border: "1px solid #47474c",
          color: "#f3f3f4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.1,
          boxShadow: "0 10px 18px rgba(0,0,0,0.28)",
        }}
      >
        Tools
      </div>
    </div>
  );
});

export const TransformPieMenu = memo(function TransformPieMenu({
  center,
  selectedMode,
}: {
  center: MousePosition;
  selectedMode: TransformMode;
}) {
  const radius = 72;
  const items = [
    { mode: "move", label: "Move", x: 0, y: -radius },
    { mode: "rotate", label: "Rotate", x: radius, y: 0 },
    { mode: "scale", label: "Scale", x: 0, y: radius },
  ] as const;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
      <div
        className="camera-pie-surface"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y,
          width: 140,
          height: 140,
          borderRadius: "50%",
        }}
      />

      {items.map((item) => {
        const active = selectedMode === item.mode;
        return (
          <div
            key={item.mode}
            className="camera-pie-item"
            style={{
              position: "absolute",
              left: center.x + item.x,
              top: center.y + item.y,
              padding: "8px 12px",
              borderRadius: 999,
              background: active ? "#5f5f63" : "#2f2f33",
              border: active ? "1px solid #a8a8ad" : "1px solid #49494f",
              color: active ? "#f7f7f8" : "#d6d6d9",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              boxShadow: "0 8px 16px rgba(0,0,0,0.22)",
              animationDelay: `${80 + Math.abs(item.x) + Math.abs(item.y)}ms`,
            }}
          >
            {item.label}
          </div>
        );
      })}

      <div
        className="camera-pie-item camera-pie-center"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y,
          width: 58,
          height: 58,
          borderRadius: "50%",
          background: "#1f1f22",
          border: "1px solid #47474c",
          color: "#f3f3f4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.1,
          boxShadow: "0 10px 18px rgba(0,0,0,0.28)",
        }}
      >
        Xform
      </div>
    </div>
  );
});

// ============================================
// INSPECTOR / HISTORY / WARNINGS
// ============================================

export const InspectorWindow = memo(function InspectorWindow({
  collapsed,
  onToggleCollapsed,
  primarySelection,
  secondarySelection,
  selectedObjectName,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  onStartRenaming,
  onCommitRename,
  onCancelRename,
  editingTransformField,
  transformFieldDraft,
  onTransformFieldDraftChange,
  onStartTransformFieldEdit,
  onCommitTransformFieldEdit,
  onCancelTransformFieldEdit,
  transformTarget,
  transformMode,
  onSetTransformMode,
  selectedPlane,
  selectedEntityType,
  selectedEntityLabel,
  bodyPositionDraft,
  onBodyPositionDraftChange,
  onSnapBodyToOrigin,
  onDropBodyToGround,
  onCenterAlignBodies,
  canCenterAlignBodies,
  activeSketchPlaneName,
  sketchPlaneSelectionMode,
  onToggleSketchPlaneSelectionMode,
  selectedSketchProfileType,
  radiusDraft,
  diameterDraft,
  widthDraft,
  heightDraft,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  primarySelection: SceneSelection;
  secondarySelection: SceneSelection;
  selectedObjectName: string | null;
  isRenaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onStartRenaming: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  editingTransformField: EditingTransformField;
  transformFieldDraft: string;
  onTransformFieldDraftChange: (value: string) => void;
  onStartTransformFieldEdit: (
    group: TransformFieldGroup,
    axis: TransformFieldAxis
  ) => void;
  onCommitTransformFieldEdit: () => void;
  onCancelTransformFieldEdit: () => void;
  transformTarget: TransformTarget | null;
  transformMode: TransformMode;
  onSetTransformMode: (mode: TransformMode) => void;
  selectedPlane: WorkPlane | null;
  selectedEntityType: "none" | "body" | "plane" | "profile" | "face" | "edge";
  selectedEntityLabel: string;
  bodyPositionDraft: { x: string; y: string; z: string };
  onBodyPositionDraftChange: (axis: "x" | "y" | "z", value: string) => void;
  onSnapBodyToOrigin: () => void;
  onDropBodyToGround: () => void;
  onCenterAlignBodies: () => void;
  canCenterAlignBodies: boolean;
  activeSketchPlaneName: string;
  sketchPlaneSelectionMode: boolean;
  onToggleSketchPlaneSelectionMode: () => void;
  selectedSketchProfileType: "circle" | "rectangle" | null;
  radiusDraft: string;
  diameterDraft: string;
  widthDraft: string;
  heightDraft: string;
}) {
  const modeButtons = [
    { mode: "move", label: "Move" },
    { mode: "rotate", label: "Rotate" },
    { mode: "scale", label: "Scale" },
  ] as const;
  const hasSelection = !!transformTarget;
  const formatValue = (value: number) => value.toFixed(1);

  const renderTransformValueCard = (
    group: TransformFieldGroup,
    axis: TransformFieldAxis,
    value: number | null
  ) => {
    const displayValue =
      value === null
        ? null
        : group === "scale"
          ? value * getScaleDisplayBase(selectedPlane, axis)
          : value;
    const isEditing =
      editingTransformField?.group === group &&
      editingTransformField.axis === axis;

    return (
      <div
        className="inspector-window__value-card"
        onDoubleClick={() => {
          if (value !== null) onStartTransformFieldEdit(group, axis);
        }}
      >
        <span>{axis.toUpperCase()}</span>
        {isEditing ? (
          <input
            autoFocus
            className="inspector-window__value-input"
            onBlur={onCommitTransformFieldEdit}
            onChange={(event) => onTransformFieldDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onCommitTransformFieldEdit();
              if (event.key === "Escape") onCancelTransformFieldEdit();
            }}
            value={transformFieldDraft}
          />
        ) : (
          <strong>{displayValue !== null ? formatValue(displayValue) : "--"}</strong>
        )}
      </div>
    );
  };

  return (
    <>
      <button
        className={`inspector-tab${collapsed ? " inspector-tab--visible" : ""}`}
        onClick={onToggleCollapsed}
        type="button"
        aria-label="Expand inspector"
      >
        Inspector
      </button>

      <div className={`inspector-window${collapsed ? " inspector-window--hidden" : ""}`}>
        <div className="inspector-window__header">
          <div>
            <div className="inspector-window__eyebrow">Inspector</div>
            {isRenaming ? (
              <input
                autoFocus
                className="inspector-window__title-input"
                onBlur={onCommitRename}
                onChange={(event) => onRenameDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onCommitRename();
                  if (event.key === "Escape") onCancelRename();
                }}
                value={renameDraft}
              />
            ) : (
              <div
                className="inspector-window__title"
                onDoubleClick={() => {
                  if (selectedObjectName && selectedEntityType === "plane") {
                    onStartRenaming();
                  }
                }}
              >
                {selectedObjectName ?? selectedEntityLabel}
              </div>
            )}
          </div>
          <button
            className="inspector-window__toggle"
            onClick={onToggleCollapsed}
            type="button"
            aria-label="Collapse inspector"
          >
            {"<"}
          </button>
        </div>

        <div className="inspector-window__body">
          <div className="inspector-window__section">
            <div className="inspector-window__section-title">Selection</div>
            <div className="inspector-window__meta-row">
              <span>Selected</span>
              <span>{selectedEntityLabel}</span>
            </div>
            <div className="inspector-window__meta-row">
              <span>Type</span>
              <span>{selectedEntityType}</span>
            </div>
            <div className="inspector-window__meta-row">
              <span>Primary</span>
              <span>{formatSelectionLevel(primarySelection)}</span>
            </div>
            <div className="inspector-window__meta-row">
              <span>Secondary</span>
              <span>{formatSelectionLevel(secondarySelection)}</span>
            </div>
          </div>

          {selectedEntityType === "body" || selectedEntityType === "edge" ? (
            <>
              <div className="inspector-window__section">
                <div className="inspector-window__section-title">Transform</div>
                <div className="inspector-window__mode-row">
                  <button
                    className="inspector-window__mode-button inspector-window__mode-button--active"
                    type="button"
                  >
                    Move
                  </button>
                  <button className="inspector-window__mode-button" disabled type="button">
                    Rotate
                  </button>
                  <button className="inspector-window__mode-button" disabled type="button">
                    Scale
                  </button>
                </div>
              </div>
              <div className="inspector-window__section">
                <div className="inspector-window__section-title">Position (mm)</div>
                <div className="tools-window__input-grid">
                  <label>
                    X
                    <input
                      inputMode="decimal"
                      type="number"
                      value={bodyPositionDraft.x}
                      onChange={(event) =>
                        onBodyPositionDraftChange("x", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Y
                    <input
                      inputMode="decimal"
                      type="number"
                      value={bodyPositionDraft.y}
                      onChange={(event) =>
                        onBodyPositionDraftChange("y", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Z
                    <input
                      inputMode="decimal"
                      type="number"
                      value={bodyPositionDraft.z}
                      onChange={(event) =>
                        onBodyPositionDraftChange("z", event.target.value)
                      }
                    />
                  </label>
                </div>
                <button className="tools-window__action-button" onClick={onSnapBodyToOrigin} type="button">
                  Snap to Origin
                </button>
                <button className="tools-window__action-button" onClick={onDropBodyToGround} type="button">
                  Drop to Ground
                </button>
                <button
                  className="tools-window__action-button tools-window__action-button--primary"
                  disabled={!canCenterAlignBodies}
                  onClick={onCenterAlignBodies}
                  type="button"
                >
                  Center Align
                </button>
              </div>
            </>
          ) : null}

          {selectedEntityType === "plane" || selectedEntityType === "face" ? (
            <div className="inspector-window__section">
              <div className="inspector-window__section-title">Sketch Context</div>
              <div className="inspector-window__meta-row">
                <span>Active Sketch Plane</span>
                <span>{activeSketchPlaneName}</span>
              </div>
              <button
                className={`tools-window__action-button${
                  sketchPlaneSelectionMode ? " tools-window__action-button--active" : ""
                }`}
                onClick={onToggleSketchPlaneSelectionMode}
                type="button"
              >
                {sketchPlaneSelectionMode ? "Cancel Plane Pick" : "Set Active Sketch Plane"}
              </button>
            </div>
          ) : null}

          {selectedEntityType === "profile" ? (
            <div className="inspector-window__section">
              <div className="inspector-window__section-title">Profile Dimensions (mm)</div>
              {selectedSketchProfileType === "circle" ? (
                <>
                  <div className="inspector-window__meta-row">
                    <span>Radius</span>
                    <span>{radiusDraft || "--"}</span>
                  </div>
                  <div className="inspector-window__meta-row">
                    <span>Diameter</span>
                    <span>{diameterDraft || "--"}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="inspector-window__meta-row">
                    <span>Width</span>
                    <span>{widthDraft || "--"}</span>
                  </div>
                  <div className="inspector-window__meta-row">
                    <span>Height</span>
                    <span>{heightDraft || "--"}</span>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {selectedEntityType === "plane" ? (
            <>
              <div className="inspector-window__section">
                <div className="inspector-window__section-title">Transform</div>
                <div className="inspector-window__mode-row">
                  {modeButtons.map((button) => (
                    <button
                      key={button.mode}
                      className={`inspector-window__mode-button${
                        transformMode === button.mode
                          ? " inspector-window__mode-button--active"
                          : ""
                      }`}
                      disabled={!hasSelection}
                      onClick={() =>
                        onSetTransformMode(
                          transformMode === button.mode ? null : button.mode
                        )
                      }
                      type="button"
                    >
                      {button.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="inspector-window__section">
                <div className="inspector-window__section-title">Position</div>
                <div className="inspector-window__grid">
                  {renderTransformValueCard("position", "x", transformTarget ? transformTarget.position[0] : null)}
                  {renderTransformValueCard("position", "y", transformTarget ? transformTarget.position[1] : null)}
                  {renderTransformValueCard("position", "z", transformTarget ? transformTarget.position[2] : null)}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
});

export const ViewportWarning = memo(function ViewportWarning({
  message,
}: {
  message: string;
}) {
  return <div className="viewport-warning">{message}</div>;
});

export const DesignHealthCard = memo(function DesignHealthCard({
  visible,
  bodyName,
  status,
  report,
  durationMs,
}: {
  visible: boolean;
  bodyName: string | null;
  status: "idle" | "ok" | "warning" | "error";
  report: DesignReport | null;
  durationMs: number | null;
}) {
  if (!visible || !bodyName) return null;

  return (
    <aside className={`design-health-card design-health-card--${status}`}>
      <div className="design-health-card__header">
        <div>
          <div className="design-health-card__eyebrow">Inspection</div>
          <div className="design-health-card__title">Design Health</div>
        </div>
        <span className="design-health-card__badge">
          {status === "error"
            ? "Needs Fixes"
            : status === "warning"
              ? "Needs Review"
              : status === "ok"
                ? "Healthy"
                : "Analyzing"}
        </span>
      </div>
      <div className="design-health-card__body-name">{bodyName}</div>

      {report ? (
        <>
          {report.errors.length === 0 && report.warnings.length === 0 ? (
            <div className="design-health-card__item">✅ Design looks good for printing</div>
          ) : null}
          {report.errors.map((item) => (
            <div key={`error-${item}`} className="design-health-card__item">
              ❌ {item}
            </div>
          ))}
          {report.warnings.map((item) => (
            <div key={`warning-${item}`} className="design-health-card__item">
              ⚠️ {item}
            </div>
          ))}
          {report.ok.slice(0, 2).map((item) => (
            <div key={`ok-${item}`} className="design-health-card__item design-health-card__item--ok">
              ✅ {item}
            </div>
          ))}
          <div className="design-health-card__meta">
            <span>Size</span>
            <span>{report.metrics.boundingBox.size.map((value) => value.toFixed(1)).join(" × ")} mm</span>
          </div>
          {durationMs !== null ? (
            <div className="design-health-card__meta">
              <span>Runtime</span>
              <span>{durationMs.toFixed(1)} ms</span>
            </div>
          ) : null}
        </>
      ) : (
        <div className="design-health-card__item">Analyzing selected body...</div>
      )}
    </aside>
  );
});

export const ToolsWindow = memo(function ToolsWindow({
  collapsed,
  onToggleCollapsed,
  toolsFlow,
  onOpenSketchFlow,
  onOpenExtrudeFlow,
  onOpenBooleanFlow,
  onOpenMoveFlow,
  onOpenFilletFlow,
  onOpenHoleFlow,
  onBackToToolsFlow,
  onDoneSketchFlow,
  sketchPlaneSelectionMode,
  onToggleSketchPlaneSelectionMode,
  sketchModeActive,
  onSetSketchModeActive,
  activeSketchPlaneName,
  canSketch,
  activeSketchTool,
  onActivateCircleTool,
  onActivateRectangleTool,
  sketchProfiles,
  selectedSketchCircleId,
  onSelectSketchProfile,
  bodyItems,
  selectedSolidBodyId,
  selectedSolidFace,
  onSelectBody,
  selectedEntity,
  radiusDraft,
  diameterDraft,
  onRadiusDraftChange,
  onDiameterDraftChange,
  widthDraft,
  heightDraft,
  onWidthDraftChange,
  onHeightDraftChange,
  selectedSketchProfileName,
  selectedSketchProfileType,
  extrudeDepthDraft,
  onExtrudeDepthDraftChange,
  onExtrude,
  canExtrude,
  extrudeModeActive,
  extrudeModeWaiting,
  liveExtrudeDepth,
  onConfirmExtrude,
  onCancelExtrude,
  onExportStl,
  canExportStl,
  booleanModeActive,
  booleanStep,
  booleanOperation,
  onStartBooleanOperation,
  onCancelBooleanMode,
  onConfirmBoolean,
  booleanBaseBodyName,
  booleanToolBodyName,
  booleanPreviewReady,
  movePositionDraft,
  onMovePositionDraftChange,
  onSnapToOrigin,
  onDropToGround,
  onCenterAlign,
  selectedFilletFeatureId,
  selectedBodyFillets,
  onSelectBodyFillet,
  onUpdateSelectedFilletRadius,
  selectedSolidEdge,
  filletRadiusDraft,
  filletPreviewRadius,
  filletMaxRadius,
  onFilletRadiusDraftChange,
  onApplyFillet,
  holeDiameterDraft,
  holeDepthDraft,
  holePlacementReady,
  holePlacementLocked,
  onHoleDiameterDraftChange,
  onHoleDepthDraftChange,
  onApplyHole,
  moveReferenceBodyId,
  onMoveReferenceBodyChange,
  moveDragActive,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  toolsFlow: "home" | "sketch" | "extrude" | "boolean" | "move" | "fillet" | "hole";
  onOpenSketchFlow: () => void;
  onOpenExtrudeFlow: () => void;
  onOpenBooleanFlow: () => void;
  onOpenMoveFlow: () => void;
  onOpenFilletFlow: () => void;
  onOpenHoleFlow: () => void;
  onBackToToolsFlow: () => void;
  onDoneSketchFlow: () => void;
  sketchPlaneSelectionMode: boolean;
  onToggleSketchPlaneSelectionMode: () => void;
  sketchModeActive: boolean;
  onSetSketchModeActive: (active: boolean) => void;
  activeSketchPlaneName: string;
  canSketch: boolean;
  activeSketchTool: SketchTool;
  onActivateCircleTool: () => void;
  onActivateRectangleTool: () => void;
  sketchProfiles: Array<{
    id: string;
    name: string;
    profileType: "circle" | "rectangle";
    hasExtrusion: boolean;
  }>;
  selectedSketchCircleId: string | null;
  onSelectSketchProfile: (id: string) => void;
  bodyItems: Array<{ id: string; name: string }>;
  selectedSolidBodyId: string | null;
  selectedSolidFace: { bodyId: string; faceId: BodyFaceId } | null;
  onSelectBody: (id: string | null) => void;
  selectedEntity: CadEntitySelection;
  radiusDraft: string;
  diameterDraft: string;
  onRadiusDraftChange: (value: string) => void;
  onDiameterDraftChange: (value: string) => void;
  widthDraft: string;
  heightDraft: string;
  onWidthDraftChange: (value: string) => void;
  onHeightDraftChange: (value: string) => void;
  selectedSketchProfileName: string | null;
  selectedSketchProfileType: "circle" | "rectangle" | null;
  extrudeDepthDraft: string;
  onExtrudeDepthDraftChange: (value: string) => void;
  onExtrude: () => void;
  canExtrude: boolean;
  extrudeModeActive: boolean;
  extrudeModeWaiting: boolean;
  liveExtrudeDepth: number | null;
  onConfirmExtrude: () => void;
  onCancelExtrude: () => void;
  onExportStl: () => void;
  canExportStl: boolean;
  booleanModeActive: boolean;
  booleanStep: "idle" | "pick-base" | "pick-tool" | "ready";
  booleanOperation: BooleanOperation;
  onStartBooleanOperation: (operation: BooleanOperation) => void;
  onCancelBooleanMode: () => void;
  onConfirmBoolean: () => void;
  booleanBaseBodyName: string | null;
  booleanToolBodyName: string | null;
  booleanPreviewReady: boolean;
  movePositionDraft: { x: string; y: string; z: string };
  onMovePositionDraftChange: (axis: "x" | "y" | "z", value: string) => void;
  onSnapToOrigin: () => void;
  onDropToGround: () => void;
  onCenterAlign: () => void;
  selectedFilletFeatureId: string | null;
  selectedBodyFillets: Array<{
    id: string;
    name: string;
    edgeId: FilletEdgeId;
    radius: number;
    status: "ok" | "invalid";
  }>;
  onSelectBodyFillet: (featureId: string) => void;
  onUpdateSelectedFilletRadius: () => void;
  selectedSolidEdge: { bodyId: string; edgeId: FilletEdgeId } | null;
  filletRadiusDraft: string;
  filletPreviewRadius: number | null;
  filletMaxRadius: number | null;
  onFilletRadiusDraftChange: (value: string) => void;
  onApplyFillet: () => void;
  holeDiameterDraft: string;
  holeDepthDraft: string;
  holePlacementReady: boolean;
  holePlacementLocked: boolean;
  onHoleDiameterDraftChange: (value: string) => void;
  onHoleDepthDraftChange: (value: string) => void;
  onApplyHole: () => void;
  moveReferenceBodyId: string | null;
  onMoveReferenceBodyChange: (id: string | null) => void;
  moveDragActive: boolean;
}) {
  return (
    <>
      <button
        className={`tools-tab${collapsed ? " tools-tab--visible" : ""}`}
        onClick={onToggleCollapsed}
        type="button"
        aria-label="Expand tools"
      >
        Tools
      </button>

      <div className={`tools-window${collapsed ? " tools-window--hidden" : ""}`}>
        <div className="tools-window__header">
          <div>
            <div className="tools-window__eyebrow">Tools</div>
            <div className="tools-window__title">Sketch + Solid</div>
          </div>
          <button
            className="tools-window__toggle"
            onClick={onToggleCollapsed}
            type="button"
            aria-label="Collapse tools"
          >
            {"<"}
          </button>
        </div>

        <div className="tools-window__body">
          {toolsFlow === "home" ? (
            <div className="tools-window__section">
              <div className="tools-window__section-title">Tool Modes</div>
              <div className="tools-window__meta-row">
                <span>Selected</span>
                <span>
                  {selectedEntity?.kind === "profile"
                    ? "Profile"
                    : selectedEntity?.kind === "sketch-curve"
                      ? "Curve"
                    : selectedEntity?.kind === "face"
                      ? `Face (${selectedEntity.faceId})`
                    : selectedEntity?.kind === "edge"
                      ? "Edge"
                      : selectedEntity?.kind === "body"
                        ? "Body"
                        : "None"}
                </span>
              </div>
              <button
                className="tools-window__action-button tools-window__action-button--primary"
                onClick={onOpenSketchFlow}
                type="button"
              >
                Sketch
              </button>
              <button
                className="tools-window__action-button tools-window__action-button--primary"
                onClick={onOpenExtrudeFlow}
                type="button"
              >
                Extrude
              </button>
              <button
                className="tools-window__action-button tools-window__action-button--primary"
                onClick={onOpenBooleanFlow}
                type="button"
              >
                Boolean
              </button>
              <button
                className="tools-window__action-button tools-window__action-button--primary"
                onClick={onOpenMoveFlow}
                type="button"
              >
                Move
              </button>
              <button
                className="tools-window__action-button tools-window__action-button--primary"
                onClick={onOpenFilletFlow}
                type="button"
              >
                Fillet
              </button>
              <button
                className="tools-window__action-button tools-window__action-button--primary"
                onClick={onOpenHoleFlow}
                type="button"
              >
                Hole
              </button>
              <button
                className="tools-window__action-button"
                disabled={!canExportStl}
                onClick={onExportStl}
                type="button"
              >
                Export to STL
              </button>
            </div>
          ) : null}

          {toolsFlow === "sketch" ? (
            <div className="tools-window__section">
              <div className="tools-window__flow-row">
                <div className="tools-window__section-title">Sketch</div>
                <button
                  className="tools-window__flow-done"
                  onClick={onDoneSketchFlow}
                  type="button"
                >
                  Done
                </button>
              </div>
              <div className="tools-window__meta-row">
                <span>Plane</span>
                <span>{activeSketchPlaneName}</span>
              </div>
              <button
                className={`tools-window__action-button${
                  sketchPlaneSelectionMode
                    ? " tools-window__action-button--active"
                    : ""
                }`}
                onClick={onToggleSketchPlaneSelectionMode}
                type="button"
              >
                {sketchPlaneSelectionMode ? "Cancel Plane Pick" : "Select Plane"}
              </button>
              {sketchPlaneSelectionMode ? (
                <div className="tools-window__hint">
                  Click a work plane or solid face in the viewport.
                </div>
              ) : null}
              {!canSketch ? (
                <div className="tools-window__hint">Select a plane</div>
              ) : null}
              <button
                className={`tools-window__action-button${
                  sketchModeActive ? " tools-window__action-button--active" : ""
                }`}
                disabled={!canSketch || sketchPlaneSelectionMode}
                onClick={() => onSetSketchModeActive(!sketchModeActive)}
                type="button"
              >
                {sketchModeActive ? "Stop Sketch" : "Start Sketch"}
              </button>
              <button
                className={`tools-window__action-button${
                  activeSketchTool === "circle"
                    ? " tools-window__action-button--active"
                    : ""
                }`}
                disabled={!sketchModeActive || sketchPlaneSelectionMode}
                onClick={onActivateCircleTool}
                type="button"
              >
                Draw Circle
              </button>
              <button
                className={`tools-window__action-button${
                  activeSketchTool === "rectangle"
                    ? " tools-window__action-button--active"
                    : ""
                }`}
                disabled={!sketchModeActive || sketchPlaneSelectionMode}
                onClick={onActivateRectangleTool}
                type="button"
              >
                Draw Rectangle
              </button>
              <div className="tools-window__hint">
                {activeSketchTool === "rectangle"
                  ? "Drag from origin center to define width and height."
                  : "Drag from plane origin to define radius."}
              </div>
              <div className="tools-window__hint">
                Select a curve/edge, then press D to edit dimensions.
              </div>
              <div className="tools-window__profile-list">
                {sketchProfiles.length === 0 ? (
                  <div className="tools-window__profile-empty">No profiles yet</div>
                ) : (
                  sketchProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      className={`tools-window__profile-item${
                        selectedSketchCircleId === profile.id
                          ? " tools-window__profile-item--active"
                          : ""
                      }`}
                      onClick={() => onSelectSketchProfile(profile.id)}
                      type="button"
                    >
                      <span>{profile.name}</span>
                      <span>
                        {profile.profileType === "circle" ? "Circle" : "Rectangle"}
                        {profile.hasExtrusion ? " · Extruded" : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
              {selectedSketchProfileName && selectedSketchProfileType === "circle" ? (
                <div className="tools-window__input-grid">
                  <label>
                    Radius (mm)
                    <input
                      inputMode="decimal"
                      min={0.1}
                      step={0.1}
                      type="number"
                      value={radiusDraft}
                      onChange={(event) => onRadiusDraftChange(event.target.value)}
                    />
                  </label>
                  <label>
                    Diameter (mm)
                    <input
                      inputMode="decimal"
                      min={0.2}
                      step={0.1}
                      type="number"
                      value={diameterDraft}
                      onChange={(event) => onDiameterDraftChange(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}
              {selectedSketchProfileName &&
              selectedSketchProfileType === "rectangle" ? (
                <div className="tools-window__input-grid">
                  <label>
                    Width (mm)
                    <input
                      inputMode="decimal"
                      min={0.1}
                      step={0.1}
                      type="number"
                      value={widthDraft}
                      onChange={(event) => onWidthDraftChange(event.target.value)}
                    />
                  </label>
                  <label>
                    Height (mm)
                    <input
                      inputMode="decimal"
                      min={0.1}
                      step={0.1}
                      type="number"
                      value={heightDraft}
                      onChange={(event) => onHeightDraftChange(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          {toolsFlow === "extrude" ? (
            <div className="tools-window__section">
              <div className="tools-window__flow-row">
                <div className="tools-window__section-title">Extrude</div>
                <button
                  className="tools-window__flow-done"
                  onClick={onBackToToolsFlow}
                  type="button"
                >
                  Back
                </button>
              </div>
              <div className="tools-window__profile-list">
                {sketchProfiles.length === 0 ? (
                  <div className="tools-window__profile-empty">No profiles available</div>
                ) : (
                  sketchProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      className={`tools-window__profile-item${
                        selectedSketchCircleId === profile.id
                          ? " tools-window__profile-item--active"
                          : ""
                      }`}
                      onClick={() => onSelectSketchProfile(profile.id)}
                      type="button"
                    >
                      <span>{profile.name}</span>
                      <span>{profile.hasExtrusion ? "Linked" : "Ready"}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="tools-window__profile-list">
                {bodyItems.length === 0 ? (
                  <div className="tools-window__profile-empty">No bodies yet</div>
                ) : (
                  bodyItems.map((body) => (
                    <button
                      key={body.id}
                      className={`tools-window__profile-item${
                        selectedSolidBodyId === body.id
                          ? " tools-window__profile-item--active"
                          : ""
                      }`}
                      onClick={() => onSelectBody(body.id)}
                      type="button"
                    >
                      <span>{body.name}</span>
                      <span>
                        {selectedSolidFace?.bodyId === body.id
                          ? `Face ${selectedSolidFace.faceId}`
                          : "Body"}
                      </span>
                    </button>
                  ))
                )}
              </div>
              <div className="tools-window__meta-row">
                <span>Selected</span>
                <span>{selectedSketchProfileName ?? "None"}</span>
              </div>
              <label className="tools-window__stacked-input">
                Depth (mm)
                <input
                  inputMode="decimal"
                  min={0.1}
                  step={0.1}
                  type="number"
                  value={extrudeDepthDraft}
                  onChange={(event) => onExtrudeDepthDraftChange(event.target.value)}
                />
              </label>
              {extrudeModeActive ? (
                <div className="tools-window__meta-row tools-window__meta-row--active">
                  <span>{extrudeModeWaiting ? "Extrude Mode" : "Live Depth (mm)"}</span>
                  <span>
                    {extrudeModeWaiting
                      ? "Select profile"
                      : liveExtrudeDepth
                        ? `${liveExtrudeDepth.toFixed(2)} mm`
                        : "0.00 mm"}
                  </span>
                </div>
              ) : null}
              <button
                className={`tools-window__action-button tools-window__action-button--primary${
                  extrudeModeActive ? " tools-window__action-button--active" : ""
                }`}
                disabled={!canExtrude && !extrudeModeActive}
                onClick={onExtrude}
                type="button"
              >
                {extrudeModeActive ? "Extrude Active" : "Extrude"}
              </button>
              {extrudeModeActive ? (
                <>
                  <button
                    className="tools-window__action-button tools-window__action-button--active"
                    onClick={onConfirmExtrude}
                    type="button"
                  >
                    Confirm Extrude
                  </button>
                  <button
                    className="tools-window__action-button"
                    onClick={onCancelExtrude}
                    type="button"
                  >
                    Cancel
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {toolsFlow === "boolean" ? (
            <div className="tools-window__section">
              <div className="tools-window__flow-row">
                <div className="tools-window__section-title">Boolean</div>
                <button
                  className="tools-window__flow-done"
                  onClick={onBackToToolsFlow}
                  type="button"
                >
                  Back
                </button>
              </div>
              <div className="tools-window__input-grid">
                <button
                  className={`tools-window__action-button${
                    booleanOperation === "union"
                      ? " tools-window__action-button--active"
                      : ""
                  }`}
                  onClick={() => onStartBooleanOperation("union")}
                  type="button"
                >
                  Union
                </button>
                <button
                  className={`tools-window__action-button${
                    booleanOperation === "subtract"
                      ? " tools-window__action-button--active"
                      : ""
                  }`}
                  onClick={() => onStartBooleanOperation("subtract")}
                  type="button"
                >
                  Subtract
                </button>
                <button
                  className={`tools-window__action-button${
                    booleanOperation === "intersect"
                      ? " tools-window__action-button--active"
                      : ""
                  }`}
                  onClick={() => onStartBooleanOperation("intersect")}
                  type="button"
                >
                  Intersect
                </button>
              </div>
              <div className="tools-window__meta-row">
                <span>Base Body</span>
                <span>{booleanBaseBodyName ?? "Select in viewport"}</span>
              </div>
              <div className="tools-window__meta-row">
                <span>Tool Body</span>
                <span>{booleanToolBodyName ?? "Select in viewport"}</span>
              </div>
              <div className="tools-window__meta-row tools-window__meta-row--active">
                <span>Step</span>
                <span>
                  {booleanStep === "pick-base"
                    ? "Pick base body"
                    : booleanStep === "pick-tool"
                      ? "Pick tool body"
                      : booleanStep === "ready"
                        ? booleanPreviewReady
                          ? "Preview ready"
                          : "No overlap/invalid"
                        : "Choose operation"}
                </span>
              </div>
              {booleanModeActive ? (
                <>
                  <button
                    className="tools-window__action-button tools-window__action-button--primary"
                    disabled={!booleanPreviewReady}
                    onClick={onConfirmBoolean}
                    type="button"
                  >
                    Confirm Boolean
                  </button>
                  <button
                    className="tools-window__action-button"
                    onClick={onCancelBooleanMode}
                    type="button"
                  >
                    Cancel
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {toolsFlow === "move" ? (
            <div className="tools-window__section">
              <div className="tools-window__flow-row">
                <div className="tools-window__section-title">Move</div>
                <button
                  className="tools-window__flow-done"
                  onClick={onBackToToolsFlow}
                  type="button"
                >
                  Back
                </button>
              </div>
              <div className="tools-window__profile-list">
                {bodyItems.length === 0 ? (
                  <div className="tools-window__profile-empty">No bodies yet</div>
                ) : (
                  bodyItems.map((body) => (
                    <button
                      key={body.id}
                      className={`tools-window__profile-item${
                        selectedSolidBodyId === body.id
                          ? " tools-window__profile-item--active"
                          : ""
                      }`}
                      onClick={() => onSelectBody(body.id)}
                      type="button"
                    >
                      <span>{body.name}</span>
                      <span>Active</span>
                    </button>
                  ))
                )}
              </div>
              <div className="tools-window__meta-row">
                <span>Selected</span>
                <span>
                  {selectedSolidBodyId
                    ? bodyItems.find((body) => body.id === selectedSolidBodyId)?.name ??
                      "Body"
                    : "Select body"}
                </span>
              </div>
              <div className="tools-window__meta-row">
                <span>Mode</span>
                <span>{moveDragActive ? "Drag Mode" : "Input Mode"}</span>
              </div>
              <div className="tools-window__input-grid">
                <label>
                  X (mm)
                  <input
                    inputMode="decimal"
                    step={0.1}
                    type="number"
                    value={movePositionDraft.x}
                    onChange={(event) =>
                      onMovePositionDraftChange("x", event.target.value)
                    }
                    disabled={!selectedSolidBodyId}
                  />
                </label>
                <label>
                  Y (mm)
                  <input
                    inputMode="decimal"
                    step={0.1}
                    type="number"
                    value={movePositionDraft.y}
                    onChange={(event) =>
                      onMovePositionDraftChange("y", event.target.value)
                    }
                    disabled={!selectedSolidBodyId}
                  />
                </label>
                <label>
                  Z (mm)
                  <input
                    inputMode="decimal"
                    step={0.1}
                    type="number"
                    value={movePositionDraft.z}
                    onChange={(event) =>
                      onMovePositionDraftChange("z", event.target.value)
                    }
                    disabled={!selectedSolidBodyId}
                  />
                </label>
              </div>
              <div className="tools-window__profile-list">
                {bodyItems.length <= 1 ? (
                  <div className="tools-window__profile-empty">
                    Create another body for center align
                  </div>
                ) : (
                  bodyItems
                    .filter((body) => body.id !== selectedSolidBodyId)
                    .map((body) => (
                      <button
                        key={body.id}
                        className={`tools-window__profile-item${
                          moveReferenceBodyId === body.id
                            ? " tools-window__profile-item--active"
                            : ""
                        }`}
                        onClick={() =>
                          onMoveReferenceBodyChange(
                            moveReferenceBodyId === body.id ? null : body.id
                          )
                        }
                        type="button"
                      >
                        <span>{body.name}</span>
                        <span>Reference</span>
                      </button>
                    ))
                )}
              </div>
              <button
                className="tools-window__action-button"
                disabled={!selectedSolidBodyId}
                onClick={onSnapToOrigin}
                type="button"
              >
                Snap to Origin
              </button>
              <button
                className="tools-window__action-button"
                disabled={!selectedSolidBodyId}
                onClick={onDropToGround}
                type="button"
              >
                Drop to Ground
              </button>
              <button
                className="tools-window__action-button tools-window__action-button--primary"
                disabled={!selectedSolidBodyId || !moveReferenceBodyId}
                onClick={onCenterAlign}
                type="button"
              >
                Center Align
              </button>
            </div>
          ) : null}

          {toolsFlow === "fillet" ? (
            <div className="tools-window__section">
              <div className="tools-window__flow-row">
                <div className="tools-window__section-title">Fillet</div>
                <button
                  className="tools-window__flow-done"
                  onClick={onBackToToolsFlow}
                  type="button"
                >
                  Back
                </button>
              </div>
              <div className="tools-window__meta-row">
                <span>Selected Body</span>
                <span>
                  {selectedSolidBodyId
                    ? bodyItems.find((body) => body.id === selectedSolidBodyId)?.name ?? "None"
                    : "None"}
                </span>
              </div>
              <div className="tools-window__meta-row">
                <span>Selected Edge</span>
                <span>{selectedSolidEdge?.edgeId ?? "Pick an edge in viewport"}</span>
              </div>
              <div className="tools-window__section-subtitle">Body Fillets</div>
              <div className="tools-window__list">
                {selectedBodyFillets.length === 0 ? (
                  <div className="tools-window__empty">No fillets on this body yet</div>
                ) : (
                  selectedBodyFillets.map((feature) => (
                    <button
                      key={feature.id}
                      className={`tools-window__list-item${
                        selectedFilletFeatureId === feature.id
                          ? " tools-window__list-item--active"
                          : ""
                      }`}
                      onClick={() => onSelectBodyFillet(feature.id)}
                      type="button"
                    >
                      <span>{feature.name}</span>
                      <span>{`${feature.radius.toFixed(2)} mm`}</span>
                    </button>
                  ))
                )}
              </div>
              <label className="tools-window__stacked-input">
                Radius (mm)
                <input
                  inputMode="decimal"
                  min={0.01}
                  step={0.1}
                  type="number"
                  value={filletRadiusDraft}
                  onChange={(event) => onFilletRadiusDraftChange(event.target.value)}
                />
              </label>
              <label className="tools-window__stacked-input">
                Drag Radius
                <input
                  min={0.01}
                  max={filletMaxRadius ?? 10}
                  step={0.01}
                  type="range"
                  value={Math.max(0.01, Number(filletRadiusDraft) || 0.01)}
                  onChange={(event) => onFilletRadiusDraftChange(event.target.value)}
                />
              </label>
              <div className="tools-window__meta-row">
                <span>Preview Radius</span>
                <span>
                  {filletPreviewRadius !== null ? `${filletPreviewRadius.toFixed(2)} mm` : "--"}
                </span>
              </div>
              <div className="tools-window__meta-row">
                <span>Max Radius</span>
                <span>{filletMaxRadius !== null ? `${filletMaxRadius.toFixed(2)} mm` : "--"}</span>
              </div>
              <button
                className="tools-window__action-button tools-window__action-button--primary"
                onClick={selectedFilletFeatureId ? onUpdateSelectedFilletRadius : onApplyFillet}
                type="button"
              >
                {selectedFilletFeatureId ? "Update Selected Fillet" : "Apply Fillet"}
              </button>
              <button
                className="tools-window__action-button"
                onClick={onBackToToolsFlow}
                type="button"
              >
                Done
              </button>
            </div>
          ) : null}

          {toolsFlow === "hole" ? (
            <div className="tools-window__section">
              <div className="tools-window__flow-row">
                <div className="tools-window__section-title">Hole</div>
                <button
                  className="tools-window__flow-done"
                  onClick={onBackToToolsFlow}
                  type="button"
                >
                  Done
                </button>
              </div>
              <div className="tools-window__meta-row">
                <span>Selected Face</span>
                <span>
                  {selectedSolidFace
                    ? `${bodyItems.find((body) => body.id === selectedSolidFace.bodyId)?.name ?? "Body"}:${selectedSolidFace.faceId}`
                    : "Pick a face"}
                </span>
              </div>
              <div className="tools-window__meta-row">
                <span>Placement</span>
                <span>
                  {holePlacementLocked
                    ? "Center locked"
                    : holePlacementReady
                      ? "Tracking cursor on face"
                      : "Move cursor on selected face"}
                </span>
              </div>
              <label className="tools-window__stacked-input">
                Diameter (mm)
                <input
                  inputMode="decimal"
                  min={0.1}
                  step={0.1}
                  type="number"
                  value={holeDiameterDraft}
                  onChange={(event) => onHoleDiameterDraftChange(event.target.value)}
                />
              </label>
              <label className="tools-window__stacked-input">
                Depth (mm)
                <input
                  inputMode="decimal"
                  min={0.1}
                  step={0.1}
                  type="number"
                  value={holeDepthDraft}
                  onChange={(event) => onHoleDepthDraftChange(event.target.value)}
                />
              </label>
              <button
                className="tools-window__action-button tools-window__action-button--primary"
                onClick={onApplyHole}
                type="button"
              >
                Apply Hole
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
});

export const DimensionOverlay = memo(function DimensionOverlay({
  items,
  onEditDimension,
}: {
  items: DimensionOverlayItem[];
  onEditDimension: (dimensionId: string, currentValue: number) => void;
}) {
  if (items.length === 0) return null;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 18,
      }}
    >
      {items.map((item) => (
        <g key={item.id}>
          <line
            x1={item.start.x}
            y1={item.start.y}
            x2={item.end.x}
            y2={item.end.y}
            stroke="#111827"
            strokeWidth="1.8"
          />
          <polygon points={item.fromArrow.map((point) => `${point.x},${point.y}`).join(" ")} fill="#111827" />
          <polygon points={item.toArrow.map((point) => `${point.x},${point.y}`).join(" ")} fill="#111827" />
          <text
            x={item.label.x}
            y={item.label.y}
            fill="#111827"
            fontSize="13"
            fontWeight="600"
            textAnchor="middle"
            style={{ pointerEvents: "auto", cursor: "text", userSelect: "none" }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onEditDimension(item.id, item.value);
            }}
          >
            {`${item.value.toFixed(1)} mm`}
          </text>
        </g>
      ))}
    </svg>
  );
});

export const UndoRedoOverlay = memo(function UndoRedoOverlay({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="undo-redo-overlay">
      <button className="undo-redo-overlay__button" disabled={!canUndo} onClick={onUndo} type="button" aria-label="Undo" title="Undo">
        <i className="fa-solid fa-arrow-rotate-left" />
      </button>
      <button className="undo-redo-overlay__button" disabled={!canRedo} onClick={onRedo} type="button" aria-label="Redo" title="Redo">
        <i className="fa-solid fa-arrow-rotate-right" />
      </button>
    </div>
  );
});

export const HistoryWindow = memo(function HistoryWindow({
  collapsed,
  onToggleCollapsed,
  featureTree,
  selectedFeatureDetails,
  selectedFeatureNode,
  selectedProfileId,
  onSelectSketchFeature,
  onSelectExtrudeFeature,
  onSelectBooleanFeature,
  onSelectFilletFeature,
  onSelectHoleFeature,
  onSelectFeatureProfile,
  historyEntries,
  historyIndex,
  onSelectHistoryIndex,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  featureTree: Array<
    | {
        kind: "sketch";
        id: string;
        name: string;
        order: number;
        dependencies: string[];
        parameterSummary: string;
        children: { id: string; name: string }[];
      }
    | {
        kind: "extrude";
        id: string;
        name: string;
        sourceProfileId: string;
        order: number;
        dependencies: string[];
        parameterSummary: string;
      }
    | {
        kind: "boolean";
        id: string;
        name: string;
        operation: BooleanOperation;
        order: number;
        dependencies: string[];
        parameterSummary: string;
      }
    | {
        kind: "fillet";
        id: string;
        name: string;
        bodyId: string;
        radius: number;
        order: number;
        dependencies: string[];
        parameterSummary: string;
      }
    | {
        kind: "hole";
        id: string;
        name: string;
        bodyId: string;
        diameter: number;
        depth: number;
        order: number;
        dependencies: string[];
        parameterSummary: string;
      }
  >;
  selectedFeatureDetails: {
    name: string;
    kind: "sketch" | "extrude" | "boolean" | "fillet" | "hole";
    order: number;
    dependencies: string[];
    parameterSummary: string;
  } | null;
  selectedFeatureNode: { kind: "sketch" | "extrude" | "boolean" | "fillet" | "hole"; id: string } | null;
  selectedProfileId: string | null;
  onSelectSketchFeature: (featureId: string) => void;
  onSelectExtrudeFeature: (featureId: string) => void;
  onSelectBooleanFeature: (featureId: string) => void;
  onSelectFilletFeature: (featureId: string) => void;
  onSelectHoleFeature: (featureId: string) => void;
  onSelectFeatureProfile: (profileId: string) => void;
  historyEntries: SceneHistoryEntry[];
  historyIndex: number;
  onSelectHistoryIndex: (index: number) => void;
}) {
  return (
    <>
      <button
        className={`history-tab${collapsed ? " history-tab--visible" : ""}`}
        onClick={onToggleCollapsed}
        type="button"
        aria-label="Expand history"
      >
        History
      </button>

      <div className={`history-window${collapsed ? " history-window--hidden" : ""}`}>
        <div className="history-window__header">
          <div>
            <div className="history-window__eyebrow">History</div>
            <div className="history-window__title">Edit Timeline</div>
          </div>
          <button
            className="history-window__toggle"
            onClick={onToggleCollapsed}
            type="button"
            aria-label="Collapse history"
          >
            {"<"}
          </button>
        </div>

        <div className="history-window__body">
          <div className="history-window__section-title">Features</div>
          {selectedFeatureDetails ? (
            <div className="history-window__meta-card">
              <div className="history-window__meta-title">{selectedFeatureDetails.name}</div>
              <div className="history-window__meta-row">
                <span>Type</span>
                <span>{selectedFeatureDetails.kind}</span>
              </div>
              <div className="history-window__meta-row">
                <span>Order</span>
                <span>{selectedFeatureDetails.order}</span>
              </div>
              <div className="history-window__meta-row">
                <span>Params</span>
                <span>{selectedFeatureDetails.parameterSummary}</span>
              </div>
              <div className="history-window__meta-row">
                <span>Depends</span>
                <span>
                  {selectedFeatureDetails.dependencies.length > 0
                    ? selectedFeatureDetails.dependencies.join(", ")
                    : "None"}
                </span>
              </div>
            </div>
          ) : null}
          {featureTree.length === 0 ? (
            <div className="history-window__empty">No features yet</div>
          ) : (
            featureTree.map((feature) =>
              feature.kind === "sketch" ? (
                <div key={feature.id} className="history-window__feature-group">
                  <button
                  className={`history-window__feature${
                    selectedFeatureNode?.kind === "sketch" &&
                    selectedFeatureNode.id === feature.id
                      ? " history-window__feature--active"
                      : ""
                  }`}
                  title={
                    feature.dependencies.length > 0
                      ? `Depends on: ${feature.dependencies.join(", ")}`
                      : "No dependencies"
                  }
                  onClick={() => onSelectSketchFeature(feature.id)}
                  type="button"
                >
                  <span>{feature.name}</span>
                  <span>{`#${feature.order}`}</span>
                </button>
                  {feature.children.map((profile) => (
                    <button
                      key={profile.id}
                      className={`history-window__feature-child${
                        selectedProfileId === profile.id
                          ? " history-window__feature-child--active"
                          : ""
                      }`}
                      onClick={() => onSelectFeatureProfile(profile.id)}
                      type="button"
                    >
                      {profile.name}
                    </button>
                  ))}
                </div>
              ) : feature.kind === "extrude" ? (
                <button
                  key={feature.id}
                  className={`history-window__feature${
                    selectedFeatureNode?.kind === "extrude" &&
                    selectedFeatureNode.id === feature.id
                      ? " history-window__feature--active"
                      : ""
                  }`}
                  title={
                    feature.dependencies.length > 0
                      ? `Depends on: ${feature.dependencies.join(", ")}`
                      : "No dependencies"
                  }
                  onClick={() => onSelectExtrudeFeature(feature.id)}
                  type="button"
                >
                  <span>{feature.name}</span>
                  <span>{feature.parameterSummary}</span>
                </button>
              ) : feature.kind === "fillet" ? (
                <button
                  key={feature.id}
                  className={`history-window__feature${
                    selectedFeatureNode?.kind === "fillet" &&
                    selectedFeatureNode.id === feature.id
                      ? " history-window__feature--active"
                      : ""
                  }`}
                  title={
                    feature.dependencies.length > 0
                      ? `Depends on: ${feature.dependencies.join(", ")}`
                      : "No dependencies"
                  }
                  onClick={() => onSelectFilletFeature(feature.id)}
                  type="button"
                >
                  <span>{feature.name}</span>
                  <span>{`${feature.radius.toFixed(2)} mm`}</span>
                </button>
              ) : feature.kind === "hole" ? (
                <button
                  key={feature.id}
                  className={`history-window__feature${
                    selectedFeatureNode?.kind === "hole" &&
                    selectedFeatureNode.id === feature.id
                      ? " history-window__feature--active"
                      : ""
                  }`}
                  title={
                    feature.dependencies.length > 0
                      ? `Depends on: ${feature.dependencies.join(", ")}`
                      : "No dependencies"
                  }
                  onClick={() => onSelectHoleFeature(feature.id)}
                  type="button"
                >
                  <span>{feature.name}</span>
                  <span>{`${feature.diameter.toFixed(1)} x ${feature.depth.toFixed(1)}`}</span>
                </button>
              ) : (
                <button
                  key={feature.id}
                  className={`history-window__feature${
                    selectedFeatureNode?.kind === "boolean" &&
                    selectedFeatureNode.id === feature.id
                      ? " history-window__feature--active"
                      : ""
                  }`}
                  title={
                    feature.dependencies.length > 0
                      ? `Depends on: ${feature.dependencies.join(", ")}`
                      : "No dependencies"
                  }
                  onClick={() => onSelectBooleanFeature(feature.id)}
                  type="button"
                >
                  <span>{feature.name}</span>
                  <span>{feature.operation}</span>
                </button>
              )
            )
          )}

          <div className="history-window__section-title">Timeline</div>
          {historyEntries.map((entry, index) => (
            <button
              key={entry.id}
              className={`history-window__entry${
                index === historyIndex ? " history-window__entry--active" : ""
              }${index > historyIndex ? " history-window__entry--future" : ""}`}
              onClick={() => onSelectHistoryIndex(index)}
              type="button"
            >
              <span className="history-window__entry-index">{index}</span>
              <span className="history-window__entry-label">{entry.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
});
