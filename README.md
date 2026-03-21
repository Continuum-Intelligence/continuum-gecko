# Continuum CAD Viewport

A browser-based CAD-style 3D viewport built with **React**, **TypeScript**, **Three.js**, and **React Three Fiber**.

This project is focused on building the **core interaction layer of a modular CAD system** from scratch, including:

- CAD-style 3D camera controls
- base grid and world axes
- selectable work planes
- sub-selection for faces, edges, and vertices
- transform gizmos for move, rotate, and scale
- inspector panel
- edit history
- early dimensioning logic

The goal is to gradually evolve this into a real modular CAD engine and interface.

---

## Current Features

### Viewport
- 3D orbit camera
- smooth camera animation
- orientation cube
- CAD-style workspace feel
- base grid with axes and origin marker

### Selection
- selectable work planes
- sub-selection support for:
  - face
  - edge
  - vertex

### Transform Tools
- move gizmo
- rotate gizmo
- scale gizmo
- axis hover emphasis
- snap increments for transform operations

### Editing
- inspector panel
- rename selected object
- edit position / rotation / scale values
- history timeline
- undo / redo
- copy / cut / paste / delete

### Dimensions
- distance dimension data model
- anchor point calculation for:
  - face
  - edge
  - vertex
- distance preview / rendering groundwork

---

## Tech Stack

- **React**
- **TypeScript**
- **Three.js**
- **@react-three/fiber**
- **@react-three/drei**

---

## Project Structure

Right now the project is still heavily centered around `App.tsx`, but the logic is organized into sections such as:

- Types
- Constants
- Clone / snapshot helpers
- Transform / math helpers
- Camera helpers
- Viewport helpers
- Scene objects
- Transform gizmos
- Main scene
- Radial menus
- View cube
- Inspector / history / warnings
- App state and interaction logic

Long-term, these sections should be split into separate files/modules.

---

## Controls

### Camera
- **Mouse drag**: orbit camera
- **Orientation cube**: jump to view directions
- **Z**: camera radial menu

### Tools
- **/**: tools radial menu
- **`**: transform radial menu

### Transform
- **Move / Rotate / Scale** via transform menu or inspector
- drag gizmo handles to transform along an axis

### Edit
- **Cmd/Ctrl + Z**: undo
- **Cmd/Ctrl + Y**: redo
- **Cmd/Ctrl + C**: copy
- **Cmd/Ctrl + X**: cut
- **Cmd/Ctrl + V**: paste
- **Delete / Backspace**: delete selected object

### Dimensioning
Planned / in progress:
- select references
- create distance dimensions between edges, faces, or vertices

---

## Selection Model

The app supports multiple selection levels on a work plane:

- **object**
- **face**
- **edge**
- **vertex**

This is important because later CAD operations will depend on *what kind* of geometry the user selected.

Examples:
- selecting a **face** may allow sketching or planar operations
- selecting an **edge** may allow distance constraints or offsets
- selecting a **vertex** may allow point-based dimensions or snap references

---

## Transform System

Transform operations are currently based on:

- a selected object
- a transform mode
- an active axis
- drag state captured on pointer down
- mouse delta converted into world-space change

### Snapping
Current transform snapping includes:
- move snapping
- rotation snapping
- scale snapping

These values are defined in constants and can be tuned.

---

## History System

The scene uses a snapshot-based history model.

Each meaningful edit creates a history entry containing:
- work planes
- dimensions
- selected object state

This allows:
- undo
- redo
- timeline stepping

Current history is simple and reliable, though not yet optimized for large scenes.

---

## Dimension System

The dimension system is being built to support:

- edge-to-edge distance
- face-to-face distance
- vertex-to-vertex distance
- mixed reference dimensioning

Current implementation already includes:
- selection anchor point resolution
- world-space point extraction from plane sub-elements
- distance computation
- dimension rendering primitives

The intended workflow is CAD-style:
1. select one reference
2. select another reference
3. create a distance dimension
4. display the dimension line and value in the viewport

---

## Roadmap

### Near Term
- fully working distance dimension tool
- multi-reference selection flow
- persistent dimension rendering with better arrowheads
- cleaner selection states
- better visual feedback for hover vs selected

### Mid Term
- sketches
- sketch planes
- line / rectangle / circle tools
- constraints
- parametric dimensions
- hierarchy / scene tree
- part/object system beyond planes

### Long Term
- modular CAD engine architecture
- feature history tree
- sketch-to-solid workflow
- extrusion / cut / boolean operations
- import/export
- native engine bridge for heavier geometry work

---

## Development Notes

This project is intentionally being built in layers:

1. **Viewport**
2. **Selection**
3. **Transforms**
4. **Sub-element selection**
5. **Dimensions**
6. **Sketching**
7. **Feature modeling**

That means some parts are more mature than others. The viewport and transform feel are already getting close to “real CAD,” while dimensions and sketch workflows are still actively evolving.

---

## Known Limitations

- large amounts of logic still live in `App.tsx`
- dimensions are still early-stage
- selection flow needs refinement for multi-reference workflows
- only work planes exist as scene objects right now
- no full sketch system yet
- no solids / meshes / B-rep style geometry yet

---

## Vision

This is not just a 3D scene viewer.

The long-term goal is to build a **real modular CAD platform** where:
- geometry is structured cleanly
- interactions feel professional
- tools are extensible
- the frontend stays responsive
- the system can later connect to more advanced geometry backends

---

## Getting Started

### Install
```bash
npm install
