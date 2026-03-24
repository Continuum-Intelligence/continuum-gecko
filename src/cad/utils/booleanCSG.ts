import * as THREE from "three";
import {
  mergeVertices,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BooleanOperation, MeshGeometryData, SolidBody } from "../types";

type CsgVertex = {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  clone: () => CsgVertex;
  flip: () => void;
  interpolate: (other: CsgVertex, t: number) => CsgVertex;
};

type CsgPlane = {
  normal: THREE.Vector3;
  w: number;
  clone: () => CsgPlane;
  flip: () => void;
  splitPolygon: (
    polygon: CsgPolygon,
    coplanarFront: CsgPolygon[],
    coplanarBack: CsgPolygon[],
    front: CsgPolygon[],
    back: CsgPolygon[]
  ) => void;
};

type CsgPolygon = {
  vertices: CsgVertex[];
  plane: CsgPlane;
  clone: () => CsgPolygon;
  flip: () => void;
};

const EPSILON = 1e-5;

function getBodyTransform(body: SolidBody) {
  return body.transform ?? {
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
  };
}

function createVertex(pos: THREE.Vector3, normal: THREE.Vector3): CsgVertex {
  return {
    pos,
    normal,
    clone() {
      return createVertex(this.pos.clone(), this.normal.clone());
    },
    flip() {
      this.normal.multiplyScalar(-1);
    },
    interpolate(other: CsgVertex, t: number) {
      return createVertex(
        this.pos.clone().lerp(other.pos, t),
        this.normal.clone().lerp(other.normal, t)
      );
    },
  };
}

function createPlane(normal: THREE.Vector3, w: number): CsgPlane {
  return {
    normal,
    w,
    clone() {
      return createPlane(this.normal.clone(), this.w);
    },
    flip() {
      this.normal.multiplyScalar(-1);
      this.w *= -1;
    },
    splitPolygon(polygon, coplanarFront, coplanarBack, front, back) {
      const COPLANAR = 0;
      const FRONT = 1;
      const BACK = 2;
      const SPANNING = 3;

      let polygonType = 0;
      const types: number[] = [];
      for (let i = 0; i < polygon.vertices.length; i += 1) {
        const t = this.normal.dot(polygon.vertices[i].pos) - this.w;
        const type = t < -EPSILON ? BACK : t > EPSILON ? FRONT : COPLANAR;
        polygonType |= type;
        types.push(type);
      }

      switch (polygonType) {
        case COPLANAR: {
          (this.normal.dot(polygon.plane.normal) > 0
            ? coplanarFront
            : coplanarBack
          ).push(polygon);
          break;
        }
        case FRONT:
          front.push(polygon);
          break;
        case BACK:
          back.push(polygon);
          break;
        case SPANNING: {
          const f: CsgVertex[] = [];
          const b: CsgVertex[] = [];
          for (let i = 0; i < polygon.vertices.length; i += 1) {
            const j = (i + 1) % polygon.vertices.length;
            const ti = types[i];
            const tj = types[j];
            const vi = polygon.vertices[i];
            const vj = polygon.vertices[j];

            if (ti !== BACK) f.push(vi);
            if (ti !== FRONT) b.push(ti !== BACK ? vi.clone() : vi);

            if ((ti | tj) === SPANNING) {
              const t =
                (this.w - this.normal.dot(vi.pos)) /
                this.normal.dot(vj.pos.clone().sub(vi.pos));
              const v = vi.interpolate(vj, t);
              f.push(v);
              b.push(v.clone());
            }
          }
          if (f.length >= 3) front.push(createPolygon(f));
          if (b.length >= 3) back.push(createPolygon(b));
          break;
        }
        default:
          break;
      }
    },
  };
}

function createPlaneFromPoints(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3
): CsgPlane {
  const normal = b
    .clone()
    .sub(a)
    .cross(c.clone().sub(a))
    .normalize();
  return createPlane(normal, normal.dot(a));
}

