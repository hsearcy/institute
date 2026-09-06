import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const noise3 = `
  float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}`;

/** An absorbing, broken plasma cloud; the unit-sphere boundary itself is invisible. */
export function ballLightningVolumeMaterial(seed = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }, opacity: { value: 0 }, discharge: { value: 0 }, seed: { value: seed },
      viewDirection: { value: new THREE.Vector3(0, 0, 1) },
    },
    vertexShader: `varying vec3 vLocal;void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vLocal;uniform vec3 viewDirection;uniform float time,opacity,discharge,seed;
      ${noise3}
      void main(){
        vec3 view=normalize(viewDirection);float chord=max(0.,2.*dot(vLocal,view));
        vec3 radiance=vec3(0.);float absorption=0.;
        for(int i=0;i<12;i++){
          vec3 p=vLocal-view*chord*(float(i)+.5)/12.;
          vec3 drift=vec3(time*.18,-time*.33,seed*.73);
          float n=noise(p*4.3+drift)*.72+noise(p*9.1-drift)*.28;
          float crossField=noise(p*4.7+vec3(17.3,8.1,3.7)-drift*.6);
          float shape=1.-smoothstep(.36,.94,length(p+vec3(.08*sin(p.y*5.+time),.04,0.)));
          float wisps=smoothstep(.28,.73,n)*shape;
          float density=wisps*chord*.11;
          vec3 cloud=mix(vec3(.009,.018,.037),vec3(.035,.11,.21),n);
          float vein=pow(max(0.,1.-(abs(n-.53)+abs(crossField-.48)*.6)*7.),5.)*shape;
          mat2 turn=mat2(cos(seed*.9),-sin(seed*.9),sin(seed*.9),cos(seed*.9));
          vec3 center=vec3(-.16,.1,.1);center.xz=turn*center.xz;
          vec3 coreOffset=p-center;
          float core=exp(-dot(coreOffset,coreOffset)*65.)*(.5+discharge*.7);
          vec3 second=vec3(.18,-.12,.15);second.xz=turn*second.xz;
          float knot=exp(-dot(p-second,p-second)*105.)*(.3+discharge*.45);
          radiance+=(1.-absorption)*cloud*density;
          // Radiance is emitted inside the cloud rather than multiplied by its
          // tiny shell alpha. The intersecting noise fields leave dark gaps.
          radiance+=(1.-absorption)*vec3(.12,.43,1.15)*vein*chord*(.42+discharge*.65);
          radiance+=(1.-absorption)*vec3(.45,.85,1.5)*(core*.52+knot*.3)*chord;
          absorption+=(1.-absorption)*density;
        }
        float alpha=clamp(absorption*opacity,0.,.48);
        gl_FragColor=vec4(radiance*opacity,alpha);
      }`,
    transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.FrontSide, toneMapped: false,
  });
}

