// P767: self-attested, privacy-minimal, portable evidence receipts.
// SHA-256 makes accidental/undisclosed modification detectable; it is NOT a signature.
import {ASSESSMENT_RULES} from "./peer-assessment.mjs";
import {POLICY_SHA256,POLICY_REVISION} from "./remote-policy.mjs";

export const RECEIPT_SCHEMA="formlab-reversible-evidence/v1";
const SCOPE="three-targeted-form-checks-not-WCAG-conformance";
const STATUS_APPLIED="APPLIED_PENDING_UNDO";
const STATUS_UNDONE="UNDONE_OBSERVED";
const SOURCES=Object.freeze({
 associate_label:["WCAG-1.3.1","https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships"],
 announce_errors:["WCAG-3.3.1","https://www.w3.org/WAI/WCAG22/Understanding/error-identification"],
 increase_contrast:["WCAG-1.4.3","https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum"]
});
const ERR=reason=>({ok:false,reason});
const isRecord=x=>x!==null&&typeof x==="object"&&!Array.isArray(x)
  &&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,names)=>isRecord(x)&&Object.keys(x).length===names.length
  &&names.every(k=>Object.hasOwn(x,k) && Object.getOwnPropertyDescriptor(x,k)?.get===undefined);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hex=/^[a-f0-9]{64}$/i;
const safeOrigin=x=>{
 try{
  if(typeof x!=="string"||x.length>180)return false;
  const url=new URL(x);
  return url.origin===x&&(url.protocol==="https:"||
    (url.protocol==="http:"&&["127.0.0.1","localhost","[::1]"].includes(url.hostname)));
 }catch{return false;}
};
const finiteNumber=v=>typeof v==="number"&&Number.isFinite(v);
const validVersion=v=>Number.isSafeInteger(v)&&v>=0&&v<=1_000_000;
const validIso=v=>typeof v==="string"&&v.length===24
  &&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)
  &&!Number.isNaN(Date.parse(v));
function canonicalString(value) {
 if(value===null)return "null";
 if(typeof value==="string"||typeof value==="boolean")return JSON.stringify(value);
 if(finiteNumber(value))return JSON.stringify(value);
 if(Array.isArray(value))return "["+value.map(canonicalString).join(",")+"]";
 if(!isRecord(value))throw TypeError("receipt has unsupported type");
 return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonicalString(value[k])).join(",")+"}";
}
function evidenceValid(fixId,x) {
 if(!exact(x,["version","target"])||!validVersion(x.version))return false;
 const t=x.target;
 switch(fixId){
  case "associate_label":return exact(t,["labelPresent","inputPresent","linked"])
    &&["labelPresent","inputPresent","linked"].every(k=>typeof t[k]==="boolean");
  case "announce_errors":return exact(t,["errorVisible","roleAlert","ariaLiveAssertive"])
    &&["errorVisible","roleAlert","ariaLiveAssertive"].every(k=>typeof t[k]==="boolean");
  case "increase_contrast":return exact(t,["contrastRatio"])
    &&finiteNumber(t.contrastRatio)&&t.contrastRatio>=1&&t.contrastRatio<=21;
  default:return false;
 }
}
function targetFixed(fixId, before, after, undone) {
 const a=before.target,b=after.target,c=undone?.target;
 if(fixId==="associate_label"){
  if(!a.labelPresent||!a.inputPresent||a.linked
    ||!b.labelPresent||!b.inputPresent||!b.linked)return false;
  return !c||(c.labelPresent&&c.inputPresent&&!c.linked);
 }
 if(fixId==="announce_errors"){
  if(!a.errorVisible||a.roleAlert||a.ariaLiveAssertive
    ||!b.errorVisible||!b.roleAlert||!b.ariaLiveAssertive)return false;
  return !c||(c.errorVisible&&!c.roleAlert&&!c.ariaLiveAssertive);
 }
 if(!(a.contrastRatio<4.5&&b.contrastRatio>=4.5))return false;
 return !c||Math.abs(c.contrastRatio-a.contrastRatio)<=0.05;
}

