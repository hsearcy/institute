import * as THREE from 'three';

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

/** Moving translucent cloud strands, wrapped around a storm funnel. */
export function stormMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 1 }, tint: { value: new THREE.Color(color) } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float time;uniform float opacity;uniform vec3 tint;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      void main(){vec2 p=vec2(vUv.x*13.+vUv.y*7.-time*1.8,vUv.y*8.-time*.7);
        float n=noise(p)*.6+noise(p*2.1)*.28+noise(p*4.3)*.12;
        float wisps=smoothstep(.37,.75,n);float edge=smoothstep(0.,.12,vUv.y)*smoothstep(1.,.72,vUv.y);
        float fine=pow(noise(p*3.+vec2(0.,time)),7.);
        gl_FragColor=vec4(tint*(.3+wisps*.85+fine),edge*(wisps*.15+fine*.45)*opacity);}`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
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

/** Relief and roughness are derived once from the scanned albedo, then remain
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
    const finish = 224 - height * .27;
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
