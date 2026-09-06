import * as THREE from 'three';

const floorMask = `uniform vec3 floorMask;
float novaFloor(vec2 p){return floorMask.x>.5 && abs(p.x)>4.8 && abs(p.x)<11. && abs(p.y)<4. ? 0. : 1.;}
`;

const noise = `
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fuelNoise(vec3 p){return noise3(p)*.68+noise3(p*2.13+7.1)*.32;}
`;

/** The same outward easing used by the existing Nova contact schedule. */
export function fireNovaRadius(radius: number, progress: number): number {
  return radius * 1.01 * (1 - Math.pow(1 - THREE.MathUtils.clamp(progress, 0, 1), 3));
}

export function fireNovaFrontMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { progress: { value: 0 }, time: { value: 0 }, radius: { value: 8.8 }, heat: { value: 1 }, floorMask: { value: new THREE.Vector3() } },
    vertexShader: `varying vec2 vGround;void main(){vGround=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vGround;uniform float progress,time,radius,heat;${noise}${floorMask}
    void main(){
      if(novaFloor(vec2(vGround.x,-vGround.y)+floorMask.yz)<.5)discard;
      float r=length(vGround),front=radius*1.01*(1.-pow(1.-progress,3.));
      if(abs(r-front)>1.1 || progress<=0. || progress>=1.) discard;
      float a=atan(vGround.y,vGround.x);
      float grain=fuelNoise(vec3(vGround*5.7,time*.3));
      float pocket=fuelNoise(vec3(cos(a)*5.3,sin(a)*5.3,front*.23-time*.12));
      float fineSection=noise3(vec3(cos(a)*17.7,sin(a)*17.7,front*.18));
      float section=smoothstep(.49,.66,pocket*.43+fineSection*.57);
      // Fixed world-length fragments do not stretch into clean neon arcs as
      // the front expands. Unequal ends and existing fuel gaps stay irregular.
      float arc=(a+3.141593)*max(front,.18)/.72;
      float cell=floor(arc),within=fract(arc),end=.58+hash(vec3(cell,3.,7.))*.2;
      section*=smoothstep(.05,.18,within)*(1.-smoothstep(end-.12,end,within));
      if(section<=.005) discard;
      float fracture=(grain-.5)*.1+(pocket-.5)*.42;
      float distance=r-front+fracture;
      float aa=max(fwidth(distance),.012);
      float thickness=.015+fineSection*.034;
      float crest=(1.-smoothstep(thickness,thickness+aa,abs(distance)))*section;
      float warm=exp(-abs(distance)*7.)*section*.08;
      float behind=clamp(-distance,0.,1.);
      float embers=pow(max(0.,grain-.45)*1.8,6.)*exp(-behind*4.)*step(distance,0.);
      float decay=1.-smoothstep(.48,1.,progress),birth=smoothstep(0.,.04,progress);
      vec3 light=vec3(1.9,.46,.035)*crest+vec3(1.1,.14,.008)*(warm+embers*.6);
      gl_FragColor=vec4(light*heat,(crest*.48+warm+embers*.3*section)*decay*birth);
    }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    side: THREE.DoubleSide, forceSinglePass: true,
  });
}

/** Compact ray bounds for individual curling tongues. Instancing keeps all
 * volumes in one submission and avoids undersampling a large empty annulus. */
export function fireNovaVolumeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { progress: { value: 0 }, time: { value: 0 }, radius: { value: 8.8 }, heat: { value: 1 }, viewDirection: { value: new THREE.Vector3(0, 1, 1).normalize() }, floorMask: { value: new THREE.Vector3() } },
    vertexShader: `varying vec3 vLocal,vBounds,vFlame;varying vec2 vRootXZ;varying float vAngle,vHeat,vLean;uniform float progress,radius,time;
    attribute float flameAngle,flameSeed,flameWidth,flameHeight,flameLag,flameHeat,flameLean;
    void main(){
      float front=max(.18,radius*1.01*(1.-pow(1.-progress,3.)));
      float growth=smoothstep(.15,1.8,front);
      float width=min(flameWidth,front*.14);
      float height=min(flameHeight,.35+front*.46)*(.9+.1*sin(time*11.+flameSeed*19.));
      vBounds=vec3(width+.65*min(1.,front*.35),height*.5+.025,width*.78+(flameLean+.37)*growth);
      vLocal=position*2.*vBounds;vLocal.y+=vBounds.y;
      vFlame=vec3(width,height,flameSeed);vAngle=flameAngle;vHeat=flameHeat;vLean=flameLean;
      vec3 radial=vec3(cos(flameAngle),0,sin(flameAngle)),tangent=vec3(sin(flameAngle),0,-cos(flameAngle));
      vRootXZ=radial.xz*(front-flameLag*growth);
      vec3 p=radial*(front-flameLag*growth+vLocal.z)+tangent*vLocal.x+vec3(0,vLocal.y,0);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
    }`,
    fragmentShader: `varying vec3 vLocal,vBounds,vFlame;varying vec2 vRootXZ;varying float vAngle,vHeat,vLean;uniform vec3 viewDirection;uniform float progress,time,radius,heat;${noise}${floorMask}
    void main(){
      float front=max(.18,radius*1.01*(1.-pow(1.-progress,3.)));
      vec3 radial=vec3(cos(vAngle),0,sin(vAngle)),tangent=vec3(sin(vAngle),0,-cos(vAngle));
      vec3 worldRay=-normalize(viewDirection);
      vec3 ray=vec3(dot(worldRay,tangent),worldRay.y,dot(worldRay,radial));
      vec3 safeRay=mix(vec3(-1.),vec3(1.),step(vec3(0.),ray))*max(abs(ray),vec3(.00001));
      vec3 exitDistances=(sign(safeRay)*vBounds-(vLocal-vec3(0,vBounds.y,0)))/safeRay;
      float rayLength=max(0.,min(exitDistances.x,min(exitDistances.y,exitDistances.z)));
      vec3 radiance=vec3(0.);float absorbed=0.,traveled=0.;
      // Fine integration only near the narrow channels. Coarse empty-space
      // steps keep the longer outward-curled bounds from creating stripe aliasing.
      for(int i=0;i<256;i++){
        if(traveled>=rayLength || absorbed>.98) break;
        vec3 p=vLocal+ray*(traveled+.0035);
        float growth=smoothstep(.15,1.8,front);
        float seed=vFlame.z,tongueHeight=vFlame.y;
        float rise=p.y/max(.01,tongueHeight);
        if(rise<=0. || rise>=1.) { traveled+=.08; continue; }
        float taper=pow(1.-rise,1.05)*(1.-smoothstep(.6,.98,rise)*.7);
        taper*=.6+.4*smoothstep(0.,.22,rise);
        float rootWidth=vFlame.x;
        float narrow=max(.014,rootWidth*taper);
        float leanScale=min(1.,front*.35);
        float leanSide=((seed-.5)*.75*rise+sin(rise*8.-time*8.+seed*13.)*.24*pow(rise,1.5))*leanScale;
        float leanOut=(vLean*rise+.33*sin(rise*3.14159-time*5.+seed*4.)*rise)*growth;
        float depthWidth=narrow*mix(.26,.78,smoothstep(.02,.3,rise));
        vec2 crossSection=vec2((p.x-leanSide)/narrow,(p.z-leanOut)/depthWidth);
        float radiusSquared=dot(crossSection,crossSection);
        float stepLength=min(rayLength-traveled,clamp((sqrt(radiusSquared)-1.)*min(narrow,depthWidth)*.32,.007,.1));
        traveled+=stepLength;
        float envelope=1.-smoothstep(.45,1.,radiusSquared);
        envelope*=smoothstep(0.,.035,p.y)*(1.-smoothstep(.8,1.,rise));
        if(envelope<=0. || novaFloor(floorMask.yz+vRootXZ+tangent.xz*p.x+radial.xz*p.z)<.5) continue;
        vec3 turbulence=vec3(sin(p.y*5.-time*2.)*.45,0.,cos(p.y*6.-time*2.3)*.45);
        float n=fuelNoise(vec3(p.x*6.+seed*17.,p.y*6.-time*11.,p.z*6.+seed*13.)+turbulence);
        // Gas remains visible through the curved body. Height cools its color
        // below, rather than removing fuel before it can reach the curl.
        float body=(.55+.45*smoothstep(.3,.72,n))*exp(-rise*.45);
        // Temperature is concentrated in narrow basal channels. The larger
        // gas body remains transparent and cools into tapered absorbing wisps.
        float leftSpine=-.38+.18*smoothstep(.08,.65,rise);
        float rightSpine=.34-.13*sin(rise*5.+seed*3.);
        float leftChannel=pow((crossSection.x-leftSpine)/.24,2.)+pow(crossSection.y/.75,2.);
        float rightChannel=pow((crossSection.x-rightSpine)/.21,2.)+pow(crossSection.y/.7,2.);
        float core=pow(max(0.,1.-leftChannel),2.)+pow(max(0.,1.-rightChannel),2.)*(1.-smoothstep(.28,.6,rise))*.72;
        core*=exp(-rise*.65)*(1.-smoothstep(.6,.85,rise))*(.8+n*.2);
        float smoke=smoothstep(.3,.68,n)*(.1+rise*.16);
        // One coherent concave fold separates the hot spine and cooler sheath.
        // It follows the curl instead of punching unrelated holes in the gas.
        float fold=exp(-pow((crossSection.x-.28-.1*sin(rise*7.-time*9.+seed*11.))/.28,2.));
        fold*=smoothstep(.15,.28,rise)*(1.-smoothstep(.84,.96,rise));
        float shortLick=1.-smoothstep(.56,.76,rise)*smoothstep(.38,.65,crossSection.x);
        float rootGap=exp(-pow((crossSection.x+.025)/.15,2.))*(1.-smoothstep(.18,.4,rise));
        float density=(body*.48+core*.55+smoke)*envelope*(1.-fold*.99)*(1.-rootGap*.94)*shortLick*stepLength*1.55;
        vec3 temperature=mix(vec3(3.3,.66,.055),vec3(1.2,.09,.008),smoothstep(.5,1.,rise));
        vec3 emission=temperature*body*(.28+.72*smoothstep(.08,.32,rise));
        emission+=vec3(6.5,3.2,.7)*core*vHeat;
        vec3 soot=vec3(.035,.026,.023)*smoke;
        radiance+=(1.-absorbed)*(emission*heat*vHeat+soot)*density;
        absorbed+=(1.-absorbed)*density;
      }
      float fade=smoothstep(0.,.05,progress)*(1.-smoothstep(.5,1.,progress));
      if(absorbed<.002) discard;
      gl_FragColor=vec4(radiance*fade,min(.82,absorbed)*fade);
    }`,
    transparent: true, premultipliedAlpha: true, depthWrite: false, toneMapped: false, side: THREE.FrontSide,
  });
}

export function createFireNova(radius: number, heat = 1, roomIndex = 0) {
  const front = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.3, radius * 2.3), fireNovaFrontMaterial());
  front.rotation.x = -Math.PI / 2; front.renderOrder = 1;
  const source = new THREE.BoxGeometry(1, 1, 1);
  const geometry = new THREE.InstancedBufferGeometry().copy(source as unknown as THREE.InstancedBufferGeometry); source.dispose();
  // Unequal fuel beds leave quiet sections around the blast. Each bed carries
  // one hot spine, a thinner cooler lick and low rolling gas at a different
  // depth; the cooler layers never become equal white points around a circle.
  const centers = [-2.8, -2.58, -2.29, -1.72, -1.49, -1.18, -.48, -.23, 1.04, 1.32];
  const count = centers.length * 3; geometry.instanceCount = count;
  const values = { flameAngle: [], flameSeed: [], flameWidth: [], flameHeight: [], flameLag: [], flameHeat: [], flameLean: [] } as Record<string, number[]>;
  const fract = (value: number) => value - Math.floor(value);
  const tongue = (angle: number, seed: number, width: number, height: number, lag: number, intensity: number, lean: number) => {
    values.flameAngle.push(angle); values.flameSeed.push(seed); values.flameWidth.push(width);
    values.flameHeight.push(height); values.flameLag.push(lag); values.flameHeat.push(intensity); values.flameLean.push(lean);
  };
  centers.forEach((angle, i) => {
    const seed = fract(Math.sin((i + 1) * 91.173) * 43758.5453), second = fract(Math.sin((i + 2) * 37.931) * 19283.173);
    const strength = angle > .2 && angle < 1.7 ? .72 : .88 + seed * .12;
    const bedDepth = [0, .7, .32, .18, .85, .4, .1, .72, .25, .9][i];
    tongue(angle, seed, .28 + second * .07, 1.35 + seed * .5, bedDepth + .14 + second * .25, strength, .85 + seed * .4);
    tongue(angle + .075 + seed * .045, fract(seed + .55), .19 + seed * .04, .83 + second * .34, bedDepth + .48 + seed * .23, strength * .5, 1.0 + second * .22);
    tongue(angle - .04 - second * .03, fract(seed + .81), .37 + seed * .12, .4 + second * .2, bedDepth + .6 + second * .33, strength * .22, 1.15 + seed * .18);
  });
  for (const [name, array] of Object.entries(values)) geometry.setAttribute(name, new THREE.InstancedBufferAttribute(Float32Array.from(array), 1));
  const order = Array.from({ length: count }, (_, i) => i);
  // Shader placement moves each compact box around the expanding front.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .9, 0), radius * 1.01 + 2.4);
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-radius * 1.01 - 2, 0, -radius * 1.01 - 2), new THREE.Vector3(radius * 1.01 + 2, 1.9, radius * 1.01 + 2));
  const volume = new THREE.Mesh(geometry, fireNovaVolumeMaterial()); volume.renderOrder = 2;
  const layers = [front, volume];
  for (const layer of layers) { layer.material.uniforms.radius.value = radius; layer.material.uniforms.heat.value = heat; }
  return {
    layers,
    update(origin: THREE.Vector3, view: THREE.Vector3, progress: number, time: number) {
      for (const layer of layers) {
        layer.position.copy(origin); layer.position.y = layer === front ? .035 : 0;
        layer.material.uniforms.progress.value = THREE.MathUtils.clamp(progress, 0, 1);
        layer.material.uniforms.time.value = time;
        layer.material.uniforms.floorMask.value.set(roomIndex === 3 ? 1 : 0, origin.x, origin.z + roomIndex * 20);
      }
      volume.material.uniforms.viewDirection.value.copy(view).normalize();
      // Absorbing wisps need back-to-front submission when neighboring licks
      // overlap. Sort their compact bounds without adding separate draw calls.
      const radiusNow = Math.max(.18, fireNovaRadius(radius, progress));
      const growth = THREE.MathUtils.smoothstep(radiusNow, .15, 1.8);
      const depth = (i: number) => {
        const angle = values.flameAngle[i], r = radiusNow - values.flameLag[i] * growth;
        const height = Math.min(values.flameHeight[i], .35 + radiusNow * .46) * (.9 + .1 * Math.sin(time * 11 + values.flameSeed[i] * 19));
        return r * (Math.cos(angle) * view.x + Math.sin(angle) * view.z) + height * .5 * view.y;
      };
      order.sort((a, b) => depth(a) - depth(b));
      for (const [name, array] of Object.entries(values)) {
        const attribute = geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
        for (let i = 0; i < count; i++) attribute.setX(i, array[order[i]]);
        attribute.needsUpdate = true;
      }
    },
  };
}

/** Pooled contact geometry, with three outward fragments, one brief hot point,
 * a short rough ground glow and cooling residue per target. */
export function createFireNovaContacts(capacity: number, lingering = false, roomIndex = 0) {
  const layers: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>[] = [];
  const shared = `attribute vec3 contactOrigin,contactDirection;attribute float contactStart,contactStrength;uniform float time;varying float vAge,vSeed;`;
  for (const kind of ['flash', 'splinter', 'heat', 'ash'] as const) {
    const pieces = kind === 'splinter' ? 3 : 1, count = capacity * pieces;
    const source = kind === 'flash' ? new THREE.IcosahedronGeometry(.085, 1) : kind === 'splinter' ? new THREE.TetrahedronGeometry(.085) : new THREE.CircleGeometry(1, 20);
    const geometry = new THREE.InstancedBufferGeometry().copy(source as unknown as THREE.InstancedBufferGeometry); source.dispose(); geometry.instanceCount = count;
    geometry.setAttribute('contactOrigin', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('contactDirection', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('contactStart', new THREE.InstancedBufferAttribute(new Float32Array(count).fill(-10000), 1));
    geometry.setAttribute('contactStrength', new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1));
    geometry.setAttribute('contactSeed', new THREE.InstancedBufferAttribute(Float32Array.from({ length: count }, (_, i) => i * 2.39996), 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, residueLife: { value: lingering ? 1.2 : .85 }, floorMask: { value: new THREE.Vector3(roomIndex === 3 ? 1 : 0, 0, roomIndex * 20) } },
      vertexShader: `${shared}attribute float contactSeed;varying vec2 vUv,vContactFloor;
      void main(){vAge=time-contactStart;vSeed=contactSeed;vUv=uv;
        float age=clamp(vAge,0.,1.);vec3 p=position;
        ${kind === 'flash' ? `p*=contactStrength*(.65+age*2.);p+=contactOrigin+vec3(0,.6,0);` : kind === 'splinter' ? `
          vec3 outward=normalize(vec3(contactDirection.x,0.,contactDirection.z)+vec3(.001,0.,0.));
          float angle=(fract(contactSeed*.713)-.5)*.95;vec3 side=vec3(outward.z,0.,-outward.x);
          vec3 velocity=(outward*cos(angle)+side*sin(angle))*(1.2+fract(contactSeed*.39)*2.4);
          velocity.y=.65+fract(contactSeed*.91)*.85;
          p*=.6+fract(contactSeed*.29)*.8;p.y*=1.5;p.x*=.65;
          vec3 axis=normalize(velocity+vec3(0,-age*4.,0));
          vec3 reference=abs(axis.z)>.9?vec3(0,1,0):vec3(0,0,1);vec3 right=normalize(cross(axis,reference));
          vec3 across=cross(right,axis);p=(right*p.x+axis*p.y+across*p.z)*contactStrength;
          p+=contactOrigin+vec3(0,.15,0)+velocity*age+vec3(0,-2.5*age*age,0);
          p.y=max(.045,p.y);` : `
          float expansion=${kind === 'heat' ? '.55+age*.7' : '.2+age*.75'};p=vec3(p.x,0.,p.y)*expansion*contactStrength;
          p+=contactOrigin+contactDirection*age*.25;p.y=.028;`}
        vContactFloor=p.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
      fragmentShader: `varying float vAge,vSeed;varying vec2 vUv,vContactFloor;uniform float residueLife;${noise}${floorMask}
      void main(){
        ${kind === 'heat' || kind === 'ash' ? 'if(novaFloor(vContactFloor+floorMask.yz)<.5)discard;' : ''}
        ${kind === 'flash' ? `float alpha=step(0.,vAge)*(1.-smoothstep(0.,.13,vAge));gl_FragColor=vec4(3.9,2.1,.7,alpha*.88);` : kind === 'splinter' ? `
          float alpha=step(0.,vAge)*(1.-smoothstep(.08,.38,vAge));
          float hot=exp(-vAge*(8.+fract(vSeed*.43)*7.));
          vec3 color=mix(vec3(.35,.055,.006),vec3(2.4,.75,.09),hot);gl_FragColor=vec4(color,alpha*.75);` : kind === 'heat' ? `
          float n=fuelNoise(vec3(vUv*8.,vSeed));float edge=1.-smoothstep(.08,.48,length(vUv-.5)+(n-.5)*.15);
          float alpha=step(0.,vAge)*(1.-smoothstep(.015,.24,vAge))*edge*(.055+n*.11);
          gl_FragColor=vec4(1.8,.3,.012,alpha);` : `
          float n=fuelNoise(vec3(vUv*7.,vSeed));float edge=1.-smoothstep(.2,.49,length(vUv-.5));
          float alpha=step(0.,vAge)*smoothstep(0.,.13,vAge)*(1.-smoothstep(.3,residueLife,vAge))*edge*n*.35;
          float ember=step(.9,residueLife)*pow(n,7.)*exp(-vAge*2.);
          gl_FragColor=vec4(vec3(.035,.024,.017)+vec3(2.,.2,.006)*ember,alpha);`}
      }`,
      transparent: true, blending: kind === 'ash' ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true,
    });
    const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.userData.pieces = pieces;
    mesh.renderOrder = kind === 'ash' ? 0 : kind === 'heat' ? 1 : 3;
    layers.push(mesh);
  }
  return {
    layers,
    strike(index: number, at: THREE.Vector3, direction: THREE.Vector3, time: number, strength = 1) {
      if (index < 0 || index >= capacity) return;
      for (const layer of layers) {
        const pieces = layer.userData.pieces as number;
        for (let piece = 0; piece < pieces; piece++) {
          const slot = index * pieces + piece;
          (layer.geometry.getAttribute('contactOrigin') as THREE.InstancedBufferAttribute).setXYZ(slot, ...at.toArray() as [number, number, number]);
          (layer.geometry.getAttribute('contactDirection') as THREE.InstancedBufferAttribute).setXYZ(slot, ...direction.toArray() as [number, number, number]);
          (layer.geometry.getAttribute('contactStart') as THREE.InstancedBufferAttribute).setX(slot, time);
          (layer.geometry.getAttribute('contactStrength') as THREE.InstancedBufferAttribute).setX(slot, strength);
        }
        for (const name of ['contactOrigin', 'contactDirection', 'contactStart', 'contactStrength']) (layer.geometry.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
      }
    },
    update(time: number) { for (const layer of layers) layer.material.uniforms.time.value = time; },
  };
}

