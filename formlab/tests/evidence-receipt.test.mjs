import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createEvidencePayload,completeUndoPayload,sealEvidenceReceipt,
 verifyEvidenceReceipt,validateReceiptPayload,captureTargetedObservation
} from "../evidence-receipt.mjs";
import {POLICY_SHA256,POLICY_REVISION} from "../remote-policy.mjs";

const origin="http://127.0.0.1:18082",peer="http://localhost:18083";
const id="9aa6f57b-72cf-4108-8b54-3ad0b31cddf4";
const policyFor=fixId=>{
 const map={
  associate_label:["WCAG-1.3.1","https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships"],
  announce_errors:["WCAG-3.3.1","https://www.w3.org/WAI/WCAG22/Understanding/error-identification"],
  increase_contrast:["WCAG-1.4.3","https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum"]
 };
 return {servedFrom:peer,policyRevision:POLICY_REVISION,policySha256:POLICY_SHA256,
    policyRequestId:"1ef7296c-2ceb-4d15-bfb5-6461c15f838e",
    sourceId:map[fixId][0],sourceUrl:map[fixId][1]};
};
const targets={
 associate_label:[{labelPresent:true,inputPresent:true,linked:false},
  {labelPresent:true,inputPresent:true,linked:true},
  {labelPresent:true,inputPresent:true,linked:false}],
 announce_errors:[{errorVisible:true,roleAlert:false,ariaLiveAssertive:false},
  {errorVisible:true,roleAlert:true,ariaLiveAssertive:true},
  {errorVisible:true,roleAlert:false,ariaLiveAssertive:false}],
 increase_contrast:[{contrastRatio:2.05},{contrastRatio:10.32},{contrastRatio:2.05}]
};
const make=(fixId="associate_label")=>{
 const obs=targets[fixId];
 const result=createEvidencePayload({
  receiptId:id,createdAt:"2026-11-18T01:35:17.000Z",siteOrigin:origin,
  policyVerdict:policyFor(fixId),fixId,
  before:{version:0,target:structuredClone(obs[0])},after:{version:1,target:structuredClone(obs[1])}
 });
 assert.equal(result.ok,true);
 return result.payload;
};
const undo=payload=>completeUndoPayload(payload,{
 version:2,target:targets[payload.action.fixId][2]
});

