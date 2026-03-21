import { memo } from "react";
import {
  CANVAS_TOOL_OPTIONS,
  CANVAS_WORKSPACE_META,
} from "../constants";
import type { CanvasTool } from "../types";

// ============================================
// CANVAS SIDEBAR
// ============================================

export const CanvasSidebar = memo(function CanvasSidebar({
  activeTool,
  statusMessage,
}: {
  activeTool: CanvasTool;
  statusMessage: string;
}) {
  const activeToolMeta =
    CANVAS_TOOL_OPTIONS.find((tool) => tool.id === activeTool) ??
    CANVAS_TOOL_OPTIONS[0];

  return (
    <aside className="canvas-sidebar">
      <div className="canvas-sidebar__section">
        <div className="canvas-sidebar__eyebrow">Inspector</div>
        <div className="canvas-sidebar__title">Canvas Session</div>
      </div>

      <div className="canvas-sidebar__section">
        <div className="canvas-sidebar__section-title">Workspace</div>
        <div className="canvas-sidebar__meta-row">
          <span>Mode</span>
          <span>{CANVAS_WORKSPACE_META.modeLabel}</span>
        </div>
        <div className="canvas-sidebar__meta-row">
          <span>Input</span>
          <span>{CANVAS_WORKSPACE_META.inputStatus}</span>
        </div>
      </div>

      <div className="canvas-sidebar__section">
        <div className="canvas-sidebar__section-title">Tool</div>
        <div className="canvas-sidebar__tool-card">
          <div className="canvas-sidebar__tool-name">{activeToolMeta.label}</div>
          <div className="canvas-sidebar__tool-description">
            {activeToolMeta.description}
          </div>
        </div>
      </div>

      <div className="canvas-sidebar__section">
        <div className="canvas-sidebar__section-title">Interpretation</div>
        <div className="canvas-sidebar__tool-card">
          <div className="canvas-sidebar__tool-name">
            {CANVAS_WORKSPACE_META.interpretationStatus}
          </div>
          <div className="canvas-sidebar__tool-description">
            Placeholder area for future AI shape parsing, stroke grouping, and
            sketch-to-CAD extraction signals.
          </div>
        </div>
      </div>

      <div className="canvas-sidebar__section">
        <div className="canvas-sidebar__section-title">Status</div>
        <div className="canvas-sidebar__status">{statusMessage}</div>
      </div>
    </aside>
  );
});
