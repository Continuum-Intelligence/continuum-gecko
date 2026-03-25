import { useEffect } from "react";
import type {
  MousePosition,
  PieAction,
  SceneSelection,
  ToolPieAction,
  TransformMode,
} from "../types";
import { isDimensionEligibleSelection, areSelectionsEqual, dimensionExists } from "../helpers/sceneMath";

// ============================================
// KEYBOARD SHORTCUT HOOK
// ============================================

type ShortcutArgs = {
  enabled: boolean;
  mouseRef: React.RefObject<MousePosition>;
  pieCenter: MousePosition;
  toolsPieCenter: MousePosition;
  transformPieCenter: MousePosition;
  selectedAction: PieAction;
  selectedToolAction: ToolPieAction;
  hoveredTransformMode: TransformMode;
  selectedObject: SceneSelection;
  secondarySelection: SceneSelection;
  transformMode: TransformMode;
  transformDragState: unknown;
  pieOpenRef: React.RefObject<boolean>;
  pieCancelledRef: React.RefObject<boolean>;
  toolsPieOpenRef: React.RefObject<boolean>;
  toolsPieCancelledRef: React.RefObject<boolean>;
  transformPieOpenRef: React.RefObject<boolean>;
  transformPieCancelledRef: React.RefObject<boolean>;
  setSelectedAction: (value: PieAction) => void;
  setSelectedToolAction: (value: ToolPieAction) => void;
  setHoveredTransformMode: (value: TransformMode) => void;
  setPieOpen: (value: boolean) => void;
  setToolsPieOpen: (value: boolean) => void;
  setTransformPieOpen: (value: boolean) => void;
  setPieCenter: (value: MousePosition) => void;
  setToolsPieCenter: (value: MousePosition) => void;
  setTransformPieCenter: (value: MousePosition) => void;
  setTransformMode: (value: TransformMode) => void;
  setViewportWarning: (value: string | null) => void;
  applyView: (action: PieAction | "back" | "left" | "bottom") => void;
  applyToolAction: (action: ToolPieAction) => void;
  undoScene: () => void;
  redoScene: () => void;
  copySelectedObject: (selection: NonNullable<SceneSelection>) => void;
  pasteClipboardObject: () => void;
  cutSelectedObject: (selection: NonNullable<SceneSelection>) => void;
  deleteSelectedObject: (selection: NonNullable<SceneSelection>) => void;
  createDistanceDimension: (
    from: NonNullable<SceneSelection>,
    to: NonNullable<SceneSelection>
  ) => boolean;
  inspectorInputActive: () => boolean;
  dimensionsRef: React.RefObject<
    { from: SceneSelection; to: SceneSelection }[]
  >;
  onDimensionShortcut?: () => boolean;
};

