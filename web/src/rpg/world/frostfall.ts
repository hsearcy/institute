import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

/** Accelerate toward the actual struck surface; both endpoints are exact. */
export function sampleFrostfallFlight(from: THREE.Vector3, to: THREE.Vector3, progress: number, tip: THREE.Vector3, velocity: THREE.Vector3): void {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  tip.lerpVectors(from, to, .15 * t + .85 * t * t);
  velocity.subVectors(to, from).multiplyScalar(.15 + 1.7 * t);
}

/** Unequal mineral fracture planes, with the leading point at local zero (+Y forward). */
export function frostfallCrystalGeometry(seed = 1, radius = .26, height = 1.55): THREE.BufferGeometry {
  const random = (n: number) => { const v = Math.sin(seed * 19.37 + n * 71.13) * 43758.5453; return v - Math.floor(v); };
  const points: THREE.Vector3[] = [];
  // A sheared four-sided shard, not a round droplet with a pointed end. Unequal
  // broken tail corners and one secondary shoulder expose broad fracture faces.
  for (let ring = 0; ring < 2; ring++) {
    for (let side = 0; side < 4; side++) {
      const angle = [0, 2.12, 3.6, 5.28][side] + (random(42) - .5) * .3;
      const r = radius * (ring === 0 ? .82 : .46) * (.8 + random(side + 13) * .35);
      points.push(new THREE.Vector3(Math.cos(angle) * r + (ring ? radius * -.18 : 0),
        -height * (ring === 0 ? .76 + random(side + 71) * .24 : .24 + random(side + 91) * .12),
        Math.sin(angle) * r * (1.02 + random(side + 141) * .30)));
    }
  }
  points.push(new THREE.Vector3(radius * .76, -height * .57, radius * .48));
  points.push(new THREE.Vector3(radius * -.32, 0, radius * .17));
  const geometry = new ConvexGeometry(points);
  const positions = geometry.getAttribute('position'), uv: number[] = [], corners: number[] = [];
  for (let index = 0; index < positions.count; index++) uv.push(positions.getX(index) / radius, positions.getY(index) / height + 1);
  for (let index = 0; index < positions.count; index++) corners.push(index % 3 === 0 ? 1 : 0, index % 3 === 1 ? 1 : 0, index % 3 === 2 ? 1 : 0);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Internal fracture sheets are actual angled surfaces, beneath a restrained glass shell. */
function crystalInteriorGeometry(radius: number, height: number): THREE.BufferGeometry {
  // A dark offset core and two broken planes at different depths. Their
  // unequal spacing and values stay legible through the outer ice surface.
  const points = [
    [-.40,-.79,-.31], [.32,-.68,-.15], [.13,-.17,.02],
    [-.40,-.79,-.31], [.13,-.17,.02], [-.19,-.27,-.07],
    // One broad diagonal break stops halfway down the crystal. The clear
    // window below it exposes the darker, offset core instead of a long stripe.
    [-.56,-.70,.35], [.38,-.40,.25], [.30,-.57,.37],
    [-.56,-.70,.35], [-.31,-.76,.30], [.30,-.57,.37],
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(([x,y,z]) => [x * radius, y * height, z * radius]), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(points.flatMap(([x,y]) => [x, y + 1]), 2));
  geometry.setAttribute('planeTone', new THREE.Float32BufferAttribute([0,0,0,0,0,0,1,1,1,1,1,1], 1));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function frostfallCrystalMaterial(interior = false, seed = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 1 }, time: { value: 0 }, seed: { value: seed } },
    vertexShader: `varying vec3 vNormal,vView,vLocal;varying vec2 vUv;${interior ? 'attribute float planeTone;varying float vPlaneTone;' : 'attribute vec3 corner;varying vec3 vCorner;'}
      void main(){vec4 eye=modelViewMatrix*vec4(position,1.);vView=-eye.xyz;vNormal=normalize(normalMatrix*normal);vLocal=position;vUv=uv;${interior ? 'vPlaneTone=planeTone;' : 'vCorner=corner;'}gl_Position=projectionMatrix*eye;}`,
    fragmentShader: `varying vec3 vNormal,vView,vLocal;varying vec2 vUv;uniform float opacity,time,seed;${interior ? 'varying float vPlaneTone;' : 'varying vec3 vCorner;'}
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 normal=normalize(vNormal),view=normalize(vView);float facing=abs(dot(normal,view));
        float reflection=pow(max(0.,dot(reflect(-normalize(vec3(-.3,.75,1.)),normal),view)),65.);
        float side=pow(1.-facing,3.2);
        float grain=noise(vLocal*29.);
        float light=max(0.,dot(normal,normalize(vec3(-.35,.9,.4))));
        float cloud=smoothstep(.35,.7,noise(vLocal*vec3(7.,2.,7.)+seed*.37));
        float fissure=abs(vUv.x*.45+sin(vUv.y*11.+seed)*.065-vUv.y*.2+.07);
        float vein=(1.-smoothstep(.003,max(.022,fwidth(fissure)*.85),fissure))*smoothstep(.12,.26,vUv.y)*(1.-smoothstep(.8,.94,vUv.y));
        ${interior ? `
          vec3 color=mix(vec3(.012,.042,.065),vec3(.23,.46,.55),vPlaneTone);
          color+=vec3(.10,.21,.25)*(cloud*.2+light*.15)+vec3(.8,.91,.94)*reflection*.45;
          gl_FragColor=vec4(color,opacity*(mix(.70,.43,vPlaneTone)+cloud*.10+vein*.12+reflection*.12));
        ` : `
          vec3 aa=max(fwidth(vCorner),vec3(.0001));
          vec3 line=smoothstep(vec3(0.),aa*.7,vCorner);
          float edge=1.-min(line.x,min(line.y,line.z));
          vec3 color=vec3(.065,.145,.19)+vec3(.08,.17,.22)*(light*.7+grain*.10);
          color+=vec3(.20,.44,.55)*side*.42+vec3(.75,.95,1.05)*reflection*.55;
          color+=vec3(.30,.61,.73)*edge*pow(light,4.)*.13;
          color+=vec3(.13,.25,.30)*cloud*light*.25;
          color+=vec3(.32,.51,.55)*vein*.08;
          gl_FragColor=vec4(color,opacity*(.58+side*.15+edge*.05+reflection*.16));
        `}
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: interior ? THREE.DoubleSide : THREE.FrontSide, forceSinglePass: true,
  });
}

export function createFrostfallCrystal(seed = 1, scale = 1, widthScale = 1) {
  const radius = .26 * scale * widthScale, height = 1.55 * scale;
  const inner = new THREE.Mesh(crystalInteriorGeometry(radius, height), frostfallCrystalMaterial(true, seed));
  const shell = new THREE.Mesh(frostfallCrystalGeometry(seed, radius, height), frostfallCrystalMaterial(false, seed));
  // Each randomized exterior has different broken shoulders. Keep the internal
  // fracture sheets inside that actual volume rather than piercing the shell.
  const shellPoints = shell.geometry.getAttribute('position'), shellNormals = shell.geometry.getAttribute('normal');
  const center = new THREE.Vector3(), point = new THREE.Vector3(), normal = new THREE.Vector3(), anchor = new THREE.Vector3();
  for (let i = 0; i < shellPoints.count; i++) center.add(point.fromBufferAttribute(shellPoints, i));
  center.divideScalar(shellPoints.count);
  const innerPoints = inner.geometry.getAttribute('position');
  for (let i = 0; i < innerPoints.count; i++) {
    point.fromBufferAttribute(innerPoints, i);
    let fraction = 1;
    for (let face = 0; face < shellPoints.count; face += 3) {
      normal.fromBufferAttribute(shellNormals, face); anchor.fromBufferAttribute(shellPoints, face);
      const plane = normal.dot(anchor), outside = normal.dot(point) - plane;
      if (outside > 0) {
        const inside = normal.dot(center) - plane;
        fraction = Math.min(fraction, -inside / (outside - inside) * .97);
      }
    }
    point.lerp(center, 1 - fraction); innerPoints.setXYZ(i, point.x, point.y, point.z);
  }
  inner.geometry.computeVertexNormals(); inner.geometry.computeBoundingBox(); inner.geometry.computeBoundingSphere();
  inner.renderOrder = 1; shell.renderOrder = 2;
  const layers = [inner, shell], forward = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const vertices = shell.geometry.getAttribute('position');
  let supportRadius = radius;
  for (let i = 0; i < vertices.count; i++) supportRadius = Math.max(supportRadius, Math.hypot(vertices.getX(i), vertices.getZ(i)));
  return {
    layers, support: { behind: Math.max(height, -shell.geometry.boundingBox!.min.y), radius: supportRadius },
    update(tip: THREE.Vector3, velocity: THREE.Vector3, time: number, opacity = 1) {
      direction.copy(velocity); if (direction.lengthSq() < 1e-8) direction.set(0, -1, 0); direction.normalize();
      for (const layer of layers) {
        layer.position.copy(tip); layer.quaternion.setFromUnitVectors(forward, direction);
        layer.material.uniforms.time.value = time; layer.material.uniforms.opacity.value = opacity;
      }
    },
  };
}

export function frostfallContactMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
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
}

/** Splinters break at the struck surface; cooling vapor settles on its floor. */
export function createFrostfallContact(seed = 1, scale = 1, incomingDirection = new THREE.Vector3(0, -1, 0)) {
  // A dominant broken section carries the incoming mass. Two thin secondary
  // splinters separate quickly instead of hovering as equally bright ornaments.
  const fragments = [.48, .20, .13].map((size, index) => createFrostfallCrystal(seed + index + 7, size * scale, [1.25, .62, .45][index]));
  const incoming = incomingDirection.clone();
  if (incoming.lengthSq() < 1e-8) incoming.set(0, -1, 0);
  incoming.normalize();
  const material = frostfallContactMaterial();
  const vapor = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.45), material); vapor.rotation.x = -Math.PI / 2;
  const layers = [...fragments.flatMap(fragment => fragment.layers), vapor];
  const at = new THREE.Vector3(), velocity = new THREE.Vector3(), launch = new THREE.Vector3(), spinAxis = new THREE.Vector3();
  return {
    layers,
    update(origin: THREE.Vector3, age: number, time: number, floorY = 0) {
      for (let index = 0; index < fragments.length; index++) {
        const angle = index * 2.4 + seed, speed = [.55, 2.3, 3.0][index];
        launch.copy(incoming).multiplyScalar(2.1 + index * .35);
        launch.x += Math.cos(angle) * speed; launch.z += Math.sin(angle) * speed;
        velocity.copy(launch); velocity.y -= age * 5;
        spinAxis.set(Math.sin(angle), .12, Math.cos(angle)).normalize();
        velocity.applyAxisAngle(spinAxis, age * [1.6, -6.5, 9.2][index]);
        at.copy(origin).addScaledVector(incoming, -[.1, .68, .4][index] * scale).addScaledVector(launch, age);
        at.y -= age * age * 2.5;
        const up = velocity.y / velocity.length(), support = fragments[index].support;
        at.y = Math.max(at.y, floorY + .04 + support.behind * Math.max(0, up) + support.radius * Math.sqrt(Math.max(0, 1-up*up)));
        const fade = 1 - THREE.MathUtils.smoothstep(age, index ? .12 : .24, index ? .46 : .62);
        fragments[index].update(at, velocity, time, fade * [1, .65, .48][index]);
      }
      vapor.position.copy(origin).y = floorY + .045; vapor.scale.setScalar(.55+Math.min(1,age)*.65);
      material.uniforms.age.value=age; material.uniforms.opacity.value=1-THREE.MathUtils.smoothstep(age,.35,.9);
    },
  };
}
