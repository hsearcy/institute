import {chromium} from '/home/houston/git/institute/web/node_modules/@playwright/test/index.mjs';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='/home/houston/git/institute',label=process.env.QA_LABEL||'portal-facade-v2',profile='rpg-playtest';
const db='/tmp/'+label+'.db',logs=[],errors=[],report={label,db,errors};
const api=spawn('bun',['--no-env-file','scripts/rpg-local-server.ts'],{cwd:root,env:{...process.env,RPG_TEST_DB:db,RPG_TEST_PORT:'8959'},stdio:['ignore','pipe','pipe']});
const vite=spawn('node',[root+'/tmp/rpg-portal-facade-server.mjs'],{cwd:root+'/web',env:{...process.env,TUTOR_PROXY_TARGET:'http://127.0.0.1:8959',VITE_PROFILE_ID:profile},stdio:['ignore','pipe','pipe']});
for(const child of [api,vite])for(const stream of [child.stdout,child.stderr])stream.on('data',x=>logs.push(String(x)));
let browser,context,page;
const wait=async url=>{for(let n=0;n<150;n++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Server unavailable '+url);};
try{
 await Promise.all([wait('http://127.0.0.1:8959/health'),wait('http://127.0.0.1:5249/')]);
 await fetch('http://127.0.0.1:8959/rpg/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profileId:profile,regionId:'embercrypt'})});
 browser=await chromium.connectOverCDP('http://127.0.0.1:9222');context=await browser.newContext({viewport:{width:1440,height:900}});page=await context.newPage();
 await context.route('**/assets/rpg/portal-candidate.glb',route=>route.fulfill({path:root+'/tmp/rpg-portal-bake-v7/worn-pier-review.glb',contentType:'model/gltf-binary'}));
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()+' '+r.failure()?.errorText));
 await page.addInitScript(()=>localStorage.setItem('institute:rpg:muted','true'));await page.goto('http://127.0.0.1:5249/');
 await page.waitForFunction(()=>!!window.__game?.world?.loadedAt&&!__game.busy,undefined,{timeout:90000});
 await page.locator('#rpg-dialog-content [data-action="begin"]').click();
 for(let n=0;n<200;n++){const demo=page.getByRole('button',{name:'Let me try',exact:true});if(await demo.isVisible())await demo.click();if(await page.evaluate(()=>!!__game.session&&!__game.busy&&!__game.panel))break;await page.waitForTimeout(100);}
 await page.evaluate(()=>{cancelAnimationFrame(__game.world.frame);__game.world.frame=0;});
 await page.screenshot({path:root+'/tmp/'+label+'-before.png'});
 report.assembly=await page.evaluate(async()=>{
  const w=__game.world;
  const resource=pattern=>performance.getEntriesByType('resource').find(r=>pattern.test(r.name))?.name;
  const threeURL=resource(/\/three\.js\?/),loaderURL=resource(/GLTFLoader/);
  if(!threeURL||!loaderURL)throw Error('Loaded Three/GLTF module URLs missing');
  const THREE=await import(threeURL),{GLTFLoader}=await import(loaderURL),{getRoomLayout}=await import('/src/rpg/world/roomLayout.ts');
  const gltf=await new GLTFLoader().loadAsync('/assets/rpg/portal-candidate.glb');
  gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  w.models.set('__portalCandidate',gltf.scene);w.roomCutaway.clear();
  const {installFacadeStudy}=await import('/@fs/home/houston/git/institute/tmp/rpg-portal-facade-candidate.js');
  const result=await installFacadeStudy(w,THREE,getRoomLayout);
  window.portalStudy={THREE,w};return result;
 });
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
    const mat=group.children.at(-1).material;mat.map=map;mat.bumpMap=height;mat.bumpScale=.011;mat.roughnessMap=roughness;mat.roughness=1;mat.color.setRGB(.5695,.5665,.5275);mat.needsUpdate=true;changed++;
   }
   w.roomCutaway.prepare([...w.floorGroup.children,...w.propGroup.children]);w.roomCutaway.update(w.cameraTarget.z);w.scene.updateMatrixWorld(true);w.renderer.shadowMap.needsUpdate=true;w.renderer.info.reset();w.composer.render(0);
   return {changed,diagnostics:w.diagnostics};
  });
  await page.screenshot({path:root+'/tmp/'+label+'-matched.png'});
 }

 await page.evaluate(()=>{const {w,THREE}=portalStudy;const focus=new THREE.Vector3(0,2.8,-9.4);w.camera.position.add(focus.sub(w.cameraTarget));w.camera.zoom*=1.4;w.camera.updateProjectionMatrix();w.camera.updateMatrixWorld();w.composer.render(0);});
 await page.screenshot({path:root+'/tmp/'+label+'-assembly-detail.png'});
 if(process.env.FLAT_CONTROL==='1'){
  await page.evaluate(()=>{const {w,THREE}=portalStudy;w.roomCutaway.clear();for(const g of w.propGroup.children.filter(o=>o.userData.facadeCandidate)){g.children.at(-1).material=new THREE.MeshStandardMaterial({color:0x777777,roughness:.85});}w.scene.updateMatrixWorld(true);w.renderer.shadowMap.needsUpdate=true;w.composer.render(0);});
  await page.screenshot({path:root+'/tmp/'+label+'-flat-detail.png'});
 }

 assert.equal(errors.length,0,errors.join('\n'));report.success=true;console.log(JSON.stringify(report));
}finally{
 if(context)await context.close();if(browser)await browser.close();api.kill('SIGTERM');vite.kill('SIGTERM');
 await writeFile(root+'/tmp/'+label+'-evidence.json',JSON.stringify(report,null,2));await writeFile(root+'/tmp/'+label+'-server.log',logs.join(''));
}
