import { MeshStandardMaterial } from 'three';

/** Borrow the paving maps; dry stone occupies the arena, dampness its margins. */
export function gatePavingMaterial(base: MeshStandardMaterial): MeshStandardMaterial {
  const material = base.clone();
  material.name = 'Worn gate paving';
  material.roughness = .98; material.metalness = .02; material.bumpScale = .13;
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 vPavingPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vPavingPosition=(modelMatrix*vec4(transformed,1.)).xz;`);
    shader.fragmentShader = `varying vec2 vPavingPosition;
      float pavingHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float pavingNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(pavingHash(i),pavingHash(i+vec2(1.,0.)),f.x),mix(pavingHash(i+vec2(0.,1.)),pavingHash(i+vec2(1.,1.)),f.x),f.y);}
      float pavingPatch(vec2 center,vec2 radius){vec2 p=vPavingPosition-center;
        p+=vec2(pavingNoise(vPavingPosition*.7),pavingNoise(vPavingPosition.yx*.8+13.))*.8-.4;
        return 1.-smoothstep(.48,1.1,length(p/radius));}
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      // Unequal connected patches follow the wall and traffic margins. They
      // remain in world space, so the repeating cobble map cannot repeat wet spots.
      float damp=max(pavingPatch(vec2(-5.4,-3.8),vec2(1.1,2.7)),
        max(pavingPatch(vec2(5.2,1.7),vec2(.95,2.3)),pavingPatch(vec2(3.4,-5.7),vec2(1.6,.8))));
      float dry=clamp(.90+(roughnessFactor-.7)*.18,.83,.98);
      roughnessFactor=mix(dry,max(.40,roughnessFactor),damp);`);
  };
  material.customProgramCacheKey = () => 'gate-paving-world-wear-v1';
  return material;
}