// Reuse the exact existing targeted DOM semantics for peer-assisted UI evidence.
// Does not certify an LLM, a publisher, or full accessibility conformance.
export function validateObservedTargetTransition({fixId,before,after,undone=null}) {
 if(!evidenceValid(fixId,before)||!evidenceValid(fixId,after))
  return ERR("observations_invalid");
 if(before.version+1!==after.version)return ERR("apply_version_invalid");
 if(undone!==null&&(!evidenceValid(fixId,undone)||undone.version!==after.version+1))
  return ERR("undo_version_invalid");
 if(!targetFixed(fixId,before,after,undone))return ERR("observed_transition_invalid");
 return {ok:true,status:undone===null?"APPLIED_OBSERVED":"UNDONE_OBSERVED"};
}

export function validateReceiptPayload(payload) {
 if(!exact(payload,["schema","receiptId","createdAt","siteOrigin","scope","policy","action","observations","status"]))
  return ERR("schema_invalid");
 if(payload.schema!==RECEIPT_SCHEMA||!uuid.test(payload.receiptId)
    ||!validIso(payload.createdAt)||!safeOrigin(payload.siteOrigin)||payload.scope!==SCOPE)
  return ERR("metadata_invalid");
 const policy=payload.policy,action=payload.action,obs=payload.observations;
 if(!exact(policy,["method","origin","revision","sha256","assessmentRequestId","ruleId","sourceId","sourceUrl"])
   ||policy.method!=="sha256-pinned-public-rulepack"||!safeOrigin(policy.origin)
   ||policy.origin===payload.siteOrigin||policy.revision!==POLICY_REVISION
   ||policy.sha256!==POLICY_SHA256||!uuid.test(policy.assessmentRequestId))return ERR("policy_invalid");
 if(!exact(action,["fixId","approval","appliedVersion","undoneVersion"])
   ||!Object.hasOwn(SOURCES,action.fixId)
   ||action.approval!=="explicit_browser_dialog"
   ||!validVersion(action.appliedVersion))return ERR("action_invalid");
 if(policy.ruleId!==ASSESSMENT_RULES[action.fixId].ruleId
   ||policy.sourceId!==SOURCES[action.fixId][0]||policy.sourceUrl!==SOURCES[action.fixId][1])
   return ERR("reference_invalid");
 if(!exact(obs,["before","after","undone"])
   ||!evidenceValid(action.fixId,obs.before)||!evidenceValid(action.fixId,obs.after))
   return ERR("observations_invalid");
 if(obs.before.version+1!==obs.after.version||obs.after.version!==action.appliedVersion)
   return ERR("apply_version_invalid");
 if(payload.status===STATUS_APPLIED){
  if(action.undoneVersion!==null||obs.undone!==null)return ERR("pending_undo_invalid");
 }else if(payload.status===STATUS_UNDONE){
  if(!validVersion(action.undoneVersion)||!evidenceValid(action.fixId,obs.undone)
    ||obs.undone.version!==action.undoneVersion
    ||obs.undone.version!==obs.after.version+1)return ERR("undo_version_invalid");
 }else return ERR("status_invalid");
 if(!targetFixed(action.fixId,obs.before,obs.after,obs.undone))
   return ERR("observed_transition_invalid");
 return {ok:true,status:payload.status};
}

