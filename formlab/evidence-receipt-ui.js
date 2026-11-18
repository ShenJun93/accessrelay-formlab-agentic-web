// P767: browser-local, opt-in export and verification of self-attested receipts.
// Never persist or transmit email values or remote LLM output.
import {formController} from "./form-controller.js";
import {readTargetedEvidence} from "./remote-policy.mjs";
import {
  captureTargetedObservation,createEvidencePayload,completeUndoPayload,
  sealEvidenceReceipt,verifyEvidenceReceipt
} from "./evidence-receipt.mjs";

let current=null;
let candidate=null;
let activeApply=null;
let activeUndo=null;
let installed=false;

const observe=(fixId,version)=>captureTargetedObservation({
 documentImpl:document,computedStyle:node=>getComputedStyle(node),
 contrastReader:readTargetedEvidence,fixId,version
});
const goodPolicy=v=>!!v&&v.ok===true&&v.mode==="versioned-policy-not-llm"
  &&v.requiresHumanApproval===true&&v.verifiedDomChange===false
  &&typeof v.issueId==="string"&&Number.isSafeInteger(v.expectedVersion)
  &&typeof v.requestId==="string";
const setStatus=value=>{
 const el=document.getElementById("receipt-status");
 if(el)el.textContent=value;
};
function refresh(){
 const download=document.getElementById("receipt-export");
 if(download)download.disabled=!current;
}
export function clearQualifiedPolicy(){
 candidate=null;
}
export function markQualifiedPolicy(verdict) {
 if(!goodPolicy(verdict)){clearQualifiedPolicy();return false;}
 // Only copy allowlisted provenance, no external prose or DOM.
 candidate=Object.freeze({
  ok:true,mode:verdict.mode,issueId:verdict.issueId,
  expectedVersion:verdict.expectedVersion,policyRequestId:verdict.requestId,
  servedFrom:verdict.servedFrom,policyRevision:verdict.policyRevision,
  policySha256:verdict.policySha256,sourceId:verdict.sourceId,
  sourceUrl:verdict.sourceUrl,requiresHumanApproval:true,verifiedDomChange:false
 });
 setStatus("Policy verified; an evidence receipt is created only after explicit approval and a measured DOM change.");
 return true;
}
function onTransition(event) {
 const {phase,action,fixId,beforeVersion,afterVersion,approvedBy}=event;
 const approved=approvedBy==="browser-dialog";
 if(action==="apply"){
  if(phase==="before"){
   activeUndo=null;
   activeApply=null;
   if(!approved || !candidate||candidate.issueId!==fixId||candidate.expectedVersion!==beforeVersion) {
    candidate=null;return;
   }
   const before=observe(fixId,beforeVersion);
   if(!before.ok){candidate=null;setStatus("Evidence unavailable before Apply; no receipt issued.");return;}
   activeApply={policy:candidate,before:before.observation,fixId,afterVersion};
   candidate=null;
  }else if(phase==="after"&&activeApply){
   const staged=activeApply;activeApply=null;
   const after=observe(fixId,afterVersion);
   if(!after.ok){setStatus("No receipt: accessibility evidence unavailable after Apply.");return;}
   const built=createEvidencePayload({
    receiptId:crypto.randomUUID(),createdAt:new Date().toISOString(),
    siteOrigin:location.origin,policyVerdict:staged.policy,
    fixId,before:staged.before,after:after.observation
   });
   if(!built.ok){setStatus("No receipt: observed DOM change does not meet the recorded policy condition.");return;}
   current=built.payload;
   setStatus("RECEIPT — Apply approved and targeted DOM change observed at version "+afterVersion+". Undo has not yet been observed.");
   refresh();
  }
  return;
 }
 if(action==="undo"){
  if(phase==="before"){
   activeUndo=null;
   if(!approved||!current||current.status!=="APPLIED_PENDING_UNDO"
      ||current.action.fixId!==fixId||current.action.appliedVersion!==beforeVersion)return;
   activeUndo={fixId,afterVersion};
  }else if(phase==="after"&&activeUndo) {
   activeUndo=null;
   const undone=observe(fixId,afterVersion);
   if(!undone.ok){setStatus("Receipt remains pending: Undo evidence could not be measured.");return;}
   const done=completeUndoPayload(current,undone.observation);
   if(!done.ok){setStatus("Receipt remains pending: observed Undo did not restore the expected target.");return;}
   current=done.payload;
   setStatus("RECEIPT — Apply and Undo observed, targeted DOM restored at version "+afterVersion+". Ready to export JSON.");
   refresh();
  }
 }
}
async function exportLatest(){
 if(!current)return;
 const result=await sealEvidenceReceipt(current);
 if(!result.ok){setStatus("Unable to export: receipt validation failed.");return;}
 const encoded=JSON.stringify(result.receipt,null,2)+"\n";
 const blob=new Blob([encoded],{type:"application/json"});
 const url=URL.createObjectURL(blob);
 try{
  const link=document.createElement("a");
  link.href=url;
  link.download="formlab-evidence-"+result.receipt.payload.receiptId+".json";
  document.body.append(link);
  link.click();
  link.remove();
  setStatus("Download requested: SHA-256 "+result.receipt.integrity.digest+
    ". This is self-attested browser evidence, not a signed third-party audit.");
 }finally{URL.revokeObjectURL(url);}
}
async function verifyPasted(){
 const input=document.getElementById("receipt-paste");
 const status=document.getElementById("receipt-verify-status");
 if(input.value.length>24000){status.textContent="INVALID — exceeds the 24 KB receipt limit.";return;}
 let value;
 try{value=JSON.parse(input.value);}
 catch{status.textContent="INVALID — JSON cannot be parsed.";return;}
 const result=await verifyEvidenceReceipt(value);
 status.textContent=result.ok
  ? "INTEGRITY PASS — "+result.status+"; "+result.fixId+
    ". Self-attested only: cannot independently prove the original browser action."
  : "INVALID — "+result.reason+".";
}
export function setupEvidenceReceiptUi() {
 if(installed)return;
 const download=document.getElementById("receipt-export");
 const verify=document.getElementById("receipt-verify");
 if(!download||!verify)throw Error("Evidence receipt UI is not mounted.");
 installed=true;
 formController.onTransition(onTransition);
 download.addEventListener("click",()=>{
  void exportLatest().catch(()=>setStatus("Download unavailable; receipt not exported."));
 });
 verify.addEventListener("click",()=>{
  void verifyPasted().catch(()=>{
   document.getElementById("receipt-verify-status").textContent="INVALID — verification failed.";
  });
 });
 refresh();
}
