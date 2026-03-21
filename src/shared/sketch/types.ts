// ============================================
// TYPES
// ============================================

export type SketchPoint2D = {
  x: number;
  y: number;
};

export type PlaneSketchStroke = {
  id: number;
  name: string;
  points: SketchPoint2D[];
};

export type PlaneSketch = {
  planeId: string;
  strokes: PlaneSketchStroke[];
};
