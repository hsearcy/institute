import {chromium} from '../web/node_modules/@playwright/test/index.mjs';
import ts from '../web/node_modules/typescript/lib/typescript.js';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const transpile=async path=>ts.transpileModule(readFileSync(path,'utf8').replace(/^import[^\n]+\n/, '').replaceAll('export function','function'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const baseline=await transpile('tmp/pavingRelief-before-contours.ts'),candidate=await transpile('web/src/rpg/world/pavingRelief.ts');
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222');const context=await browser.newContext();
try{
 const page=await context.newPage();await page.route('**/__paving-analysis',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Paving analysis</title>'}));await page.goto('http://127.0.0.1:5240/__paving-analysis');
 const report=await page.evaluate(async({baseline,candidate})=>{
  const image=new Image();image.src='/assets/rpg/dungeon-cobbles-v2.png';await image.decode();
  const old=new Function(baseline+';return pavingBevelHeight;')(),next=new Function(candidate+';return {pavingBevelHeight,pavingJointField};')();
  const bytes=canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const previousHash=await hash(bytes(old(image))),currentHash=await hash(bytes(next.pavingBevelHeight(image))),field=next.pavingJointField(image);
  let binary='';for(let i=0;i<field.joints.length;i+=8192)binary+=String.fromCharCode(...field.joints.subarray(i,i+8192));
  return {previousHash,currentHash,size:field.size,jointPixels:field.joints.reduce((a,b)=>a+b,0),jointsBase64:btoa(binary),photo:'/assets/rpg/dungeon-cobbles-v2.png',worldTileMeters:4.8,floorY:-.05};
 },{baseline,candidate});
 assert.equal(report.currentHash,report.previousHash,'Refactor preserves every relief pixel');writeFileSync('tmp/paving-joint-field.json',JSON.stringify(report));console.log(JSON.stringify({...report,jointsBase64:undefined}));
}finally{await context.close();await browser.close();}
