import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

/** Unequal mineral fracture planes, with the leading point at local zero (+Y forward). */
export function frostfallCrystalGeometry(seed = 1, radius = .26, height = 1.55): THREE.BufferGeometry {
  const random = (n: number) => { const v = Math.sin(seed * 19.37 + n * 71.13) * 43758.5453; return v - Math.floor(v); };
  const points: THREE.Vector3[] = [];
  for (let ring = 0; ring < 3; ring++) {
    const along = [.02, .25, .64][ring], width = [.58, 1, .68][ring];
    for (let side = 0; side < 6; side++) {
      const angle = side * Math.PI / 3 + .15;
      const r = radius * width * (.84 + random(side + ring * 13) * .3);
      points.push(new THREE.Vector3(Math.cos(angle) * r + along * radius * .24,
        height * (along - 1 + (random(side + ring * 17 + 71) - .5) * .08),
        Math.sin(angle) * r * (.84 + random(side + 141) * .18)));
    }
  }
  points.push(new THREE.Vector3(radius * -.12, 0, radius * .17));
  const geometry = new ConvexGeometry(points);
  const positions = geometry.getAttribute('position'), uv: number[] = [];
  for (let index = 0; index < positions.count; index++) uv.push(positions.getX(index) / radius, positions.getY(index) / height + 1);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Internal fracture sheets are actual angled surfaces, beneath a restrained glass shell. */
function crystalInteriorGeometry(radius: number, height: number): THREE.BufferGeometry {
  const points = [
    [-.50,-.76,-.15], [.40,-.61,.04], [.15,-.13,.12],
    [-.50,-.76,-.15], [.15,-.13,.12], [-.16,-.24,-.08],
    [.17,-.87,-.48], [.36,-.50,.42], [-.18,-.20,.13],
    [-.36,-.53,.30], [.46,-.38,.14], [.05,-.08,.12],
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(([x,y,z]) => [x * radius, y * height, z * radius]), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(points.flatMap(([x,y]) => [x, y + 1]), 2));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function frostfallCrystalMaterial(interior = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 1 }, time: { value: 0 } },
    vertexShader: `varying vec3 vNormal,vView,vLocal;varying vec2 vUv;
      void main(){vec4 eye=modelViewMatrix*vec4(position,1.);vView=-eye.xyz;vNormal=normalize(normalMatrix*normal);vLocal=position;vUv=uv;gl_Position=projectionMatrix*eye;}`,
    fragmentShader: `varying vec3 vNormal,vView,vLocal;varying vec2 vUv;uniform float opacity,time;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 normal=normalize(vNormal),view=normalize(vView);float facing=abs(dot(normal,view));
        float reflection=pow(max(0.,dot(reflect(-normalize(vec3(-.3,.75,1.)),normal),view)),65.);
        float side=pow(1.-facing,3.2);
        float grain=noise(vLocal*29.);
        float fissure=abs(vUv.x*.45+sin(vUv.y*11.)*.065-vUv.y*.2+.07);
        float vein=(1.-smoothstep(.003,max(.022,fwidth(fissure)*.85),fissure))*smoothstep(.12,.26,vUv.y)*(1.-smoothstep(.8,.94,vUv.y));
        ${interior ? `
          float split=abs(vUv.x+.13-sin(vUv.y*8.)*.08);
          float ridge=(1.-smoothstep(.013,.035,split))*.45;
          vec3 color=vec3(.065,.19,.25)+vec3(.24,.48,.52)*(vein*.8+ridge)+vec3(.8,.91,.94)*reflection*.55;
          gl_FragColor=vec4(color,opacity*(.18+vein*.36+ridge*.3+reflection*.3));
        ` : `
          vec3 color=vec3(.035,.075,.088)+vec3(.06,.13,.15)*(facing*.55+grain*.12);
          color+=vec3(.23,.40,.44)*side*.6+vec3(1.15,1.3,1.35)*reflection*.7;
          color+=vec3(.32,.51,.55)*vein*.36;
          gl_FragColor=vec4(color,opacity*(.37+side*.32+reflection*.18));
        `}
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: interior ? THREE.DoubleSide : THREE.FrontSide, forceSinglePass: true,
  });
}

export function createFrostfallCrystal(seed = 1, scale = 1) {
  const radius = .26 * scale, height = 1.55 * scale;
  const inner = new THREE.Mesh(crystalInteriorGeometry(radius, height), frostfallCrystalMaterial(true));
  const shell = new THREE.Mesh(frostfallCrystalGeometry(seed, radius, height), frostfallCrystalMaterial());
  inner.renderOrder = 1; shell.renderOrder = 2;
  const layers = [inner, shell], forward = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  return {
    layers,
    update(tip: THREE.Vector3, velocity: THREE.Vector3, time: number, opacity = 1) {
      direction.copy(velocity); if (direction.lengthSq() < 1e-8) direction.set(0, -1, 0); direction.normalize();
      for (const layer of layers) {
        layer.position.copy(tip); layer.quaternion.setFromUnitVectors(forward, direction);
        layer.material.uniforms.time.value = time; layer.material.uniforms.opacity.value = opacity;
      }
    },
  };
}

/** One grounded impact study: a few real splinters and a low cooling vapor bed. */
export function createFrostfallContact(seed = 1) {
  const fragments = Array.from({ length: 4 }, (_, index) => createFrostfallCrystal(seed + index + 7, .1 + index * .025));
  const material = new THREE.ShaderMaterial({
    uniforms: { age: { value: 0 }, opacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float age,opacity;
      void main(){vec2 p=(vUv-.5)*2.;float angle=atan(p.y,p.x);float radius=length(p);
        float edge=.66+sin(angle*3.+age*3.)*.09+sin(angle*7.-age*2.)*.055;
        float vapor=(1.-smoothstep(edge*.35,edge,radius))*(.7+.3*sin(p.x*9.+p.y*11.-age*5.));
        float cracks=0.;for(int i=0;i<3;i++){float a=float(i)*2.23+.3;vec2 d=vec2(cos(a),sin(a));float along=dot(p,d);float across=abs(p.x*d.y-p.y*d.x-sin(along*13.)*.022);cracks+=exp(-across*across*1800.)*smoothstep(.08,.2,along)*(1.-smoothstep(.35,.65,along));}
        gl_FragColor=vec4(vec3(.29,.47,.51)+vec3(.4,.5,.5)*cracks,opacity*(vapor*.24+cracks*.22)*smoothstep(0.,.04,age));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  });
  const vapor = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.45), material); vapor.rotation.x = -Math.PI / 2;
  const layers = [...fragments.flatMap(fragment => fragment.layers), vapor];
  const at = new THREE.Vector3(), velocity = new THREE.Vector3();
  return {
    layers,
    update(origin: THREE.Vector3, age: number, time: number) {
      for (let index = 0; index < fragments.length; index++) {
        const angle = index * 2.4 + seed, speed = .75 + index * .12;
        velocity.set(Math.cos(angle)*speed, .8 + index * .1 - age * 5, Math.sin(angle)*speed);
        at.copy(origin).add(new THREE.Vector3(Math.cos(angle)*speed*age, Math.max(.04, .06+(.8+index*.1)*age-age*age*2.5), Math.sin(angle)*speed*age));
        const scale = .1 + index * .025, up = velocity.y / velocity.length();
        at.y = Math.max(at.y, origin.y + .04 + scale * (1.62 * Math.max(0, up) + .3 * Math.sqrt(Math.max(0, 1-up*up))));
        fragments[index].update(at, velocity, time, 1-THREE.MathUtils.smoothstep(age,.22,.55));
      }
      vapor.position.copy(origin).y += .045; vapor.scale.setScalar(.55+Math.min(1,age)*.65);
      material.uniforms.age.value=age; material.uniforms.opacity.value=1-THREE.MathUtils.smoothstep(age,.35,.9);
    },
  };
}