export function createEvidencePayload({receiptId,createdAt,siteOrigin,policyVerdict,fixId,before,after}) {
 const policy=policyVerdict;
 const payload={
  schema:RECEIPT_SCHEMA,receiptId,createdAt,siteOrigin,scope:SCOPE,
  policy:{
   method:"sha256-pinned-public-rulepack",origin:policy?.servedFrom,
   revision:policy?.policyRevision,sha256:policy?.policySha256,assessmentRequestId:policy?.policyRequestId,
   ruleId:ASSESSMENT_RULES[fixId]?.ruleId,sourceId:policy?.sourceId,
   sourceUrl:policy?.sourceUrl
  },
  action:{fixId,approval:"explicit_browser_dialog",appliedVersion:after.version,undoneVersion:null},
  observations:{before,after,undone:null},
  status:STATUS_APPLIED
 };
 const checked=validateReceiptPayload(payload);
 return checked.ok?{ok:true,payload}:checked;
}
export function completeUndoPayload(payload,undone) {
 if(validateReceiptPayload(payload).ok!==true||payload.status!==STATUS_APPLIED)
  return ERR("invalid_pending_receipt");
 const next={
  ...payload,
  action:{...payload.action,undoneVersion:undone?.version},
  observations:{...payload.observations,undone},
  status:STATUS_UNDONE
 };
 const checked=validateReceiptPayload(next);
 return checked.ok?{ok:true,payload:next}:checked;
}
export async function sealEvidenceReceipt(payload,cryptoImpl=globalThis.crypto) {
 const valid=validateReceiptPayload(payload);
 if(!valid.ok)return valid;
 const bytes=new TextEncoder().encode(canonicalString(payload));
 const digest=await cryptoImpl.subtle.digest("SHA-256",bytes);
 const sha256=Array.from(new Uint8Array(digest))
   .map(x=>x.toString(16).padStart(2,"0")).join("");
 return {ok:true,receipt:{
  payload:JSON.parse(JSON.stringify(payload)),
  integrity:{algorithm:"SHA-256",digest:sha256},
  warning:"Self-attested browser observations; integrity is not independent authentication or WCAG certification."
 }};
}
export async function verifyEvidenceReceipt(receipt,cryptoImpl=globalThis.crypto) {
 if(!exact(receipt,["payload","integrity","warning"])
   ||!exact(receipt.integrity,["algorithm","digest"])
   ||receipt.integrity.algorithm!=="SHA-256"||!hex.test(receipt.integrity.digest)
   ||receipt.warning!=="Self-attested browser observations; integrity is not independent authentication or WCAG certification.")
   return ERR("receipt_envelope_invalid");
 const valid=validateReceiptPayload(receipt.payload);
 if(!valid.ok)return valid;
 let hash;
 try{
  const bytes=new TextEncoder().encode(canonicalString(receipt.payload));
  const d=await cryptoImpl.subtle.digest("SHA-256",bytes);
  hash=Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("");
 }catch{return ERR("hash_check_unavailable");}
 if(hash!==receipt.integrity.digest)return ERR("integrity_mismatch");
 return {ok:true,status:receipt.payload.status,fixId:receipt.payload.action.fixId,
   receiptId:receipt.payload.receiptId,assurance:"self_attested_only"};
}

// Deliberately whitelisted DOM signals. No input .value, textual error message,
// email, DOM subtree, cookies, prompts, URLs with query strings, or credentials.
export function captureTargetedObservation({documentImpl,computedStyle,fixId,version,contrastReader}) {
 const doc=documentImpl;
 if(!validVersion(version)||!doc?.getElementById)return ERR("observation_unavailable");
 let target;
 if(fixId==="associate_label"){
  const label=doc.getElementById("email-label"),input=doc.getElementById("email");
  target={labelPresent:!!label,inputPresent:!!input,
    linked:!!(label&&input&&label.htmlFor===input.id&&input.id==="email")};
 }else if(fixId==="announce_errors"){
  const error=doc.getElementById("form-error");
  target={errorVisible:!!(error&&error.textContent?.trim()),
    roleAlert:!!(error&&error.getAttribute("role")==="alert"),
    ariaLiveAssertive:!!(error&&error.getAttribute("aria-live")==="assertive")};
 }else if(fixId==="increase_contrast"){
  const ratio=contrastReader?.({documentImpl:doc,styleImpl:computedStyle})?.increase_contrast;
  if(!finiteNumber(ratio))return ERR("contrast_unmeasurable");
  target={contrastRatio:Math.round(ratio*1000)/1000};
 }else return ERR("unknown_fix");
 const observation={version,target};
 return evidenceValid(fixId,observation)?{ok:true,observation}:ERR("observation_invalid");
}
