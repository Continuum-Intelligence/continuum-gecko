import { STLExporter } from "three-stdlib";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { cleanMeshGeometry, validateWatertightGeometry } from "../cad/utils/booleanCSG";

export const EXPORTABLE_GEOMETRY_FLAG = "exportableDesignGeometry";
const BODY_ID_FLAG = "designHealthBodyId";

export function exportObjectToStl(
  sourceRoot: THREE.Object3D,
  filename = "design-export.stl"
) {
  sourceRoot.updateWorldMatrix(true, true);

  const exportGroup = new THREE.Group();
  const bodyGeometries = new Map<string, THREE.BufferGeometry[]>();
  const stagedForDisposal: THREE.BufferGeometry[] = [];

  sourceRoot.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (!node.visible) return;
    if (!node.userData?.[EXPORTABLE_GEOMETRY_FLAG]) return;
    if (!(node.geometry instanceof THREE.BufferGeometry)) return;

    const transformedGeometry = node.geometry.clone();
    transformedGeometry.applyMatrix4(node.matrixWorld);
    const cleanedGeometry = cleanMeshGeometry(transformedGeometry);
    transformedGeometry.dispose();
    stagedForDisposal.push(cleanedGeometry);

    const bodyId =
      typeof node.userData?.[BODY_ID_FLAG] === "string"
        ? (node.userData[BODY_ID_FLAG] as string)
        : node.uuid;
    const geometries = bodyGeometries.get(bodyId) ?? [];
    geometries.push(cleanedGeometry);
    bodyGeometries.set(bodyId, geometries);
  });

  bodyGeometries.forEach((geometries) => {
    if (geometries.length === 0) return;

    const mergedGeometry =
      geometries.length === 1
        ? geometries[0].clone()
        : mergeGeometries(geometries, false);
    if (!mergedGeometry) return;
    stagedForDisposal.push(mergedGeometry);

    const cleanedMerged = cleanMeshGeometry(mergedGeometry);
    stagedForDisposal.push(cleanedMerged);
    const validation = validateWatertightGeometry(cleanedMerged);
    if (!validation.isWatertight) {
      console.warn(
        "[STL Export] Non-watertight body exported",
        validation
      );
    }

    const exportMesh = new THREE.Mesh(cleanedMerged.clone(), new THREE.MeshNormalMaterial());
    exportGroup.add(exportMesh);
  });

  if (exportGroup.children.length === 0) {
    stagedForDisposal.forEach((geometry) => geometry.dispose());
    return false;
  }

  const exporter = new STLExporter();
  const stlData = exporter.parse(exportGroup);
  const blob = new Blob([stlData], { type: "model/stl" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);

  exportGroup.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    if (node.material instanceof THREE.Material) {
      node.material.dispose();
    }
  });
  stagedForDisposal.forEach((geometry) => geometry.dispose());

  return true;
}
