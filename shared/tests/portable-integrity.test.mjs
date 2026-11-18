import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {canonicalJson,contentSha256,verifyPortable} from "../portable-integrity.mjs";
import {sealEvidenceReceipt,createEvidencePayload,validateReceiptPayload,verifyEvidenceReceipt} from "../../formlab/evidence-receipt.mjs";
import {POLICY_SHA256,POLICY_REVISION} from "../../formlab/remote-policy.mjs";
import {
 makeDemoTrip,makeBasketReceipt,sealBasketReceipt,verifyBasketReceipt,validateBasketPayload
} from "../../harbor-receipt/evidence/basket-evidence.mjs";

const form=()=>{
 const r=createEvidencePayload({
  receiptId:"79157018-90e2-4b95-a254-7eaa76864eba",
  createdAt:"2026-11-18T09:10:17.000Z",
  siteOrigin:"http://127.0.0.1:18082",
  policyVerdict:{
   policyRequestId:"25e3a827-e458-4005-89c4-2c840e4d7caa",
   servedFrom:"http://localhost:18083",policyRevision:POLICY_REVISION,
   policySha256:POLICY_SHA256,sourceId:"WCAG-1.3.1",
   sourceUrl:"https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships"
  },
  fixId:"associate_label",
  before:{version:0,target:{labelPresent:true,inputPresent:true,linked:false}},
  after:{version:1,target:{labelPresent:true,inputPresent:true,linked:true}}
 });
 assert.equal(r.ok,true);
 return r.payload;
};
const harbor=()=>{
 const r=makeBasketReceipt({
  receiptId:"812865c3-9d22-4e44-af47-a7c45ee61c87",
  createdAt:"2026-11-18T09:10:18.000Z",
  siteOrigin:"http://127.0.0.1:18085",
  trip:makeDemoTrip("2026-11-19"),
  before:{version:0,tripCount:0,totalCents:0,removeControls:0,totalVisible:false,targetMatch:false},
  after:{version:1,tripCount:1,totalCents:3950,removeControls:1,totalVisible:true,targetMatch:true}
 });
 assert.equal(r.ok,true);
 return r.payload;
};
test("one shared canonical SHA-256 verifier accepts the original FormLab v1 envelope",async()=>{
 const payload=form();
 const old=(await sealEvidenceReceipt(payload,webcrypto)).receipt;
 assert.equal(await contentSha256(payload,webcrypto),old.integrity.digest);
 const independent=await verifyPortable(old,validateReceiptPayload,webcrypto);
 assert.equal(independent.ok,true);
 assert.equal((await verifyEvidenceReceipt(old,webcrypto)).ok,true);
});
test("same shared portable verifier accepts second domain with a separate validator",async()=>{
 const receipt=(await sealBasketReceipt(harbor(),webcrypto)).receipt;
 assert.equal((await verifyPortable(receipt,validateBasketPayload,webcrypto)).ok,true);
 assert.equal((await verifyBasketReceipt(receipt,webcrypto)).ok,true);
 assert.equal((await verifyEvidenceReceipt(receipt,webcrypto)).ok,false);
});
test("canonical representation is order insensitive but digests remain domain separated",async()=>{
 const a={z:1,a:{n:3,b:2}},b={a:{b:2,n:3},z:1};
 assert.equal(canonicalJson(a),canonicalJson(b));
 assert.equal(await contentSha256(a,webcrypto),await contentSha256(b,webcrypto));
 assert.notEqual(await contentSha256(form(),webcrypto),await contentSha256(harbor(),webcrypto));
});
test("generic canonicalization rejects getter, undefined, NaN and cyclic payloads",()=>{
 const evil={get secret(){throw Error("not safe");}};
 assert.throws(()=>canonicalJson(evil),/accessor_disallowed/);
 assert.throws(()=>canonicalJson({a:undefined}),/non_plain_json|unsupported/);
 assert.throws(()=>canonicalJson({a:NaN}),/non_plain_json/);
 const cycle={};cycle.self=cycle;
 assert.throws(()=>canonicalJson(cycle),/too_deep/);
});
test("self-contained SHA-256 cannot authenticate an intentionally forged receipt",async()=>{
 const x=harbor();
 x.createdAt="2026-11-18T09:10:19.000Z";
 const rep=(await sealBasketReceipt(x,webcrypto)).receipt;
 assert.equal((await verifyBasketReceipt(rep,webcrypto)).ok,true);
 assert.match(rep.warning,/not independent authentication/);
});
