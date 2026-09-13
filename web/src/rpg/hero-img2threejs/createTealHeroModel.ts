import * as THREE from 'three';
import { createTealHoodedSwordsmanModel, type ProceduralModelRuntime } from './generatedTealHero';
import { createBodySurface } from './bodySurfaces';
import { createClothSurface } from './clothSurfaces';

// Current unlocked img2threejs pass: blockout. Kept isolated from the playable game until accepted.
export function createTealHeroModel():THREE.Group {
  const root=createTealHoodedSwordsmanModel({textureSize:256});
  const runtime=root.userData.sculptRuntime as ProceduralModelRuntime;
  root.updateMatrixWorld(true);
  const clay=new THREE.MeshStandardMaterial({color:0xb8b9bc,roughness:.79,metalness:0,side:THREE.DoubleSide});
  clay.name='blockout-clay';
  const discarded=new Set<THREE.Material>();
  for(const [id,mesh] of Object.entries(runtime.meshes)) {
    const part=mesh.userData.sculptComponent;
    mesh.userData.region=id;mesh.userData.partId=id;
    mesh.visible=id!=='root' && part?.level==='macro';
    for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])discarded.add(mat);
    mesh.material=clay;
    const geometry=createClothSurface(id) ?? createBodySurface(id);
    if(geometry) {
      if(id.startsWith('thigh-') || id.startsWith('boot-')) {
        const sign=id.endsWith('-l')?1:-1, positions=geometry.getAttribute('position');
        for(let i=0;i<positions.count;i++) {
          const y=positions.getY(i), offset=y>=.64?Math.max(0,(1.12-y)/.48*.09):.09+(.64-y)/.64*.05;
          positions.setX(i,positions.getX(i)+sign*offset);
        }
        geometry.computeVertexNormals();
      }
      // Surface vertices are reference-world coordinates; undo the fresh generated mesh frame once.
      geometry.applyMatrix4(mesh.matrixWorld.clone().invert());
      mesh.geometry.dispose();mesh.geometry=geometry;
    }
  }
  for(const material of discarded) {
    for(const value of Object.values(material))if(value instanceof THREE.Texture)value.dispose();
    material.dispose();
  }
  root.name='TealHero-img2threejs';
  root.userData.artProvenance={source:'07-teal-hero.png',workflow:'img2threejs 2.0.0',priorBlenderInputs:false,accepted:false,pass:'blockout'};
  return root;
}