/** Fine actual three-dimensional channels; rear strands are dimmed inside the cloud. */
export function ballLightningFilamentMaterial(seed = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }, opacity: { value: 0 }, discharge: { value: 0 }, seed: { value: seed },
      viewDirection: { value: new THREE.Vector3(0, 0, 1) },
    },
    vertexShader: `attribute float power;attribute float phase;varying vec3 vLocal;varying vec2 vUv;varying float vPower,vPhase;
      void main(){vLocal=position;vUv=uv;vPower=power;vPhase=phase;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vLocal;varying vec2 vUv;varying float vPower,vPhase;uniform vec3 viewDirection;uniform float time,opacity,discharge,seed;
      void main(){
        float front=smoothstep(-.45,.45,dot(vLocal,normalize(viewDirection)));
        float pulse=pow(max(0.,sin(time*12.+vPhase+seed)),14.);
        float travel=exp(-pow((fract(time*(.63+vPower*.4)+vPhase*.17)-vUv.x)*12.,2.));
        float broken=smoothstep(.04,.52,sin(vUv.x*31.+vPhase+time*2.8)*.5+.5);
        float hotKnot=exp(-pow((vUv.x-(vPower>.95?.24:.09))*15.,2.));
        hotKnot+=step(.95,vPower)*.65*exp(-pow((vUv.x-.68)*16.,2.));
        float fade=smoothstep(0.,.035,vUv.x)*(1.-smoothstep(.72,1.,vUv.x));
        float light=(.4+pulse*.7+travel*.7+discharge*.45)*vPower;
        vec3 color=mix(vec3(.06,.18,.47),vec3(.24,.69,1.4),front);
        color=mix(color,vec3(1.75,1.95,2.2),min(.95,hotKnot*(.75+pulse*.3+discharge*.3))*smoothstep(.75,1.,vPower));
        gl_FragColor=vec4(color,clamp(light*broken*fade*opacity*(.2+front*.8),0.,.96));
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false,
  });
}

/** Asymmetric channels share one indexed mesh; no independent point emitters. */
export function ballLightningFilamentGeometry(seed = 0): THREE.BufferGeometry {
  let state = (seed * 1009 + 17) | 0;
  const random = () => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
  const parts: THREE.BufferGeometry[] = [];
  const addChannel = (points: THREE.Vector3[], power: number, phase: number) => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < points.length; i++) path.add(new THREE.LineCurve3(points[i - 1], points[i]));
    const geometry = new THREE.TubeGeometry(path, points.length * 3, (power > .8 ? .018 * power : .009 * power), 4, false);
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('power', new THREE.Float32BufferAttribute(new Float32Array(count).fill(power), 1));
    geometry.setAttribute('phase', new THREE.Float32BufferAttribute(new Float32Array(count).fill(phase), 1));
    parts.push(geometry);
  };
  const primaryPaths: THREE.Vector3[][] = [];
  for (let channel = 0; channel < 6; channel++) {
    const angle = channel * channel * 1.91 + seed*.9;
    const end = new THREE.Vector3(Math.cos(angle), (random() - .5) * 1.35, Math.sin(angle)).normalize().multiplyScalar(channel < 2 ? .81 : .5 + random()*.16);
    let points: THREE.Vector3[];
    if (channel < 2) {
      // Unequal partial arcs turn through several depths rather than crossing
      // as two straight spokes. A darker gap separates the primary channels.
      const anchors = channel === 0
        ? [[-.37,.18,-.19],[-.16,.1,.1],[.05,-.04,.4],[.18,-.12,.15],[.49,-.32,-.05]]
        : [[-.16,.1,.1],[-.3,.29,-.08],[-.24,.4,-.21],[-.02,.5,-.22],[.25,.34,0]];
      const curve = new THREE.CatmullRomCurve3(anchors.map(point => new THREE.Vector3(...point).applyAxisAngle(new THREE.Vector3(0,1,0), seed*.9)));
      points = curve.getPoints(9).map((point, i) => point.add(new THREE.Vector3((random()-.5)*.055,(random()-.5)*.055,(random()-.5)*.055).multiplyScalar(Math.sin(i/9*Math.PI))));
    } else {
      const start = primaryPaths[channel % 2][2 + channel % 3].clone();
      points = Array.from({ length: 8 }, (_, i) => start.clone().lerp(end, i/7).add(new THREE.Vector3((random()-.5)*.16, (random()-.5)*.16, (random()-.5)*.16).multiplyScalar(Math.sin(i/7*Math.PI))));
    }
    addChannel(points, channel === 0 ? 1 : channel === 1 ? .9 : .5 + random()*.2, channel*2.71);
    if (channel < 2) primaryPaths.push(points);
    if (channel < 3) {
      const root = points[4];
      const tip = root.clone().add(new THREE.Vector3((random()-.5)*.37, .12+random()*.2, (random()-.5)*.37));
      addChannel([root, root.clone().lerp(tip,.4).add(new THREE.Vector3(.05,-.025,.035)), tip], .4, channel*2.71+1.3);
    }
  }
  const geometry = mergeGeometries(parts, false)!;
  parts.forEach(part => part.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function createBallLightning(seed = 0): {
  layers: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[];
  update(position: THREE.Vector3, view: THREE.Vector3, progress: number, time: number, discharge?: number): void;
} {
  const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), ballLightningVolumeMaterial(seed));
  const channels = new THREE.Mesh(ballLightningFilamentGeometry(seed), ballLightningFilamentMaterial(seed));
  cloud.scale.setScalar(.8); cloud.renderOrder = 1; channels.renderOrder = 2;
  const layers = [cloud, channels];
  const localView = new THREE.Vector3(), inverseRotation = new THREE.Quaternion();
  return {
    layers,
    update(position, view, progress, time, discharge = 0) {
      const charge = THREE.MathUtils.smoothstep(progress, 0, .13);
      const decay = 1 - THREE.MathUtils.smoothstep(progress, .75, 1);
      const opacity = charge * decay;
      const angle = time*(.45+seed*.025);
      for (const mesh of layers) {
        mesh.position.copy(position); mesh.rotation.set(.14*Math.sin(time*1.7+seed), angle, .12*Math.cos(time+seed));
        inverseRotation.copy(mesh.quaternion).invert(); localView.copy(view).applyQuaternion(inverseRotation);
        mesh.material.uniforms.viewDirection.value.copy(localView);
        mesh.material.uniforms.time.value = time;
        mesh.material.uniforms.opacity.value = opacity;
        mesh.material.uniforms.discharge.value = discharge;
      }
    },
  };
}

export function ballLightningContactMaterial(haze = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `attribute vec3 source;attribute vec3 velocity;attribute float birth;attribute float lifetime;
      uniform float time;varying float vAge;varying float vAlive;varying vec2 vUv;
      void main(){float age=max(0.,time-birth);vAge=clamp(age/lifetime,0.,1.);vAlive=step(birth,time)*(1.-step(lifetime,age));vUv=uv;
        ${haze ? 'vec3 p=vec3(position.x,0.,position.y)*(.55+vAge*.65);' : `
          vec3 forward=normalize(velocity);vec3 axis=abs(forward.y)>.9?vec3(1.,0.,0.):vec3(0.,1.,0.);
          vec3 side=normalize(cross(forward,axis));vec3 up=cross(side,forward);
          vec3 p=(side*position.x+forward*position.y+up*position.z)*(1.-vAge*.6);`}
        p=p*vAlive+source+velocity*age;
        ${haze ? '' : 'p.y=max(.04,p.y-age*age*3.);'}
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
    fragmentShader: haze ? `varying float vAge;varying float vAlive;varying vec2 vUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      void main(){float n=noise(vUv*9.+vAge*2.);float edge=1.-smoothstep(.1,.49,length(vUv-.5)+(n-.5)*.13);
        gl_FragColor=vec4(vec3(.09,.18,.27),edge*n*sin(vAge*3.14159)*vAlive*.24);}`
      : `varying float vAge;varying float vAlive;varying vec2 vUv;
        void main(){vec3 color=mix(vec3(.13,.36,.67),vec3(1.35,1.65,1.9),pow(1.-vAge,3.));
          gl_FragColor=vec4(color,(1.-vAge)*vAlive*.82);}`,
    transparent: true, blending: haze ? THREE.NormalBlending : THREE.AdditiveBlending,
    depthWrite: false, side: haze ? THREE.BackSide : THREE.DoubleSide, forceSinglePass: !haze, toneMapped: false,
  });
}

