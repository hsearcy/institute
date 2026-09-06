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

/** One oblique fracture, intersected with the real hull before insetting. */
function crystalInteriorGeometry(hull: THREE.BufferGeometry, radius: number, height: number, seed: number): THREE.BufferGeometry {
  const normal = new THREE.Vector3(.62, .19 + Math.sin(seed * 1.7) * .025, .76).normalize();
  const plane = new THREE.Plane(normal, normal.y * height * .54);
  const positions = hull.getAttribute('position'), points: THREE.Vector3[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const add = (point: THREE.Vector3) => {
    if (!points.some(existing => existing.distanceToSquared(point) < radius * radius * 1e-10)) points.push(point.clone());
  };
  for (let face = 0; face < positions.count; face += 3) {
    for (let edge = 0; edge < 3; edge++) {
      a.fromBufferAttribute(positions, face + edge); b.fromBufferAttribute(positions, face + (edge + 1) % 3);
      const da = plane.distanceToPoint(a), db = plane.distanceToPoint(b);
      if (Math.abs(da) < 1e-7) add(a);
      if (da * db < 0) add(a.clone().lerp(b, da / (da - db)));
    }
  }
  if (points.length < 3) throw new Error('Frostfall interior plane misses its crystal hull');
  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  const u = normal.clone().cross(new THREE.Vector3(0, 1, 0)).normalize(), v = normal.clone().cross(u);
  points.sort((left, right) => Math.atan2(left.clone().sub(center).dot(v), left.clone().sub(center).dot(u))
    - Math.atan2(right.clone().sub(center).dot(v), right.clone().sub(center).dot(u)));
  for (const point of points) point.lerp(center, .16);
  const vertices: number[] = [], uv: number[] = [], rim: number[] = [];
  for (let edge = 0; edge < points.length; edge++) {
    for (const [point, depth] of [[center, 1], [points[edge], 0], [points[(edge + 1) % points.length], 0]] as const) {
      vertices.push(point.x, point.y, point.z); uv.push(point.x / radius, point.y / height + 1); rim.push(depth);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('fractureRim', new THREE.Float32BufferAttribute(rim, 1));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function frostfallCrystalMaterial(interior = false, seed = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 1 }, time: { value: 0 }, seed: { value: seed } },
    vertexShader: `varying vec3 vWorldNormal,vWorldPosition,vLocal;varying vec2 vUv;${interior ? 'attribute float fractureRim;varying float vFractureRim;' : ''}
      void main(){vec4 world=modelMatrix*vec4(position,1.);vWorldPosition=world.xyz;vWorldNormal=normalize(mat3(modelMatrix)*normal);vLocal=position;vUv=uv;${interior ? 'vFractureRim=fractureRim;' : ''}gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `varying vec3 vWorldNormal,vWorldPosition,vLocal;varying vec2 vUv;uniform float opacity,time,seed;${interior ? 'varying float vFractureRim;' : ''}
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 normal=normalize(vWorldNormal);
        vec3 view=isOrthographic?normalize(vec3(viewMatrix[0][2],viewMatrix[1][2],viewMatrix[2][2])):normalize(cameraPosition-vWorldPosition);
        if(dot(normal,view)<0.)normal=-normal;
        float facing=max(0.,dot(normal,view));float fresnel=.018+.982*pow(1.-facing,5.);
        vec3 reflected=reflect(-view,normal);
        // Fixed WORLD directions form restrained studio/environment reflections.
        // They move across the facets as a shard turns, rather than remaining
        // attached to camera-space normals. No scene transmission render.
        // The isometric camera sees vertical faces reflect the lower hemisphere.
        // A wide low environment patch catches one side, while the opposing
        // face keeps a clear darker window. The old overhead lobe missed both.
        vec3 wideReflection=normalize(vec3(reflected.x*.38,reflected.y,reflected.z));
        float cool=pow(max(0.,dot(wideReflection,normalize(vec3(-.05,-.60,.80)))),20.);
        float warm=pow(max(0.,dot(reflected,normalize(vec3(.72,.31,-.62)))),80.);
        float sky=smoothstep(.12,.85,reflected.y);
        float cloud=smoothstep(.56,.81,noise(vLocal*vec3(8.,2.3,8.)+seed*.37));
        float thickness=smoothstep(.03,.27,vUv.y)*(1.-smoothstep(.53,1.,vUv.y));
        ${interior ? `
          float lip=1.-smoothstep(0.,max(.055,fwidth(vFractureRim)*1.3),vFractureRim);
          float broken=.35+.65*smoothstep(.3,.65,noise(vLocal*24.+seed));
          float rim=lip*broken;
          vec3 color=vec3(.028,.068,.089)+vec3(.10,.19,.22)*cloud*.18;
          color+=vec3(.31,.48,.52)*rim*.45+vec3(.50,.72,.78)*cool*.45;
          gl_FragColor=vec4(color,opacity*clamp(.10+cloud*.07+rim*.23+cool*.16,.0,.56));
        ` : `
          // Clear face windows carry most of the background. Density rises at
          // grazing facets and isolated reflection patches, not every triangle.
          vec3 color=vec3(.068,.14,.175)+vec3(.035,.065,.075)*thickness+vec3(.07,.14,.18)*sky*fresnel;
          color+=vec3(.36,.60,.69)*cool*(.38+.42*thickness)+vec3(.46,.31,.17)*warm*.55;
          color+=vec3(.17,.28,.31)*cloud*.20;
          float alpha=.20+thickness*.16+fresnel*.35+cloud*.04+cool*.28+warm*.18;
          gl_FragColor=vec4(color,opacity*clamp(alpha,.0,.84));
        `}
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: interior ? THREE.DoubleSide : THREE.FrontSide, forceSinglePass: true,
  });
}

export function createFrostfallCrystal(seed = 1, scale = 1, widthScale = 1) {
  const radius = .26 * scale * widthScale, height = 1.55 * scale;
  const shell = new THREE.Mesh(frostfallCrystalGeometry(seed, radius, height), frostfallCrystalMaterial(false, seed));
  const inner = new THREE.Mesh(crystalInteriorGeometry(shell.geometry, radius, height, seed), frostfallCrystalMaterial(true, seed));
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