function createPolygon(vertices: CsgVertex[]): CsgPolygon {
  const plane = createPlaneFromPoints(vertices[0].pos, vertices[1].pos, vertices[2].pos);
  return {
    vertices,
    plane,
    clone() {
      return createPolygon(this.vertices.map((vertex) => vertex.clone()));
    },
    flip() {
      this.vertices.reverse().forEach((vertex) => vertex.flip());
      this.plane.flip();
    },
  };
}

class CsgNode {
  plane: CsgPlane | null = null;

  front: CsgNode | null = null;

  back: CsgNode | null = null;

  polygons: CsgPolygon[] = [];

  constructor(polygons?: CsgPolygon[]) {
    if (polygons) this.build(polygons);
  }

  clone() {
    const node = new CsgNode();
    node.plane = this.plane && this.plane.clone();
    node.front = this.front && this.front.clone();
    node.back = this.back && this.back.clone();
    node.polygons = this.polygons.map((polygon) => polygon.clone());
    return node;
  }

  invert() {
    for (let i = 0; i < this.polygons.length; i += 1) {
      this.polygons[i].flip();
    }
    this.plane?.flip();
    this.front?.invert();
    this.back?.invert();
    const temp = this.front;
    this.front = this.back;
    this.back = temp;
  }

  clipPolygons(polygons: CsgPolygon[]): CsgPolygon[] {
    if (!this.plane) return polygons.slice();
    let front: CsgPolygon[] = [];
    let back: CsgPolygon[] = [];
    for (let i = 0; i < polygons.length; i += 1) {
      this.plane.splitPolygon(polygons[i], front, back, front, back);
    }
    if (this.front) front = this.front.clipPolygons(front);
    if (this.back) back = this.back.clipPolygons(back);
    else back = [];
    return front.concat(back);
  }

  clipTo(node: CsgNode) {
    this.polygons = node.clipPolygons(this.polygons);
    this.front?.clipTo(node);
    this.back?.clipTo(node);
  }

  allPolygons(): CsgPolygon[] {
    let polygons = this.polygons.slice();
    if (this.front) polygons = polygons.concat(this.front.allPolygons());
    if (this.back) polygons = polygons.concat(this.back.allPolygons());
    return polygons;
  }

  build(polygons: CsgPolygon[]) {
    if (polygons.length === 0) return;
    if (!this.plane) this.plane = polygons[0].plane.clone();
    const front: CsgPolygon[] = [];
    const back: CsgPolygon[] = [];
    for (let i = 0; i < polygons.length; i += 1) {
      this.plane.splitPolygon(
        polygons[i],
        this.polygons,
        this.polygons,
        front,
        back
      );
    }
    if (front.length > 0) {
      if (!this.front) this.front = new CsgNode();
      this.front.build(front);
    }
    if (back.length > 0) {
      if (!this.back) this.back = new CsgNode();
      this.back.build(back);
    }
  }
}

function csgFromGeometry(geometry: THREE.BufferGeometry): CsgPolygon[] {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const positions = nonIndexed.getAttribute("position");
  const normals = nonIndexed.getAttribute("normal");
  const polygons: CsgPolygon[] = [];

  for (let i = 0; i < positions.count; i += 3) {
    const vertices: CsgVertex[] = [];
    for (let j = 0; j < 3; j += 1) {
      const index = i + j;
      const pos = new THREE.Vector3(
        positions.getX(index),
        positions.getY(index),
        positions.getZ(index)
      );
      const normal = normals
        ? new THREE.Vector3(normals.getX(index), normals.getY(index), normals.getZ(index))
        : new THREE.Vector3(0, 0, 1);
      vertices.push(createVertex(pos, normal));
    }
    polygons.push(createPolygon(vertices));
  }

  nonIndexed.dispose();
  return polygons;
}

