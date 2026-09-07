import {chromium} from '/home/houston/git/institute/web/node_modules/@playwright/test/index.mjs';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='/home/houston/git/institute',label=process.env.QA_LABEL||'portal-abutments-native-v3-recovery2',profile='rpg-playtest';
const db='/tmp/'+label+'.db',logs=[],errors=[],report={label,db,errors};
const api=spawn('bun',['--no-env-file','scripts/rpg-local-server.ts'],{cwd:root,env:{...process.env,RPG_TEST_DB:db,RPG_TEST_PORT:'8959'},stdio:['ignore','pipe','pipe']});
const vite=spawn('node',[root+'/tmp/rpg-portal-facade-server.mjs'],{cwd:root+'/web',env:{...process.env,TUTOR_PROXY_TARGET:'http://127.0.0.1:8959',VITE_PROFILE_ID:profile},stdio:['ignore','pipe','pipe']});
for(const child of [api,vite])for(const stream of [child.stdout,child.stderr])stream.on('data',x=>logs.push(String(x)));
let browser,context,page,preview,previewBefore;
const wait=async url=>{for(let n=0;n<150;n++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Server unavailable '+url);};
try{
 await Promise.all([wait('http://127.0.0.1:8959/health'),wait('http://127.0.0.1:5249/')]);
 await fetch('http://127.0.0.1:8959/rpg/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profileId:profile,regionId:'embercrypt'})});
 browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
 preview=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://127.0.0.1:5240/'));
 if(preview){previewBefore=await preview.evaluate(()=>{const w=__game.world;const s={state:structuredClone(__game.state),running:!!w.frame};cancelAnimationFrame(w.frame);w.frame=0;return s;});report.previewBefore=previewBefore;}
 context=await browser.newContext({viewport:{width:1440,height:900},screen:{width:1440,height:900},deviceScaleFactor:1});page=await context.newPage();
 await context.route('**/assets/rpg/portal-candidate.glb',route=>route.fulfill({path:process.env.COMPOSITION_V7==='1'?root+'/tmp/portal-composition-v7-parts.glb':process.env.COMPOSITION_V6==='1'?root+'/tmp/portal-composition-v6-parts.glb':process.env.COMPOSITION_V5==='1'?root+'/tmp/portal-composition-v5-parts.glb':process.env.COMPOSITION_V4==='1'?root+'/tmp/portal-composition-v4-parts.glb':root+'/tmp/portal-abutments-bake-v3-recovery2/'+(process.env.COMPOSITION_V2==='1'?'composition-parts.glb':'worn-pier-review.glb'),contentType:'model/gltf-binary'}));
 if(process.env.PAVING==='1')await context.route('**/assets/rpg/paving-candidate.glb',route=>route.fulfill({path:root+'/tmp/paving-strip-v3-native.glb',contentType:'model/gltf-binary'}));
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()+' '+r.failure()?.errorText));
 await page.addInitScript(()=>localStorage.setItem('institute:rpg:muted','true'));await page.goto('http://127.0.0.1:5249/');
 await page.waitForFunction(()=>!!window.__game?.world?.loadedAt&&!__game.busy,undefined,{timeout:90000});
 await page.locator('#rpg-dialog-content [data-action="begin"]').click();
 for(let n=0;n<200;n++){const demo=page.getByRole('button',{name:'Let me try',exact:true});if(await demo.isVisible())await demo.click();if(await page.evaluate(()=>!!__game.session&&!__game.busy&&!__game.panel))break;await page.waitForTimeout(100);}
 await page.evaluate(()=>{cancelAnimationFrame(__game.world.frame);__game.world.frame=0;});
 report.renderer=await page.evaluate(()=>{const w=__game.world,gl=w.renderer.getContext(),d=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),diagnostics:w.diagnostics};});
 await page.screenshot({path:root+'/tmp/'+label+'-before.png'});
 report.assembly=await page.evaluate(async ({compositionV2,compositionV3,compositionV4,compositionV5,compositionV6})=>{
  const w=__game.world;
  const resource=pattern=>performance.getEntriesByType('resource').find(r=>pattern.test(r.name))?.name;
  const threeURL=resource(/\/three\.js\?/),loaderURL=resource(/GLTFLoader/);
  if(!threeURL||!loaderURL)throw Error('Loaded Three/GLTF module URLs missing');
  const THREE=await import(threeURL),{GLTFLoader}=await import(loaderURL),{getRoomLayout}=await import('/src/rpg/world/roomLayout.ts');
  const gltf=await new GLTFLoader().loadAsync('/assets/rpg/portal-candidate.glb');
  gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(compositionV5&&o.material.name.startsWith('Portal_Fracture_Control')){const m=w.materials.wall.clone();m.vertexColors=false;m.userData={...m.userData,fractureStudy:true};o.material=m;}}});
  const part=prefix=>{const matches=gltf.scene.children.filter(o=>o.name.startsWith(prefix));if(matches.length!==1)throw Error('Expected one portal part '+prefix+'; got '+matches.length);return matches[0];};w.models.set('__portalCandidate',compositionV2?part('Portal_LoweredOuterWings'):gltf.scene);if(compositionV2)w.models.set('__portalAlcove',part('Portal_AlcoveSurround'));w.roomCutaway.clear();
  const {installFacadeStudy}=await import(compositionV6?'/@fs/home/houston/git/institute/tmp/rpg-portal-composition-v6.js':compositionV4?'/@fs/home/houston/git/institute/tmp/rpg-portal-composition-v4.js':compositionV3?'/@fs/home/houston/git/institute/tmp/rpg-portal-composition-v3.js':compositionV2?'/@fs/home/houston/git/institute/tmp/rpg-portal-composition-v2.js':'/@fs/home/houston/git/institute/tmp/rpg-portal-abutments-candidate.js');
  const result=await installFacadeStudy(w,THREE,getRoomLayout);
  window.portalStudy={THREE,w};return result;
 },{compositionV2:process.env.COMPOSITION_V2==='1',compositionV3:process.env.COMPOSITION_V3==='1',compositionV4:process.env.COMPOSITION_V4==='1',compositionV5:process.env.COMPOSITION_V5==='1',compositionV6:process.env.COMPOSITION_V6==='1'});
 await page.screenshot({path:root+'/tmp/'+label+'-assembly.png'});
 if(process.env.MATCHED_STONE==='1'){
  report.material=await page.evaluate(async()=>{
   const {w,THREE}=portalStudy,loader=new THREE.TextureLoader();
   const [map,height,roughness]=await Promise.all([
    '/@fs/home/houston/git/institute/tmp/portal-wall-surface-v1/albedo.png',
    '/@fs/home/houston/git/institute/scripts/blender/sources/rock-face-03/Displacement.jpg',
    '/@fs/home/houston/git/institute/tmp/portal-wall-surface-v1/roughness.png'
   ].map(url=>loader.loadAsync(url)));
   map.colorSpace=THREE.SRGBColorSpace;
   for(const t of [map,height,roughness]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;}
   w.roomCutaway.clear();
   let changed=0;for(const group of w.propGroup.children.filter(o=>o.userData.facadeCandidate)){
    const mats=new Set([group.children.at(-1).material]);group.traverse(o=>{if(o.isMesh&&o.material.userData.fractureStudy)mats.add(o.material);});
    for(const mat of mats){mat.map=map;mat.bumpMap=height;mat.bumpScale=.011;mat.roughnessMap=roughness;mat.roughness=1;mat.color.setRGB(.5695,.5665,.5275);mat.needsUpdate=true;}changed++;
   }
   w.roomCutaway.prepare([...w.floorGroup.children,...w.propGroup.children]);w.roomCutaway.update(w.cameraTarget.z);w.scene.updateMatrixWorld(true);w.renderer.shadowMap.needsUpdate=true;w.renderer.info.reset();w.composer.render(0);
   return {changed,diagnostics:w.diagnostics};
  });
  await page.screenshot({path:root+'/tmp/'+label+'-matched.png'});
 }

 if(process.env.PAVING==='1'){
  report.paving=await page.evaluate(async drySurface=>{
   const {w,THREE}=portalStudy;const pavingSurface=drySurface?w.floorGroup.children.find(o=>o.userData.room===0&&o.userData.floorSurface)?.material:w.materials.floor;if(!pavingSurface)throw Error('Existing room floor material not found');const loaderURL=performance.getEntriesByType('resource').find(r=>/GLTFLoader/.test(r.name))?.name;const {GLTFLoader}=await import(loaderURL);const gltf=await new GLTFLoader().loadAsync('/assets/rpg/paving-candidate.glb');
   let maxWorldUVError=0;const converted=new Set();gltf.scene.traverse(o=>{if(!o.isMesh||!o.material.name.startsWith('Paving_Registered_Surface'))return;const uv=o.geometry.attributes.uv,p=o.geometry.attributes.position;if(!converted.has(uv)){if(o.material.map.flipY!==pavingSurface.map.flipY)for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));converted.add(uv);uv.needsUpdate=true;}for(let i=0;i<uv.count;i++)maxWorldUVError=Math.max(maxWorldUVError,Math.abs(uv.getX(i)-p.getX(i)/4.8),Math.abs(uv.getY(i)-p.getZ(i)/4.8));});if(maxWorldUVError>1e-6)throw Error('Paving native UV phase mismatch '+maxWorldUVError);
   const placements=[[-9.6,-.05,-4.8],[4.8,-.05,0]],bounds=[];
   for(const position of placements){const obj=gltf.scene.clone(true);obj.position.set(...position);obj.userData={room:0,pavingStudy:true};obj.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;if(o.material.name.startsWith('Paving_Registered_Surface'))o.material=pavingSurface;}});w.floorGroup.add(obj);bounds.push(new THREE.Box3().setFromObject(obj).toArray?.()??{min:new THREE.Box3().setFromObject(obj).min.toArray(),max:new THREE.Box3().setFromObject(obj).max.toArray()});}
   w.scene.updateMatrixWorld(true);w.renderer.shadowMap.needsUpdate=true;w.composer.render(0);return {placements,bounds,maxWorldUVError,surface:{name:pavingSurface.name,roughness:pavingSurface.roughness,metalness:pavingSurface.metalness,roughnessMap:!!pavingSurface.roughnessMap},scope:'Geometry/phase study; GLTF/native texture V convention reconciled, existing native floor top material, constant edge/mortar controls'};
  },process.env.PAVING_DRY==='1');
  await page.screenshot({path:root+'/tmp/'+label+'-paving.png'});
  if(process.env.PAVING_APRON==='1'){
   report.pavingApron=await page.evaluate(()=>{
    const {w,THREE}=portalStudy;let source;
    for(const root of w.sceneryMeshes)root.traverse(o=>{if(o.isMesh&&o.material.name==='Gate masonry dust')source=o.material;});
    if(!source)throw Error('Existing gate dust material missing');
    const material=source.clone();material.opacity=.48;const cx=-8.05,cz=-1.9,rx=1.7,rz=1.48,vertices=[cx,-.047,cz],uv=[cx/4.8,cz/4.8],maskUV=[.5,.5],indices=[];
    for(let i=0;i<24;i++){const a=i/24*Math.PI*2,r=.86+.08*Math.sin(i*2.17)+.06*Math.cos(i*1.31),x=cx+Math.cos(a)*rx*r,z=cz+Math.sin(a)*rz*r;vertices.push(x,-.047,z);uv.push(x/4.8,z/4.8);maskUV.push((x-cx)/rx*.5+.5,(z-cz)/rz*.5+.5);indices.push(0,(i+1)%24+1,i+1);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('uv1',new THREE.Float32BufferAttribute(maskUV,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Array(vertices.length).fill(1),3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const apron=new THREE.Mesh(geometry,material);apron.receiveShadow=true;apron.userData={room:0,pavingApronStudy:true};w.floorGroup.add(apron);w.scene.updateMatrixWorld(true);w.renderer.shadowMap.needsUpdate=true;w.composer.render(0);return {material:source.name,opacity:material.opacity,bounds:[cx-rx,cx+rx,cz-rz,cz+rz],scope:'Visible left strip contact only; existing gate dust surface and irregular masked apron, no collision changes'};
   });
   await page.screenshot({path:root+'/tmp/'+label+'-paving-contact.png'});
  }
 }

 await page.evaluate(()=>{const {w,THREE}=portalStudy;const focus=new THREE.Vector3(0,2.8,-9.4);w.camera.position.add(focus.sub(w.cameraTarget));w.camera.zoom*=1.4;w.camera.updateProjectionMatrix();w.camera.updateMatrixWorld();w.composer.render(0);});
 await page.screenshot({path:root+'/tmp/'+label+'-assembly-detail.png'});
 if(process.env.PORTAL_AO_CONTROL==='1'){
  report.portalAOControl=await page.evaluate(()=>{const {w}=portalStudy;w.roomCutaway.clear();let changed=0;for(const g of w.propGroup.children.filter(o=>o.userData.facadeCandidate))g.traverse(o=>{if(o.isMesh&&o.material.name.startsWith('Portal repaired normal atlas')){o.material.aoMapIntensity=0;o.material.needsUpdate=true;changed++;}});w.roomCutaway.prepare([...w.floorGroup.children,...w.propGroup.children]);w.roomCutaway.update(w.cameraTarget.z);w.composer.render(0);return {changed,scope:'Diagnostic only: old atlas AO disabled after exposing previously covered surfaces'};});
  await page.screenshot({path:root+'/tmp/'+label+'-ao-control.png'});
 }
 if(process.env.PORTAL_NORMAL_CONTROL==='1'){
  report.portalNormalControl=await page.evaluate(()=>{const {w}=portalStudy;w.roomCutaway.clear();let changed=0;for(const g of w.propGroup.children.filter(o=>o.userData.facadeCandidate))g.traverse(o=>{if(o.isMesh&&o.material.name.startsWith('Portal repaired normal atlas')){o.material.normalMap=null;o.material.needsUpdate=true;changed++;}});w.roomCutaway.prepare([...w.floorGroup.children,...w.propGroup.children]);w.roomCutaway.update(w.cameraTarget.z);w.composer.render(0);return {changed,scope:'Diagnostic only: old atlas normal map disabled after AO control'};});
  await page.screenshot({path:root+'/tmp/'+label+'-normal-control.png'});
 }
 if(process.env.FLAT_CONTROL==='1'){
  await page.evaluate(()=>{const {w,THREE}=portalStudy;w.roomCutaway.clear();for(const g of w.propGroup.children.filter(o=>o.userData.facadeCandidate)){g.children.at(-1).material=new THREE.MeshStandardMaterial({color:0x777777,roughness:.85});}w.scene.updateMatrixWorld(true);w.renderer.shadowMap.needsUpdate=true;w.composer.render(0);});
  await page.screenshot({path:root+'/tmp/'+label+'-flat-detail.png'});
 }

 assert.equal(errors.length,0,errors.join('\n'));report.success=true;console.log(JSON.stringify(report));
}finally{
 if(context)await context.close();
 try {if(preview&&previewBefore){report.previewAfter=await preview.evaluate(running=>{if(running)__game.world.start();return {state:structuredClone(__game.state),running:!!__game.world.frame};},previewBefore.running);assert.deepEqual(report.previewAfter,previewBefore,'Existing preview progress and RAF preserved');}}
 finally {if(browser)await browser.close();api.kill('SIGTERM');vite.kill('SIGTERM');}
 await writeFile(root+'/tmp/'+label+'-evidence.json',JSON.stringify(report,null,2));await writeFile(root+'/tmp/'+label+'-server.log',logs.join(''));
}