/** A short authored-cast connection: heat gathers near the palm, then travels
 * down to the floor exactly when the unchanged radial release begins. */
export function createNovaIgnition() {
  const source = new THREE.CylinderGeometry(1, 1, 1, 5, 20, true);
  const geometry = new THREE.InstancedBufferGeometry().copy(source as unknown as THREE.InstancedBufferGeometry); source.dispose();
  geometry.instanceCount = 2;
  geometry.setAttribute('strandPhase', new THREE.InstancedBufferAttribute(Float32Array.from([.3, 2.5]), 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { hand: { value: new THREE.Vector3(0, 1.3, 0) }, ground: { value: new THREE.Vector3(0, .06, 0) }, bend: { value: new THREE.Vector3() }, age: { value: 0 } },
    vertexShader: `attribute float strandPhase;uniform vec3 hand,ground,bend;uniform float age;varying float vAlong,vPhase;
    void main(){
      float s=position.y+.5;vAlong=s;vPhase=strandPhase;
      vec3 control=mix(hand,ground,.42)+bend+vec3(cos(strandPhase)*.1,.07,sin(strandPhase)*.1);
      vec3 p=(1.-s)*(1.-s)*hand+2.*(1.-s)*s*control+s*s*ground;
      vec3 direction=normalize(2.*(1.-s)*(control-hand)+2.*s*(ground-control)+vec3(.0001,0,0));
      vec3 reference=abs(direction.y)>.9?vec3(1,0,0):vec3(0,1,0);
      vec3 side=normalize(cross(direction,reference)),across=cross(side,direction);
      p+=side*sin(s*13.-age*26.+strandPhase)*.075*(1.-s)+across*cos(s*9.+strandPhase)*.04*(1.-s);
      float width=(.018+.011*sin(s*3.14159))*(.75+.25*sin(strandPhase));
      width*=mix(1.,.55,smoothstep(.3,1.,s))*(strandPhase>1.?.55:1.);
      p+=(side*position.x+across*position.z)*width;
      gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
    }`,
    fragmentShader: `varying float vAlong,vPhase;uniform float age;
    void main(){
      float gather=smoothstep(0.,.08,age),release=smoothstep(.08,.17,age);
      float head=.07+.1*gather+.83*release;
      float tail=mix(.09,.2,release);
      float flame=smoothstep(head-tail-.06,head-tail,vAlong)*(1.-smoothstep(head-.025,head+.035,vAlong));
      float palm=(1.-smoothstep(.025,.12,vAlong))*gather*(1.-smoothstep(.14,.2,age));
      float life=smoothstep(0.,.025,age)*(1.-smoothstep(.18,.24,age));
      float hot=pow(max(0.,sin(vAlong*19.-age*42.+vPhase)),4.);
      vec3 color=mix(vec3(1.8,.24,.015),vec3(3.4,1.25,.19),hot);
      float secondary=vPhase>1.?.28*(1.-smoothstep(.48,.72,vAlong)):1.;
      gl_FragColor=vec4(color,max(flame,palm*.65)*life*.7*secondary);
    }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.renderOrder = 3;
  const seedMaterial = new THREE.ShaderMaterial({
    uniforms: { age: { value: 0 } },
    vertexShader: `varying vec2 vSeed;void main(){vSeed=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vSeed;uniform float age;void main(){
      vec2 p=vSeed*vec2(1.,1.2);float a=atan(p.y,p.x),r=length(p);
      float edge=.07*sin(a*5.+.4)+.045*sin(a*11.-age*13.);
      float grain=.5+.5*sin(p.x*23.+p.y*11.)*sin(p.y*19.-p.x*7.);
      float coverage=(1.-smoothstep(.42+edge,.87+edge,r))*(.35+.65*grain);
      float life=smoothstep(.155,.17,age)*(1.-smoothstep(.2,.29,age));
      vec3 color=mix(vec3(1.2,.19,.008),vec3(2.5,.7,.07),max(0.,1.-r*2.)*grain);
      gl_FragColor=vec4(color,coverage*life*.65);
    }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const seed = new THREE.Mesh(new THREE.PlaneGeometry(.44, .36), seedMaterial);
  seed.rotation.x = -Math.PI / 2; seed.renderOrder = 3;
  return { mesh, seed, update(hand: THREE.Vector3, ground: THREE.Vector3, age: number, bend?: THREE.Vector3) {
    material.uniforms.hand.value.copy(hand); material.uniforms.ground.value.copy(ground); material.uniforms.age.value = age;
    if (bend) material.uniforms.bend.value.copy(bend); else material.uniforms.bend.value.set(0, 0, 0);
    seed.position.copy(ground); seedMaterial.uniforms.age.value = age;
  } };
}
