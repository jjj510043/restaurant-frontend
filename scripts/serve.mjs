// Optional local development server. Production deployment needs no Node.js.
// Only customer-facing API paths are forwarded; this is not an authorization layer.
import http from 'node:http';
import worker from '../public/_worker.js';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../public/',import.meta.url));
const portArg=process.argv.indexOf('--port');
const port=Number(portArg>=0?process.argv[portArg+1]:process.env.PORT)||5173;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json; charset=utf-8'};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(url.pathname.startsWith('/api/')){
   const parts=[];for await(const part of req)parts.push(part);
   const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(parts)}:{})});
   const response=await worker.fetch(request,{});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const pathname=decodeURIComponent(url.pathname);let file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
  try{if((await stat(file)).isDirectory())file=path.join(file,'index.html');await stat(file);}catch{file=path.join(root,'index.html');}
  const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(502,{'Content-Type':'application/json'});res.end('{"error":"Upstream unavailable"}');}
}).listen(port,'0.0.0.0',()=>console.log(`Local: http://localhost:${port}\nDemo: http://localhost:${port}/?demo=1&SEAT_ID=1`));