function geometryFromCsg(polygons: CsgPolygon[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let vertexCursor = 0;

  for (const polygon of polygons) {
    const base = polygon.vertices[0];
    for (let i = 2; i < polygon.vertices.length; i += 1) {
      const tri = [base, polygon.vertices[i - 1], polygon.vertices[i]];
      for (const vertex of tri) {
        positions.push(vertex.pos.x, vertex.pos.y, vertex.pos.z);
        normals.push(vertex.normal.x, vertex.normal.y, vertex.normal.z);
      }
      indices.push(vertexCursor, vertexCursor + 1, vertexCursor + 2);
      vertexCursor += 3;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function hashVertex(x: number, y: number, z: number, precision = 1e-5) {
  const px = Math.round(x / precision);
  const py = Math.round(y / precision);
  const pz = Math.round(z / precision);
  return `${px},${py},${pz}`;
}

function removeDegenerateAndDuplicateTriangles(
  geometry: THREE.BufferGeometry
): THREE.BufferGeometry {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const positions = nonIndexed.getAttribute("position");
  const filteredPositions: number[] = [];
  const seenTriangles = new Set<string>();

  for (let i = 0; i < positions.count; i += 3) {
    const ax = positions.getX(i);
    const ay = positions.getY(i);
    const az = positions.getZ(i);
    const bx = positions.getX(i + 1);
    const by = positions.getY(i + 1);
    const bz = positions.getZ(i + 1);
    const cx = positions.getX(i + 2);
    const cy = positions.getY(i + 2);
    const cz = positions.getZ(i + 2);

    const ab = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const ac = new THREE.Vector3(cx - ax, cy - ay, cz - az);
    const area2 = ab.clone().cross(ac).lengthSq();
    if (area2 < 1e-12) continue;

    const aHash = hashVertex(ax, ay, az);
    const bHash = hashVertex(bx, by, bz);
    const cHash = hashVertex(cx, cy, cz);
    const sortedKey = [aHash, bHash, cHash].sort().join("|");
    if (seenTriangles.has(sortedKey)) continue;
    seenTriangles.add(sortedKey);

    filteredPositions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  }

  const cleaned = new THREE.BufferGeometry();
  cleaned.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(filteredPositions, 3)
  );
  nonIndexed.dispose();
  return cleaned;
}

function snapGeometryVertices(
  geometry: THREE.BufferGeometry,
  precision = 1e-5
): THREE.BufferGeometry {
  const snapped = geometry.clone();
  const position = snapped.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    const x = Math.round(position.getX(i) / precision) * precision;
    const y = Math.round(position.getY(i) / precision) * precision;
    const z = Math.round(position.getZ(i) / precision) * precision;
    position.setXYZ(i, x, y, z);
  }
  position.needsUpdate = true;
  return snapped;
}

function cleanBooleanGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const snapped = snapGeometryVertices(geometry, 1e-5);
  const dedupedTriangles = removeDegenerateAndDuplicateTriangles(snapped);
  snapped.dispose();
  const merged = mergeVertices(dedupedTriangles, 1e-5);
  dedupedTriangles.dispose();

  merged.deleteAttribute("normal");
  merged.computeVertexNormals();
  merged.normalizeNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function booleanOperation(
  target: THREE.BufferGeometry,
  tool: THREE.BufferGeometry,
  operation: BooleanOperation
): THREE.BufferGeometry {
  const a = new CsgNode(csgFromGeometry(target));
  const b = new CsgNode(csgFromGeometry(tool));

  if (operation === "union") {
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    return geometryFromCsg(a.allPolygons());
  }

  if (operation === "subtract") {
    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    a.invert();
    return geometryFromCsg(a.allPolygons());
  }

  a.invert();
  b.clipTo(a);
  b.invert();
  a.clipTo(b);
  b.clipTo(a);
  a.build(b.allPolygons());
  a.invert();
  return geometryFromCsg(a.allPolygons());
}

function toBodyMatrix(body: SolidBody): THREE.Matrix4 {
  const transform = getBodyTransform(body);
  const worldTransform = new THREE.Matrix4().compose(
    new THREE.Vector3(...transform.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation)),
    new THREE.Vector3(...transform.scale)
  );
  const base = new THREE.Matrix4().compose(
    new THREE.Vector3(...body.planePosition),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...body.planeRotation)),
    new THREE.Vector3(...body.planeScale)
  );
  const local = new THREE.Matrix4();

  if (body.profileType === "circle") {
    local.compose(
      new THREE.Vector3(body.center[0], body.center[1], (body.direction * body.depth) / 2),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
      new THREE.Vector3(1, 1, 1)
    );
  } else if (body.profileType === "rectangle") {
    local.compose(
      new THREE.Vector3(body.center[0], body.center[1], (body.direction * body.depth) / 2),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 1, 1)
    );
  } else {
    local.compose(
      new THREE.Vector3(body.center[0], body.center[1], 0),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 1, 1)
    );
  }

  return worldTransform.multiply(base.multiply(local));
}

