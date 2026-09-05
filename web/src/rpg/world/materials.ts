import * as THREE from 'three';

/** Fine broken heat strands behind a blade, with the broad area mostly empty. */
export function bladeWakeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 1 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float time;uniform float opacity;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      void main(){float u=vUv.x,v=vUv.y;
        float n=noise(vec2(u*31.-time*2.,v*5.));
        float strand=exp(-abs(v-.8-sin(u*29.-time*4.)*.07)*24.);
        float wisps=pow(noise(vec2(u*47.-time*3.,v*9.)),4.)*(1.-v)*.9;
        float ends=smoothstep(0.,.18,u)*(1.-smoothstep(.83,1.,u));
        float body=exp(-abs(v-.78)*7.)*(.18+n*.16);
        float a=(strand*.5+wisps+body)*ends*opacity*smoothstep(.08,.6,n);
        gl_FragColor=vec4(vec3(1.65,.42,.035),a);}`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** Low, translucent ash; the noisy edge prevents a visible sprite rectangle. */
export function ashMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 1 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float time;uniform float opacity;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      void main(){vec2 p=vUv*vec2(15.,4.)-vec2(time*.4,time*.7);
        float n=noise(p)*.65+noise(p*2.3)*.35;
        float edge=smoothstep(0.,.13,vUv.y)*(1.-smoothstep(.65,1.,vUv.y));
        float a=smoothstep(.35,.7,n)*edge*opacity*.3;
        gl_FragColor=vec4(mix(vec3(.065,.056,.045),vec3(.18,.14,.095),n),a);}`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

/** Wrapped combustion on a tapered volume; local noise has no billboard edges. */
export function firePlumeMaterial(seed: number, height: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 1 }, seed: { value: seed }, height: { value: height } },
    vertexShader: `varying vec3 vLocal; varying float vHeight; uniform float time; uniform float seed; uniform float height;
      void main(){vec3 p=position;float h=clamp(p.y/height,0.,1.);vLocal=p/height;vHeight=h;
        p.x+=sin(h*7.-time*4.+seed)*h*h*height*.09;
        p.z+=cos(h*6.-time*3.3+seed)*h*h*height*.07;
        float flutter=sin(h*31.-time*7.+uv.x*12.566+seed)*height*.023*h;
        p.x+=cos(uv.x*6.283)*flutter;p.z+=sin(uv.x*6.283)*flutter;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec3 vLocal;varying float vHeight;uniform float time;uniform float opacity;uniform float seed;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      void main(){float h=vHeight;
        vec2 p=vec2(vLocal.x*24.+vLocal.z*15.+seed,h*6.-time*2.2);
        float warp=noise(p*.61+vec2(0.,time*.3));
        float broad=noise(p+vec2((warp-.5)*2.8,0.));
        float fine=noise(vec2(vLocal.z*47.-vLocal.x*31.+seed,h*15.-time*4.2));
        float fuel=broad*.68+fine*.32;
        // Zero alpha between fuel filaments cuts holes through the volume and
        // its silhouette instead of retaining a translucent solid leaf.
        float threshold=.43+h*.17;
        float tears=smoothstep(threshold,threshold+.13,fuel);
        float strands=smoothstep(.53,.77,fine)*smoothstep(threshold-.04,threshold+.05,fuel);
        float ends=smoothstep(0.,.055,h)*(1.-smoothstep(.77,1.,h));
        float hot=exp(-abs(fuel-threshold-.11)*33.)*smoothstep(.44,.76,fine);
        vec3 ember=mix(vec3(.21,.022,.004),vec3(1.75,.29,.014),smoothstep(.025,.25,h));
        vec3 c=mix(ember,vec3(2.25,.72,.1),hot*.82);
        float alpha=ends*max(tears*.74,strands*.62)*opacity;
        if(alpha<.015)discard;
        gl_FragColor=vec4(c,alpha);}`,
    transparent: true, depthWrite: false, side: THREE.FrontSide, toneMapped: false,
  });
}

/** A wide ragged sheet of combustion; unlike torch fire it has no candle silhouette. */
export function fireSheetMaterial(seed = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 1 }, seed: { value: seed }, heat: { value: 1 } },
    vertexShader: `varying vec2 vUv;uniform float time;uniform float seed;
      void main(){vUv=uv;vec3 p=position;p.x+=sin(uv.y*6.+time*4.+seed)*uv.y*.15;p.z+=sin(uv.x*8.-time*3.+seed)*uv.y*.12;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float time;uniform float opacity;uniform float seed;uniform float heat;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      float fbm(vec2 p){float n=0.,a=.55;for(int i=0;i<4;i++){n+=a*noise(p);p=p*2.08+vec2(6.3,2.9);a*=.47;}return n;}
      void main(){vec2 uv=vUv;vec2 p=vec2(uv.x*7.+seed,uv.y*3.8-time*2.3);
        float warp=fbm(p*.62+vec2(time*.2,0.));p.x+=(warp-.5)*2.5*uv.y;
        float n=fbm(p), fine=fbm(p*2.6+vec2(0.,-time));
        float fuel=(1.-uv.y)*.76+n*.9-.47;
        float tears=smoothstep(.14,.49,fine+(.8-uv.y)*.3);
        float edge=smoothstep(0.,.12,uv.x)*smoothstep(1.,.86,uv.x)*smoothstep(0.,.05,uv.y);
        float alpha=smoothstep(.0,.17,fuel)*tears*edge*opacity;
        float core=smoothstep(.23,.59,fuel)*heat;
        vec3 c=mix(vec3(.9,.075,.004),vec3(2.3,.55,.045),smoothstep(0.,.38,fuel));
        c=mix(c,vec3(2.1,.9,.12),core*.35);gl_FragColor=vec4(c,alpha);}`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** Torn feather surfaces: small hot edges inside broad, darker orange tongues. */
