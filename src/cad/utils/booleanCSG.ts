import * as THREE from "three";
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

  return base.multiply(local);
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
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  nonIndexed.computeVertexNormals();
  const positions = Array.from(nonIndexed.getAttribute("position").array as Float32Array);
  const normals = Array.from(nonIndexed.getAttribute("normal").array as Float32Array);
  const indices = Array.from({ length: positions.length / 3 }, (_, idx) => idx);
  nonIndexed.dispose();
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
    targetGeometry.dispose();
    toolGeometry.dispose();
    const meshData = geometryToMeshData(result);
    result.dispose();
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
