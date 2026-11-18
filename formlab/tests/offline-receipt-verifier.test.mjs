import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {webcrypto} from "node:crypto";
import {createEvidencePayload,completeUndoPayload,sealEvidenceReceipt} from "../evidence-receipt.mjs";
import {POLICY_SHA256,POLICY_REVISION} from "../remote-policy.mjs";

const cli=fileURLToPath(new URL("../../dev/verify-receipt.mjs",import.meta.url));
const receiptFixture=async()=>{
 const pending=createEvidencePayload({
  receiptId:"c66c8bfa-6dd0-4c59-8b3a-267273748d86",
  createdAt:"2026-11-18T02:45:11.000Z",
  siteOrigin:"http://127.0.0.1:18082",
  policyVerdict:{
   servedFrom:"http://localhost:18083",
   policyRevision:POLICY_REVISION,
   policySha256:POLICY_SHA256,
   policyRequestId:"0bba2f83-1c67-442b-8032-70b1813c8f9d",
   sourceId:"WCAG-1.3.1",
   sourceUrl:"https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships"
  },
  fixId:"associate_label",
  before:{version:0,target:{labelPresent:true,inputPresent:true,linked:false}},
  after:{version:1,target:{labelPresent:true,inputPresent:true,linked:true}}
 });
 assert.equal(pending.ok,true);
 const complete=completeUndoPayload(pending.payload,{
  version:2,target:{labelPresent:true,inputPresent:true,linked:false}
 });
 assert.equal(complete.ok,true);
 return (await sealEvidenceReceipt(complete.payload,webcrypto)).receipt;
};

test("standalone offline CLI accepts a valid sealed receipt and rejects tampering",async()=>{
 const temp=await mkdtemp(resolve(tmpdir(),"p767-receipt-"));
 try{
  const good=await receiptFixture();
  const file=resolve(temp,"proof.json");
  await writeFile(file,JSON.stringify(good),"utf8");
  const pass=spawnSync(process.execPath,[cli,file],{encoding:"utf8",timeout:8000});
  assert.equal(pass.status,0,pass.stderr);
  assert.match(pass.stdout,/INTEGRITY PASS: UNDONE_OBSERVED/);
  assert.match(pass.stdout,/self-attested/);
  good.payload.observations.after.target.linked=false;
  await writeFile(file,JSON.stringify(good),"utf8");
  const fail=spawnSync(process.execPath,[cli,file],{encoding:"utf8",timeout:8000});
  assert.equal(fail.status,1,fail.stdout);
  assert.match(fail.stderr,/INVALID/);
 }finally{await rm(temp,{recursive:true,force:true});}
});