export function phoenixFeatherMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 1 } },
    vertexShader: `attribute float phase; varying vec2 vUv; varying float vPhase; uniform float time;
      void main(){vUv=uv;vPhase=phase;vec3 p=position;
        p.y+=sin(uv.x*13.-time*8.+phase)*.055*sin(uv.x*3.14159);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;varying float vPhase;uniform float time;uniform float opacity;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      void main(){vec2 p=vec2(vUv.x*11.-time*3.7+vPhase,vUv.y*4.);
        float n=noise(p)*.65+noise(p*2.3+time*.4)*.35;
        float across=abs(vUv.y-.5)*2.;float ragged=.62+n*.38;
        float edge=1.-smoothstep(ragged-.22,ragged,across);
        float holes=smoothstep(.27,.52,n+(1.-vUv.x)*.14);
        float ends=smoothstep(0.,.07,vUv.x)*(1.-smoothstep(.73,1.,vUv.x));
        float hot=pow(max(0.,1.-across),6.)*smoothstep(.48,.75,n);
        vec3 c=mix(vec3(.68,.045,.004),vec3(1.4,.24,.012),n);
        c=mix(c,vec3(2.1,.82,.14),hot*.72);
        gl_FragColor=vec4(c,edge*holes*ends*opacity*.82);}`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, forceSinglePass: true,
  });
}

/** Broken cloud strips absorb light; sparse charged filaments remain secondary to bolts. */
export function stormWispMaterial(color: number, luminous = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 1 }, tint: { value: new THREE.Color(color) }, luminous: { value: luminous ? 1 : 0 } },
    vertexShader: `attribute float phase;varying vec2 vUv;varying float vPhase;uniform float time;
      void main(){vUv=uv;vPhase=phase;vec3 p=position;
        p.y+=sin(uv.x*11.+phase+time*1.3)*.09*sin(uv.x*3.14159);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;varying float vPhase;uniform float time;uniform float opacity;uniform vec3 tint;uniform float luminous;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      void main(){vec2 p=vec2(vUv.x*8.+vPhase-time*.8,vUv.y*3.+sin(vUv.x*9.+time)*.3);
        float n=noise(p)*.6+noise(p*2.2)*.27+noise(p*4.8)*.13;
        float border=pow(max(0.,1.-abs(vUv.y-.5)*2.),1.8);
        float ends=smoothstep(0.,.16,vUv.x)*(1.-smoothstep(.68,1.,vUv.x));
        float broken=smoothstep(.32,.64,n);
        vec3 cloud=mix(vec3(.015,.021,.032),tint*.26,n);
        vec3 charged=tint*(.28+n*.46);
        gl_FragColor=vec4(mix(cloud,charged,luminous),border*ends*broken*opacity);}`,
    transparent: true, blending: luminous ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false, forceSinglePass: luminous,
  });
}

