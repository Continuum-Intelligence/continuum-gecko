import { STLExporter } from "three-stdlib";
import * as THREE from "three";

export const EXPORTABLE_GEOMETRY_FLAG = "exportableDesignGeometry";

export function exportObjectToStl(
  sourceRoot: THREE.Object3D,
  filename = "design-export.stl"
) {
  sourceRoot.updateWorldMatrix(true, true);

  const exportGroup = new THREE.Group();

  sourceRoot.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (!node.visible) return;
    if (!node.userData?.[EXPORTABLE_GEOMETRY_FLAG]) return;
    if (!(node.geometry instanceof THREE.BufferGeometry)) return;

    const transformedGeometry = node.geometry.clone();
    transformedGeometry.applyMatrix4(node.matrixWorld);

    const exportMesh = new THREE.Mesh(
      transformedGeometry,
      new THREE.MeshNormalMaterial()
    );
    exportGroup.add(exportMesh);
  });

  if (exportGroup.children.length === 0) return false;

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

  return true;
}
