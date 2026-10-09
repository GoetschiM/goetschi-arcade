import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

test('Arcade API fails closed without Authentik settings and rejects anonymous catalog/admin/ROM', async t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arcade-auth-'));
 const port=30000+Math.floor(Math.random()*10000);
 const child=spawn(process.execPath,['server/index.mjs'],{
  cwd:process.cwd(),env:{
   ...process.env,ARCADE_DATA_DIR:dir,ARCADE_API_PORT:String(port),
   AUTHENTIK_ISSUER:'',AUTHENTIK_CLIENT_ID:'',AUTHENTIK_CLIENT_SECRET:'',ARCADE_PUBLIC_URL:''
  },stdio:'pipe'
 });
 t.after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true})});
 let health;
 for(let i=0;i<80;i++){
  try{health=await fetch('http://127.0.0.1:'+port+'/health');break}
  catch{await sleep(50)}
 }
 assert.ok(health,'Server started');
 assert.equal(health.status,503);
 for(const url of ['/api/catalog','/api/admin/library','/api/roms/00000000-0000-0000-0000-000000000000/file','/auth/login']){
  const result=await fetch('http://127.0.0.1:'+port+url,{redirect:'manual'});
  assert.equal(result.status,503,url);
 }
});