export function useKeyboardShortcuts(args: ShortcutArgs) {
  useEffect(() => {
    if (!args.enabled) {
      return;
    }

    const isTextInputActive = () => {
      const activeElement = document.activeElement;
      return (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable)
      );
    };

    const updateCameraSelectionFromMouse = (
      center: MousePosition,
      current: MousePosition
    ) => {
      const dx = current.x - center.x;
      const dy = current.y - center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 28) {
        args.setSelectedAction("origin");
        return;
      }

      const angle = Math.atan2(dy, dx);
      const deg = (angle * 180) / Math.PI;

      if (deg >= -80 && deg < -10) {
        args.setSelectedAction("iso");
      } else if (deg >= -45 && deg < 45) {
        args.setSelectedAction("right");
      } else if (deg >= 45 && deg < 135) {
        args.setSelectedAction("front");
      } else if (deg >= -135 && deg < -45) {
        args.setSelectedAction("top");
      } else {
        args.setSelectedAction("origin");
      }
    };

    const updateToolSelectionFromMouse = (
      center: MousePosition,
      current: MousePosition
    ) => {
      const dx = current.x - center.x;
      const dy = current.y - center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 28) {
        args.setSelectedToolAction("none");
        return;
      }

      const angle = Math.atan2(dy, dx);
      const deg = (angle * 180) / Math.PI;

      if (deg >= -150 && deg < -30) {
        args.setSelectedToolAction("createWorkPlane");
      } else {
        args.setSelectedToolAction("none");
      }
    };

    const updateTransformSelectionFromMouse = (
      center: MousePosition,
      current: MousePosition
    ) => {
      const dx = current.x - center.x;
      const dy = current.y - center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 28) {
        args.setHoveredTransformMode(null);
        return;
      }

      const angle = Math.atan2(dy, dx);
      const deg = (angle * 180) / Math.PI;

      if (deg >= -135 && deg < -45) {
        args.setHoveredTransformMode("move");
      } else if (deg >= -45 && deg < 45) {
        args.setHoveredTransformMode("rotate");
      } else if (deg >= 45 && deg < 135) {
        args.setHoveredTransformMode("scale");
      } else {
        args.setHoveredTransformMode(null);
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      const nextMouse = { x: event.clientX, y: event.clientY };
      args.mouseRef.current = nextMouse;

      if (args.pieOpenRef.current) {
        updateCameraSelectionFromMouse(args.pieCenter, nextMouse);
      }

      if (args.toolsPieOpenRef.current) {
        updateToolSelectionFromMouse(args.toolsPieCenter, nextMouse);
      }

      if (args.transformPieOpenRef.current) {
        updateTransformSelectionFromMouse(args.transformPieCenter, nextMouse);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const inspectorInputActive =
        args.inspectorInputActive() || isTextInputActive();

      if (
        event.key === "Escape" &&
        (args.pieOpenRef.current ||
          args.toolsPieOpenRef.current ||
          args.transformPieOpenRef.current)
      ) {
        args.pieCancelledRef.current = true;
        args.toolsPieCancelledRef.current = true;
        args.transformPieCancelledRef.current = true;
        args.setPieOpen(false);
        args.setToolsPieOpen(false);
        args.setTransformPieOpen(false);
        return;
      }

      if (event.repeat) return;

      const modifierPressed = event.metaKey || event.ctrlKey;

      if (modifierPressed && !inspectorInputActive && !args.transformDragState) {
        const key = event.key.toLowerCase();

        if (key === "z") {
          event.preventDefault();
          args.undoScene();
          return;
        }

        if (key === "y") {
          event.preventDefault();
          args.redoScene();
          return;
        }

        if (key === "c") {
          event.preventDefault();
          if (args.selectedObject) {
            args.copySelectedObject(args.selectedObject);
          }
          return;
        }

        if (key === "v") {
          event.preventDefault();
          args.pasteClipboardObject();
          return;
        }

        if (key === "x") {
          event.preventDefault();
          if (args.selectedObject) {
            args.cutSelectedObject(args.selectedObject);
          }
          return;
        }
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !args.transformDragState &&
        !inspectorInputActive
      ) {
        event.preventDefault();

        if (args.selectedObject) {
          args.deleteSelectedObject(args.selectedObject);
        } else {
          args.setViewportWarning("No object selected");
        }
        return;
      }

      if (
        event.key.toLowerCase() === "d" &&
        !args.pieOpenRef.current &&
        !args.toolsPieOpenRef.current &&
        !args.transformPieOpenRef.current &&
        !args.transformDragState &&
        !inspectorInputActive
      ) {
        event.preventDefault();
        if (args.onDimensionShortcut?.()) {
          return;
        }

        if (
          !isDimensionEligibleSelection(args.selectedObject) ||
          !isDimensionEligibleSelection(args.secondarySelection)
        ) {
          args.setViewportWarning("Select two references");
          return;
        }

        if (areSelectionsEqual(args.selectedObject, args.secondarySelection)) {
          args.setViewportWarning("References must be different");
          return;
        }

        if (
          dimensionExists(
            args.dimensionsRef.current,
            args.selectedObject,
            args.secondarySelection
          )
        ) {
          args.setViewportWarning("Dimension already exists");
          return;
        }

        const created = args.createDistanceDimension(
          args.selectedObject as NonNullable<SceneSelection>,
          args.secondarySelection as NonNullable<SceneSelection>
        );

        if (created) {
          args.setViewportWarning("Distance dimension created");
        }
        return;
      }

      if (
        event.key.toLowerCase() === "z" &&
        !args.toolsPieOpenRef.current &&
        !args.transformPieOpenRef.current &&
        !args.transformDragState
      ) {
        args.setPieCenter(args.mouseRef.current);
        args.setSelectedAction("origin");
        args.pieCancelledRef.current = false;
        args.setPieOpen(true);
        return;
      }

      if (
        event.key === "/" &&
        !args.pieOpenRef.current &&
        !args.transformPieOpenRef.current &&
        !args.transformDragState
      ) {
        event.preventDefault();
        args.setToolsPieCenter(args.mouseRef.current);
        args.setSelectedToolAction("none");
        args.toolsPieCancelledRef.current = false;
        args.setToolsPieOpen(true);
        return;
      }

      if (
        event.key === "`" &&
        args.selectedObject &&
        !args.pieOpenRef.current &&
        !args.toolsPieOpenRef.current &&
        !args.transformDragState
      ) {
        args.setTransformPieCenter(args.mouseRef.current);
        args.setHoveredTransformMode(args.transformMode);
        args.transformPieCancelledRef.current = false;
        args.setTransformPieOpen(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "z") {
        const shouldApplyView =
          args.pieOpenRef.current && !args.pieCancelledRef.current;

        args.setPieOpen(false);
        args.pieCancelledRef.current = false;

        if (shouldApplyView) {
          args.applyView(args.selectedAction);
        }
      }

      if (event.key === "/") {
        event.preventDefault();
        const shouldApplyTool =
          args.toolsPieOpenRef.current && !args.toolsPieCancelledRef.current;

        args.setToolsPieOpen(false);
        args.toolsPieCancelledRef.current = false;

        if (shouldApplyTool) {
          args.applyToolAction(args.selectedToolAction);
        }
      }

      if (event.key === "`") {
        const shouldApplyTransform =
          args.transformPieOpenRef.current &&
          !args.transformPieCancelledRef.current &&
          args.selectedObject;

        args.setTransformPieOpen(false);
        args.transformPieCancelledRef.current = false;

        if (shouldApplyTransform) {
          args.setTransformMode(args.hoveredTransformMode);
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [args]);
}
