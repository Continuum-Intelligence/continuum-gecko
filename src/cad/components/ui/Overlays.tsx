import { memo } from "react";
import {
  formatSelectionLevel,
  getScaleDisplayBase,
} from "../../helpers/sceneMath";
import type {
  DimensionOverlayItem,
  EditingTransformField,
  MousePosition,
  SceneHistoryEntry,
  SceneSelection,
  SketchTool,
  ToolPieAction,
  TransformFieldAxis,
  TransformFieldGroup,
  TransformMode,
  TransformTarget,
  WorkPlane,
} from "../../types";

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
}) {
  const modeButtons = [
    { mode: "move", label: "Move" },
    { mode: "rotate", label: "Rotate" },
    { mode: "scale", label: "Scale" },
  ] as const;
  const hasSelection = !!primarySelection && !!transformTarget;
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
                  if (selectedObjectName) onStartRenaming();
                }}
              >
                {selectedObjectName ?? "No Selection"}
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
            <div className="inspector-window__section-title">Selection</div>
            <div className="inspector-window__meta-row">
              <span>Type</span>
              <span>{primarySelection?.objectKind ?? "None"}</span>
            </div>
            <div className="inspector-window__meta-row">
              <span>Level</span>
              <span>{primarySelection?.selectionLevel ?? "None"}</span>
            </div>
            <div className="inspector-window__meta-row">
              <span>Primary</span>
              <span>{formatSelectionLevel(primarySelection)}</span>
            </div>
            <div className="inspector-window__meta-row">
              <span>Secondary</span>
              <span>{formatSelectionLevel(secondarySelection)}</span>
            </div>
            <div className="inspector-window__meta-row">
              <span>Mode</span>
              <span>{transformMode ?? "None"}</span>
            </div>
            <div className="inspector-window__meta-row">
              <span>Hint</span>
              <span>Shift+Select, then D</span>
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

          <div className="inspector-window__section">
            <div className="inspector-window__section-title">Rotation</div>
            <div className="inspector-window__grid">
              {renderTransformValueCard("rotation", "x", transformTarget ? transformTarget.rotation[0] : null)}
              {renderTransformValueCard("rotation", "y", transformTarget ? transformTarget.rotation[1] : null)}
              {renderTransformValueCard("rotation", "z", transformTarget ? transformTarget.rotation[2] : null)}
            </div>
          </div>

          <div className="inspector-window__section">
            <div className="inspector-window__section-title">Scale</div>
            <div className="inspector-window__grid">
              {renderTransformValueCard("scale", "x", transformTarget ? transformTarget.scale[0] : null)}
              {renderTransformValueCard("scale", "y", transformTarget ? transformTarget.scale[1] : null)}
              {renderTransformValueCard("scale", "z", transformTarget ? transformTarget.scale[2] : null)}
            </div>
          </div>
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

export const ToolsWindow = memo(function ToolsWindow({
  collapsed,
  onToggleCollapsed,
  sketchModeActive,
  onSetSketchModeActive,
  activeSketchPlaneName,
  canSketch,
  activeSketchTool,
  onActivateCircleTool,
  radiusDraft,
  diameterDraft,
  onRadiusDraftChange,
  onDiameterDraftChange,
  selectedSketchCircleName,
  extrudeDepthDraft,
  onExtrudeDepthDraftChange,
  onExtrude,
  canExtrude,
  extrudeModeActive,
  liveExtrudeDepth,
  onConfirmExtrude,
  onCancelExtrude,
  onExportStl,
  canExportStl,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  sketchModeActive: boolean;
  onSetSketchModeActive: (active: boolean) => void;
  activeSketchPlaneName: string;
  canSketch: boolean;
  activeSketchTool: SketchTool;
  onActivateCircleTool: () => void;
  radiusDraft: string;
  diameterDraft: string;
  onRadiusDraftChange: (value: string) => void;
  onDiameterDraftChange: (value: string) => void;
  selectedSketchCircleName: string | null;
  extrudeDepthDraft: string;
  onExtrudeDepthDraftChange: (value: string) => void;
  onExtrude: () => void;
  canExtrude: boolean;
  extrudeModeActive: boolean;
  liveExtrudeDepth: number | null;
  onConfirmExtrude: () => void;
  onCancelExtrude: () => void;
  onExportStl: () => void;
  canExportStl: boolean;
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
          <div className="tools-window__section">
            <div className="tools-window__section-title">Sketch</div>
            <div className="tools-window__meta-row">
              <span>Plane</span>
              <span>{activeSketchPlaneName}</span>
            </div>
            <button
              className={`tools-window__action-button${
                sketchModeActive ? " tools-window__action-button--active" : ""
              }`}
              disabled={!canSketch}
              onClick={() => onSetSketchModeActive(!sketchModeActive)}
              type="button"
            >
              {sketchModeActive ? "Exit Sketch Mode" : "Start Sketch"}
            </button>
            <button
              className={`tools-window__action-button${
                activeSketchTool === "circle" ? " tools-window__action-button--active" : ""
              }`}
              disabled={!sketchModeActive}
              onClick={onActivateCircleTool}
              type="button"
            >
              Circle (Click + Drag)
            </button>
            <div className="tools-window__hint">
              Drag from plane origin to define radius.
            </div>
            <div className="tools-window__input-grid">
              <label>
                Radius
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
                Diameter
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
          </div>

          <div className="tools-window__section">
            <div className="tools-window__section-title">Extrude</div>
            <div className="tools-window__meta-row">
              <span>Profile</span>
              <span>{selectedSketchCircleName ?? "None"}</span>
            </div>
            <label className="tools-window__stacked-input">
              Depth
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
                <span>Live Depth</span>
                <span>{liveExtrudeDepth ? `${liveExtrudeDepth.toFixed(2)} mm` : "0.00 mm"}</span>
              </div>
            ) : null}
            <button
              className="tools-window__action-button tools-window__action-button--primary"
              disabled={!canExtrude}
              onClick={onExtrude}
              type="button"
            >
              {extrudeModeActive ? "Adjust in Viewport" : "Extrude (Drag)"}
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
            <button
              className="tools-window__action-button"
              disabled={!canExportStl}
              onClick={onExportStl}
              type="button"
            >
              Export to STL
            </button>
          </div>
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
  historyEntries,
  historyIndex,
  onSelectHistoryIndex,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
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