/** A turbulent ground-hugging combustion front, with a fine white-hot edge. */
export function novaMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { progress: { value: 0 }, time: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv; uniform float progress; uniform float time;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float a=atan(p.y,p.x);
        float front=(1.-pow(1.-progress,3.))*.94;
        float wav=sin(a*19.+time*5.)*.009+sin(a*41.-time*6.)*.006+noise(p*35.)*.012;
        float breakup=noise(vec2(a*13.+time*.8,3.7))*.65+noise(p*19.)*.35;
        float d=abs(r-front+wav);float core=exp(-d*170.)*smoothstep(.4,.74,breakup);float halo=exp(-d*35.)*.24;
        float fissure=pow(noise(p*31.+vec2(time*.2,0.)),9.)*3.;
        float inner=step(r,front)*smoothstep(front-.24,front,r)*fissure;
        float fade=1.-smoothstep(.5,1.,progress);
        vec3 c=vec3(1.8,.32,.018)*(halo+inner)+vec3(2.5,1.1,.18)*core;
        gl_FragColor=vec4(c,(core+halo+inner)*fade);}`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** Animated translucent tongues of flame, shared by torches and eruptions. */
export function flameMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float time; uniform float opacity;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      float fbm(vec2 p){float n=0.,a=.5; for(int i=0;i<4;i++){n+=noise(p)*a;p=p*2.1+vec2(4.2,1.7);a*=.5;}return n;}
      void main(){
        float y=vUv.y; float n=fbm(vUv*vec2(7.,10.)-vec2(0.,time*2.7));
        float x=abs(vUv.x-.5+sin(y*7.-time*2.)*.06*y);
        float width=pow(1.-y,.7)*(.28+n*.3);
        float edge=1.-smoothstep(width*.45,width,x);
        float alpha=edge*smoothstep(0.,.06,y)*smoothstep(1.,.55,y+n*.13)*opacity;
        float core=pow(1.-x/max(.01,width),2.)*(1.-y);
        vec3 color=mix(vec3(.85,.035,.001),vec3(1.8,.45,.02),smoothstep(.0,.55,core));
        color=mix(color,vec3(2.2,1.3,.42),smoothstep(.55,.95,core));
        gl_FragColor=vec4(color,alpha); }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** Relief and roughness are derived once from the bundled albedo, then remain
 * ordinary GPU textures. Crevices stay matte while worn stone catches light. */
export function floorRelief(image: TexImageSource): { bump: THREE.CanvasTexture; roughness: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const context = canvas.getContext('2d')!; context.filter = 'blur(1.1px)'; context.drawImage(image as CanvasImageSource, 0, 0, 1024, 1024);
  const pixels = context.getImageData(0, 0, 1024, 1024);
  const rough = document.createElement('canvas'); rough.width = rough.height = 1024;
  const roughContext = rough.getContext('2d')!, roughPixels = roughContext.createImageData(1024, 1024);
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    const value = pixels.data[offset] * .25 + pixels.data[offset + 1] * .6 + pixels.data[offset + 2] * .15;
    const height = Math.min(255, Math.max(0, (value - 22) * 3));
    pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = height;
    // Periodic broad patches remain seamless at the tile edges. Restrict damp
    // highlights to raised stone tops; dark joints stay rough and absorb light.
    const x = (offset / 4) % 1024 / 1024 * Math.PI * 2;
    const y = Math.floor(offset / 4 / 1024) / 1024 * Math.PI * 2;
    const patch = (Math.sin(x * 3 + Math.cos(y * 2)) + Math.cos(y * 2 + Math.sin(x)) + .5 * Math.sin(x * 5 - y * 3)) / 2.5;
    const coverage = Math.max(0, Math.min(1, (patch - .03) / .6));
    const top = Math.max(0, Math.min(1, (height - 70) / 100));
    const damp = coverage * coverage * (3 - 2 * coverage) * top;
    const finish = (224 - height * .18) * (1 - damp) + 80 * damp;
    roughPixels.data[offset] = roughPixels.data[offset + 1] = roughPixels.data[offset + 2] = finish;
    roughPixels.data[offset + 3] = 255;
  }
  context.putImageData(pixels, 0, 0); roughContext.putImageData(roughPixels, 0, 0);
  const bump = new THREE.CanvasTexture(canvas), roughness = new THREE.CanvasTexture(rough);
  for (const texture of [bump, roughness]) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8; }
  return { bump, roughness };
}

/** Small procedural fallback while the bundled stone surfaces load. */
export function stoneMaterial(color: number, seed = 7): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  let state = seed;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  context.fillStyle = '#8d9293'; context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6500; i++) {
    const shade = 50 + Math.floor(random() * 135);
    context.fillStyle = `rgba(${shade},${shade},${shade},${random() * .28})`;
    context.fillRect(random() * 256, random() * 256, 1 + random() * 10, 1 + random() * 4);
  }
  context.strokeStyle = '#45494b'; context.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    let x = random() * 256, y = random() * 256;
    context.beginPath(); context.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += (random() - .5) * 30; y += random() * 14; context.lineTo(x, y); }
    context.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ color, map, bumpMap: map, bumpScale: .055, roughness: .94 });
}

export function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.16, '#ffffff');
  gradient.addColorStop(.35, 'rgba(255,255,255,.4)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function waveTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#000000'; context.fillRect(0, 0, 256, 256);
  const gradient = context.createRadialGradient(128, 128, 75, 128, 128, 127);
  gradient.addColorStop(0, '#000000'); gradient.addColorStop(.35, '#111111');
  gradient.addColorStop(.62, '#ffffff'); gradient.addColorStop(.78, '#777777'); gradient.addColorStop(1, '#000000');
  context.fillStyle = gradient; context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 270; i++) {
    const angle = i / 270 * Math.PI * 2;
    const length = 9 + Math.sin(i * 9.3) * 8;
    context.strokeStyle = `rgba(255,255,255,${.2 + (Math.sin(i * 7.1) + 1) * .22})`;
    context.lineWidth = 1 + (i % 3);
    context.beginPath(); context.moveTo(128 + Math.sin(angle) * 105, 128 + Math.cos(angle) * 105);
    context.lineTo(128 + Math.sin(angle + .025) * (107 + length), 128 + Math.cos(angle + .025) * (107 + length)); context.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}
