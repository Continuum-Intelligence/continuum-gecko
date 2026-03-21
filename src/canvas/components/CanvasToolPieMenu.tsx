import { memo } from "react";
import { CANVAS_PIE_ITEMS } from "../constants";
import type { CanvasMousePosition, CanvasPieAction } from "../types";

// ============================================
// CANVAS TOOL PIE MENU
// ============================================

export const CanvasToolPieMenu = memo(function CanvasToolPieMenu({
  center,
  selectedAction,
}: {
  center: CanvasMousePosition;
  selectedAction: CanvasPieAction;
}) {
  return (
    <div className="canvas-tool-pie" aria-hidden="true">
      <div
        className="camera-pie-surface"
        style={{
          position: "absolute",
          left: center.x,
          top: center.y,
          width: 148,
          height: 148,
          borderRadius: "50%",
        }}
      />

      {CANVAS_PIE_ITEMS.map((item) => {
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
        Canvas
        <br />
        Tools
      </div>
    </div>
  );
});