test("all three allowlisted outcomes produce acceptable pending receipts and completed undo proofs",async()=>{
 for(const fixId of Object.keys(targets)){
  const p=make(fixId);
  assert.equal(validateReceiptPayload(p).ok,true);
  const pending=await sealEvidenceReceipt(p,webcrypto);
  assert.equal(pending.ok,true);
  assert.equal((await verifyEvidenceReceipt(pending.receipt,webcrypto)).status,"APPLIED_PENDING_UNDO");
  const done=undo(p);
  assert.equal(done.ok,true);
  const verified=await sealEvidenceReceipt(done.payload,webcrypto);
  const result=await verifyEvidenceReceipt(verified.receipt,webcrypto);
  assert.equal(result.ok,true);
  assert.equal(result.status,"UNDONE_OBSERVED");
  assert.equal(result.fixId,fixId);
 }
});
test("hash verification catches tampered after observation, even when semantic state remains valid",async()=>{
 const payload=make("increase_contrast");
 const signed=(await sealEvidenceReceipt(payload,webcrypto)).receipt;
 signed.payload.observations.after.target.contrastRatio=10.4;
 assert.equal((await verifyEvidenceReceipt(signed,webcrypto)).reason,"integrity_mismatch");
});
test("receipt envelope has exactly three allowed keys and no external signature claim",async()=>{
 const sealed=(await sealEvidenceReceipt(make(),webcrypto)).receipt;
 assert.deepEqual(Object.keys(sealed),["payload","integrity","warning"]);
 assert.match(sealed.warning,/not independent authentication/);
 sealed.privateEmail="private@example.org";
 assert.equal((await verifyEvidenceReceipt(sealed,webcrypto)).reason,"receipt_envelope_invalid");
});
test("changed property order does not invalidate canonical digest",async()=>{
 const receipt=(await sealEvidenceReceipt(make(),webcrypto)).receipt;
 receipt.payload={...Object.fromEntries(Object.entries(receipt.payload).reverse())};
 assert.equal((await verifyEvidenceReceipt(receipt,webcrypto)).ok,true);
});
test("non-JSON or malicious response cannot pass verifier",async()=>{
 for(const value of [null,{},[],true,"valid",{
  payload:{},integrity:{algorithm:"SHA-256",digest:"0".repeat(64)},warning:"forged"
 }]){
  assert.equal((await verifyEvidenceReceipt(value,webcrypto)).ok,false);
 }
});
test("a fresh receipt never claims Undo until version is 2 and target restored",()=>{
 const p=make();
 assert.equal(p.status,"APPLIED_PENDING_UNDO");
 assert.equal(p.observations.undone,null);
 assert.equal(p.action.undoneVersion,null);
 const bad=completeUndoPayload(p,{version:2,target:{labelPresent:true,inputPresent:true,linked:true}});
 assert.equal(bad.reason,"observed_transition_invalid");
});
test("wrong or stale state versions are rejected even if target changed",()=>{
 const p=make();
 const stale=structuredClone(p);
 stale.observations.after.version=8;
 assert.equal(validateReceiptPayload(stale).reason,"apply_version_invalid");
 const bad=completeUndoPayload(p,{version:3,target:targets.associate_label[2]});
 assert.equal(bad.reason,"undo_version_invalid");
});
test("policy provenance mismatch or alternate URL is refused",()=>{
 const p=make();
 p.policy.sha256="0".repeat(64);
 assert.equal(validateReceiptPayload(p).reason,"policy_invalid");
 p.policy.sha256=POLICY_SHA256;
 p.policy.sourceUrl="https://attacker.example";
 assert.equal(validateReceiptPayload(p).reason,"reference_invalid");
});
test("personal data injection and unknown IDs are rejected",async()=>{
 const p=make();
 p.observations.after.target.email="private@example.org";
 assert.equal(validateReceiptPayload(p).reason,"observations_invalid");
 const q=make();
 q.action.fixId="__proto__";
 assert.equal(validateReceiptPayload(q).reason,"action_invalid");
});
test("negative contrast and out of range values rejected",()=>{
 for(const x of [-1,0,21.2,null,Infinity,NaN,"2.05"]){
  const p=make("increase_contrast");
  p.observations.before.target.contrastRatio=x;
  assert.equal(validateReceiptPayload(p).ok,false);
 }
});
test("self-attestation cannot be misrepresented as cryptographic authenticity",async()=>{
 const receipt=(await sealEvidenceReceipt(make(),webcrypto)).receipt;
 assert.equal((await verifyEvidenceReceipt(receipt,webcrypto)).assurance,"self_attested_only");
 assert.equal(receipt.payload.action.approval,"explicit_browser_dialog");
});
test("no user value or DOM text captured while observing associated-label state",()=>{
 let valueAccess=0;
 const input={id:"email",get value(){valueAccess++;throw Error("never read input value")}};
 const label={htmlFor:"",textContent:"Contact email"};
 const doc={getElementById:key=>({"email-label":label,email:input})[key]??null};
 const before=captureTargetedObservation({documentImpl:doc,fixId:"associate_label",version:0});
 assert.equal(before.ok,true);
 assert.equal(before.observation.target.linked,false);
 label.htmlFor="email";
 const after=captureTargetedObservation({documentImpl:doc,fixId:"associate_label",version:1});
 assert.equal(after.observation.target.linked,true);
 assert.equal(valueAccess,0);
 assert.equal(JSON.stringify(after).includes("Contact email"),false);
});
test("error snapshot records only Boolean predicates, not message text",()=>{
 const err={textContent:"Secret error saying alice@example.org",getAttribute:n=>n==="role"?"alert":"assertive"};
 const doc={getElementById:key=>key==="form-error"?err:null};
 const captured=captureTargetedObservation({documentImpl:doc,fixId:"announce_errors",version:9});
 assert.equal(captured.ok,true);
 assert.equal(captured.observation.target.errorVisible,true);
 assert.equal(JSON.stringify(captured).includes("alice@example.org"),false);
});
test("unmeasurable contrast returns explicit failure, never invented PASS",()=>{
 const doc={getElementById:()=>({})};
 const captured=captureTargetedObservation({documentImpl:doc,fixId:"increase_contrast",version:0,contrastReader:()=>({increase_contrast:null})});
 assert.equal(captured.reason,"contrast_unmeasurable");
});
