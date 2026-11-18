import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {webcrypto} from "node:crypto";
import {POLICY_SHA256,POLICY_REVISION} from "../../formlab/remote-policy.mjs";
import {createEvidencePayload,sealEvidenceReceipt} from "../../formlab/evidence-receipt.mjs";
import {makeDemoTrip,makeBasketReceipt,markBasketUndo,sealBasketReceipt} from "../../harbor-receipt/evidence/basket-evidence.mjs";

const cli=fileURLToPath(new URL("../../dev/verify-portable-receipt.mjs",import.meta.url));
function run(file){return spawnSync(process.execPath,[cli,file],{encoding:"utf8",timeout:9000})}
function formFixture(){
 const r=createEvidencePayload({
  receiptId:"67299866-3cb7-474a-9577-cce71a22707c",createdAt:"2026-11-18T09:30:17.000Z",
  siteOrigin:"http://127.0.0.1:18082",
  policyVerdict:{
   policyRequestId:"d7221474-569a-429b-8516-273d0eefef43",
   servedFrom:"http://localhost:18083",policyRevision:POLICY_REVISION,
   policySha256:POLICY_SHA256,sourceId:"WCAG-1.3.1",
   sourceUrl:"https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships"
  },fixId:"associate_label",
  before:{version:0,target:{labelPresent:true,inputPresent:true,linked:false}},
  after:{version:1,target:{labelPresent:true,inputPresent:true,linked:true}}
 });
 assert.equal(r.ok,true);return r.payload;
}
function harborFixture(){
 const r=makeBasketReceipt({
  receiptId:"aba9a2de-35f5-4d68-a885-c6a077d7443a",
  createdAt:"2026-11-18T09:30:18.000Z",
  siteOrigin:"http://127.0.0.1:18085",
  trip:makeDemoTrip("2026-11-19"),
  before:{version:0,tripCount:0,totalCents:0,removeControls:0,totalVisible:false,targetMatch:false},
  after:{version:1,tripCount:1,totalCents:3950,removeControls:1,totalVisible:true,targetMatch:true}
 });
 assert.equal(r.ok,true);return r.payload;
}
test("single offline CLI accepts two different schemas with the same SHA-256 envelope",async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),"p768-receipt-cli-"));
 try{
  const form=(await sealEvidenceReceipt(formFixture(),webcrypto)).receipt;
  const harbor=(await sealBasketReceipt(harborFixture(),webcrypto)).receipt;
  const files=[resolve(dir,"form.json"),resolve(dir,"harbor.json")];
  await writeFile(files[0],JSON.stringify(form));await writeFile(files[1],JSON.stringify(harbor));
  for(let i=0;i<files.length;i++){
    const result=run(files[i]);
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/INTEGRITY PASS/);
    assert.match(result.stdout,/SELF-ATTESTED ONLY/);
  }
  const bad=structuredClone(harbor);
  bad.payload.createdAt="2026-11-18T09:30:19.000Z";
  await writeFile(files[1],JSON.stringify(bad));
  const reject=run(files[1]);
  assert.equal(reject.status,1);
  assert.match(reject.stderr,/integrity_mismatch/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("offline CLI rejects unsupported schema, invalid JSON and missing args",async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),"p768-bad-cli-"));
 try{
  const file=resolve(dir,"untrusted.json");
  await writeFile(file,JSON.stringify({payload:{schema:"evil/v1"},integrity:{},warning:"fake"}));
  assert.equal(run(file).status,1);
  await writeFile(file,"not-json");
  assert.equal(run(file).status,1);
  const usage=spawnSync(process.execPath,[cli],{encoding:"utf8",timeout:9000});
  assert.equal(usage.status,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
