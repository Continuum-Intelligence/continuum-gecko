import type { PlaneSketch, PlaneSketchStroke } from "../shared/sketch/types";

// ============================================
// TYPES
// ============================================

export type CanvasTool = "inking" | "select" | "erase";

export type CanvasAction = "clear" | "interpret";

export type CanvasPieAction = CanvasTool | CanvasAction | "none";

export type CanvasMousePosition = {
  x: number;
  y: number;
};

export type CanvasPoint = {
  x: number;
  y: number;
};

export type CanvasStroke = PlaneSketchStroke;

export type CanvasViewportState = {
  panX: number;
  panY: number;
  zoom: number;
};

export type CanvasHistoryEntry = {
  id: number;
  label: string;
  snapshot: PlaneSketch[];
};

export type CanvasWorkspaceMeta = {
  modeLabel: string;
  interpretationStatus: string;
  inputStatus: string;
};