function toBodyGeometry(body: SolidBody): THREE.BufferGeometry | null {
  if (body.profileType === "circle") {
    const radius = Math.max(0.1, body.radius ?? 0.1);
    const geometry = new THREE.CylinderGeometry(radius, radius, body.depth, 48);
    geometry.applyMatrix4(toBodyMatrix(body));
    return geometry;
  }
  if (body.profileType === "rectangle") {
    const geometry = new THREE.BoxGeometry(
      Math.max(0.1, body.width ?? 0.1),
      Math.max(0.1, body.height ?? 0.1),
      body.depth
    );
    geometry.applyMatrix4(toBodyMatrix(body));
    return geometry;
  }
  if (body.meshData) {
    const geometry = meshDataToGeometry(body.meshData);
    geometry.applyMatrix4(toBodyMatrix(body));
    return geometry;
  }
  return null;
}

export function meshDataToGeometry(meshData: MeshGeometryData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(meshData.positions, 3)
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(meshData.normals, 3));
  geometry.setIndex(meshData.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function geometryToMeshData(geometry: THREE.BufferGeometry): MeshGeometryData {
  const serialized = geometry.clone();
  if (!serialized.getAttribute("normal")) {
    serialized.computeVertexNormals();
  }
  const positions = Array.from(
    serialized.getAttribute("position").array as Float32Array
  );
  const normals = Array.from(serialized.getAttribute("normal").array as Float32Array);
  const indexAttr = serialized.getIndex();
  const indices = indexAttr
    ? Array.from(indexAttr.array as Uint16Array | Uint32Array)
    : Array.from({ length: positions.length / 3 }, (_, idx) => idx);
  serialized.dispose();
  return { positions, normals, indices };
}

export function buildBooleanMeshData(
  targetBody: SolidBody,
  toolBody: SolidBody,
  operation: BooleanOperation
): MeshGeometryData | null {
  const targetGeometry = toBodyGeometry(targetBody);
  const toolGeometry = toBodyGeometry(toolBody);
  if (!targetGeometry || !toolGeometry) return null;

  try {
    const result = booleanOperation(targetGeometry, toolGeometry, operation);
    const cleanedResult = cleanBooleanGeometry(result);
    result.dispose();
    targetGeometry.dispose();
    toolGeometry.dispose();
    const meshData = geometryToMeshData(cleanedResult);
    cleanedResult.dispose();
    return meshData.positions.length > 0 ? meshData : null;
  } catch {
    targetGeometry.dispose();
    toolGeometry.dispose();
    return null;
  }
}

export function meshDataEqual(a?: MeshGeometryData, b?: MeshGeometryData): boolean {
  if (!a || !b) return a === b;
  if (
    a.positions.length !== b.positions.length ||
    a.normals.length !== b.normals.length ||
    a.indices.length !== b.indices.length
  ) {
    return false;
  }
  for (let i = 0; i < a.positions.length; i += 1) {
    if (Math.abs(a.positions[i] - b.positions[i]) > 1e-5) return false;
  }
  for (let i = 0; i < a.normals.length; i += 1) {
    if (Math.abs(a.normals[i] - b.normals[i]) > 1e-5) return false;
  }
  for (let i = 0; i < a.indices.length; i += 1) {
    if (a.indices[i] !== b.indices[i]) return false;
  }
  return true;
}
