import {createServer} from '/home/houston/git/institute/web/node_modules/vite/dist/node/index.js';
const server=await createServer({root:'/home/houston/git/institute/web',server:{host:'127.0.0.1',port:5261,strictPort:true,watch:null,hmr:false}});await server.watcher.close();await server.listen();