/** Four tapered fragments and one faint floor eddy per victim, in two total draws. */
export function createBallLightningContacts(capacity: number): {
  layers: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>[];
  strike(index: number, at: THREE.Vector3, direction: THREE.Vector3, time: number): void;
  update(time: number): void;
} {
  const batch = (haze: boolean) => {
    const base = haze ? new THREE.CircleGeometry(.58, 12) : new THREE.ConeGeometry(.026, .24, 3, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(base.index!.clone());
    geometry.setAttribute('position', base.getAttribute('position').clone());
    geometry.setAttribute('uv', base.getAttribute('uv').clone()); base.dispose();
    const count = Math.max(0, Math.floor(capacity)) * (haze ? 1 : 4);
    const source = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const velocities = new Float32Array(count * 3);
    for (let slot=0;slot<count;slot++) velocities[slot*3+1]=1;
    const velocity = new THREE.InstancedBufferAttribute(velocities, 3).setUsage(THREE.DynamicDrawUsage);
    const birth = new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1e9), 1).setUsage(THREE.DynamicDrawUsage);
    const lifetime = new THREE.InstancedBufferAttribute(new Float32Array(count).fill(haze ? .38 : .27), 1);
    geometry.setAttribute('source', source); geometry.setAttribute('velocity', velocity);
    geometry.setAttribute('birth', birth); geometry.setAttribute('lifetime', lifetime); geometry.instanceCount = count;
    const mesh = new THREE.Mesh(geometry, ballLightningContactMaterial(haze));
    // Shader instance origins are populated at actual hit cues, not at construction.
    mesh.frustumCulled = false;
    return { mesh, source, velocity, birth, haze };
  };
  const batches = [batch(false), batch(true)];
  return {
    layers: batches.map(item => item.mesh),
    strike(index, at, direction, time) {
      if (!Number.isInteger(index) || index < 0 || index >= capacity) return;
      for (const item of batches) {
        const count = item.haze ? 1 : 4;
        for (let fragment = 0; fragment < count; fragment++) {
          const slot = index * count + fragment, phase = index * 2.399 + fragment * 1.91;
          const velocity = item.haze ? new THREE.Vector3(Math.sin(phase)*.08,0,Math.cos(phase)*.08)
            : direction.clone().normalize().multiplyScalar(1.05+fragment*.27).add(new THREE.Vector3(Math.sin(phase)*.65,.3+fragment*.12,Math.cos(phase)*.65));
          if (!item.haze && velocity.lengthSq() < .01) velocity.set(.1,1,0);
          item.source.setXYZ(slot, at.x, item.haze ? .045 : at.y, at.z);
          item.velocity.setXYZ(slot, velocity.x, velocity.y, velocity.z);
          item.birth.setX(slot, time);
        }
        item.source.needsUpdate = item.velocity.needsUpdate = item.birth.needsUpdate = true;
      }
    },
    update(time) { for (const item of batches) item.mesh.material.uniforms.time.value = time; },
  };
}
