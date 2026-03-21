import { memo } from "react";
import {
  CANVAS_TOOL_OPTIONS,
  CANVAS_WORKSPACE_TITLE,
} from "../constants";
import type { CanvasTool } from "../types";

// ============================================
// CANVAS TOOLBAR
// ============================================

export const CanvasToolbar = memo(function CanvasToolbar({
  activeTool,
  onSelectTool,
  onClear,
  onInterpret,
}: {
  activeTool: CanvasTool;
  onSelectTool: (tool: CanvasTool) => void;
  onClear: () => void;
  onInterpret: () => void;
}) {
  return (
    <header className="canvas-toolbar">
      <div className="canvas-toolbar__title-group">
        <div className="canvas-toolbar__eyebrow">Workspace</div>
        <h1 className="canvas-toolbar__title">{CANVAS_WORKSPACE_TITLE}</h1>
      </div>

      <div className="canvas-toolbar__controls">
        <div className="canvas-toolbar__cluster">
          {CANVAS_TOOL_OPTIONS.map((tool) => (
            <button
              key={tool.id}
              className={`canvas-toolbar__button${
                activeTool === tool.id
                  ? " canvas-toolbar__button--active"
                  : ""
              }`}
              onClick={() => onSelectTool(tool.id)}
              type="button"
            >
              {tool.label}
            </button>
          ))}
        </div>

        <div className="canvas-toolbar__cluster">
          <button
            className="canvas-toolbar__button canvas-toolbar__button--quiet"
            onClick={onClear}
            type="button"
          >
            Clear
          </button>
          <button
            className="canvas-toolbar__button canvas-toolbar__button--accent"
            onClick={onInterpret}
            type="button"
          >
            Interpret
          </button>
        </div>
      </div>
    </header>
  );
});
