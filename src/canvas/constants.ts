import type { CanvasPieAction } from "./types";

// ============================================
// CONSTANTS
// ============================================

export const CANVAS_PIE_RADIUS = 78;
export const CANVAS_BOARD_SIZE_MM = 500;
export const CANVAS_GRID_MINOR_STEP_MM = 1;
export const CANVAS_GRID_MAJOR_STEP_MM = 10;
export const CANVAS_GRID_MINOR_COLOR = "#e4e7eb";
export const CANVAS_GRID_MAJOR_COLOR = "#9aa3af";
export const CANVAS_BOARD_BACKGROUND = "#f7f9fb";
export const CANVAS_BOARD_BORDER = "#c7d0da";
export const CANVAS_ZOOM_MIN = 0.5;
export const CANVAS_ZOOM_MAX = 8;
export const CANVAS_ZOOM_SENSITIVITY = 0.0014;
export const CANVAS_TOOL_LABEL_TIMEOUT_MS = 2000;

export const CANVAS_PIE_ITEMS: Array<{
  action: CanvasPieAction;
  label: string;
  x: number;
  y: number;
}> = [
  { action: "inking", label: "Inking", x: 0, y: -CANVAS_PIE_RADIUS },
  { action: "select", label: "Select", x: CANVAS_PIE_RADIUS, y: 0 },
  { action: "erase", label: "Erase", x: 0, y: CANVAS_PIE_RADIUS },
  { action: "clear", label: "Clear", x: -CANVAS_PIE_RADIUS, y: 0 },
] as const;
