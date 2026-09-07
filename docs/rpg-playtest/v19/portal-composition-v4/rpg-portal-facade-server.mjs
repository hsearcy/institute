import {createServer} from '/home/houston/git/institute/web/node_modules/vite/dist/node/index.js';
import {readFileSync} from 'node:fs';
const root='/home/houston/git/institute';
function taggedWorld(){
 let s=readFileSync(root+'/web/src/rpg/DungeonWorld.ts','utf8');
 const edit=(a,b)=>{if(!s.includes(a))throw Error('Missing source marker '+a);s=s.replace(a,b);};
 edit('let fullPier = false, shortPost = false;', 'let fullPier = false, shortPost = false, facadeStudyPart = false;');
 edit('${fullPier}:${shortPost}`','${fullPier}:${shortPost}:${facadeStudyPart}`');
 edit('material, geometries: [], room, occluder, fullPier, shortPost }','material, geometries: [], room, occluder, fullPier, shortPost, facadeStudyPart }');
 edit('for (const { material, geometries, room, occluder, fullPier, shortPost }','for (const { material, geometries, room, occluder, fullPier, shortPost, facadeStudyPart }');
 edit('mesh.userData.shortPostFallback = shortPost;','mesh.userData.shortPostFallback = shortPost; mesh.userData.facadeStudyPart = facadeStudyPart;');
 edit('for (let row = 0; row < Math.ceil(layout.wallHeights.back / .57);', 'facadeStudyPart = true; for (let row = 0; row < Math.ceil(layout.wallHeights.back / .57);');
 edit('pillar(layout.doorX + side * 3.4,', 'facadeStudyPart = false; pillar(layout.doorX + side * 3.4,');
 edit('if (side < 0) for (let step = 0; step < 4; step++) {', 'facadeStudyPart = true; if (side < 0) for (let step = 0; step < 4; step++) {');
 edit('// Foreground remnants frame the action;', 'facadeStudyPart = false; // Foreground remnants frame the action;');
 return s;
}
const server=await createServer({root:root+'/web',server:{host:'127.0.0.1',port:5249,strictPort:true,watch:null,hmr:false},plugins:[{name:'portal-study-source-tags',enforce:'pre',load(id){if(id===root+'/web/src/rpg/DungeonWorld.ts')return taggedWorld();}}]});await server.watcher.close();await server.listen();
