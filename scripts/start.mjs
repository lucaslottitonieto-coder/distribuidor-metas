import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const python=path.join(root,process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
const production=process.argv.includes('--production');
if(!existsSync(python)||!existsSync(path.join(root,'node_modules/vite/bin/vite.js'))){
  console.error('Execute configurar.ps1 antes de iniciar. Veja README.md para a instalação.');process.exit(1);
}
if(production&&!existsSync(path.join(root,'dist/index.html'))){console.error('Gere o front-end com npm run build antes de iniciar em produção.');process.exit(1);}
const owned=[];
function free(port){return new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});}
const apiFree=await free(8765);
const frontFree=production||await free(5173);
if(!apiFree){
  try{const r=await fetch('http://127.0.0.1:8765/api/health');const h=await r.json();if(h.status==='ok'&&h.service==='sicredi-distribuidor-metas'){console.log('API do Distribuidor já está em execução.');}else throw new Error();}
  catch{console.error('A porta 8765 está sendo usada por outro serviço. Libere a porta antes de iniciar.');process.exit(1);}
}
if(!frontFree){
  try{const r=await fetch('http://127.0.0.1:5173');if(!(await r.text()).includes('<title>Distribuidor de Metas · SomaX</title>'))throw new Error();console.log('O front-end do Distribuidor já está em execução.');}
  catch{console.error('A porta 5173 está sendo usada por outro serviço. Libere a porta antes de iniciar.');process.exit(1);}
}
if(apiFree) owned.push(spawn(python,['-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','8765'],{cwd:root,stdio:'inherit',windowsHide:true}));
if(!production&&frontFree) owned.push(spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1'],{cwd:root,stdio:'inherit',windowsHide:true}));
const url=production?'http://127.0.0.1:8765':'http://127.0.0.1:5173';
console.log(`\nDistribuidor de Metas: ${url}\nAPI: http://127.0.0.1:8765/docs\nUse Ctrl+C para encerrar os processos iniciados aqui.\n`);
const stop=()=>{for(const p of owned)p.kill();};
process.on('SIGINT',()=>{stop();process.exit(0);});process.on('SIGTERM',()=>{stop();process.exit(0);});process.on('exit',stop);
for(const p of owned){p.on('error',e=>{console.error(e.message);stop();process.exit(1);});p.on('exit',code=>{if(code&&code!==0){stop();process.exit(code);}});}
if(!owned.length)process.exit(0);
