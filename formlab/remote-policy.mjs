// P766: externally served, SHA-256-pinned public rule pack.
// Read-only data fetch, no cloud inference, no form values, no peer-provided code.
import {manifestAllowsPeer} from "./runtime/engine.js";
import {
 ASSESSMENT_RULES, ASSESSMENT_PROTOCOL,
 makeAssessmentRequest, createSingleUseAssessmentGate
} from "./peer-assessment.mjs";

export const POLICY_SHA256="60ba135536c3b93954b891e531c5db9e9b9bc1ee216630c99d5bc24750f364d0";
export const POLICY_REVISION="2026-11-18.1";
export const POLICY_FILE="accessibility-policy-v1.json";
const MAX_BYTES=8192;
const SOURCE_URLS=Object.freeze({
 "WCAG-1.3.1":"https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships",
 "WCAG-3.3.1":"https://www.w3.org/WAI/WCAG22/Understanding/error-identification",
 "WCAG-1.4.3":"https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum"
});
const CONDITIONS=Object.freeze({
 associate_label:{condition:"visible_label_unassociated",sourceId:"WCAG-1.3.1"},
 announce_errors:{condition:"visible_validation_error_unannounced",sourceId:"WCAG-3.3.1"},
 increase_contrast:{condition:"computed_contrast_below_threshold",sourceId:"WCAG-1.4.3"}
});
const fail=reason=>({ok:false,reason});
const exact=(v,keys)=>!!v&&typeof v==="object"&&!Array.isArray(v)
 && Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));

function validatePolicy(pack) {
 const keys=["protocol","packId","revision","publisher","scope","sources","rules"];
 if(!exact(pack,keys)||pack.protocol!=="accessrelay-accessibility-policy/v1"
   ||pack.packId!=="accessrelay-form-safety"||pack.revision!==POLICY_REVISION
   ||pack.publisher!=="AccessRelay demonstration maintainers (independent from W3C)"
   ||pack.scope!=="Targeted FormLab demonstration only; not a WCAG conformance audit"
   ||!Array.isArray(pack.sources)||pack.sources.length!==3
   ||!Array.isArray(pack.rules)||pack.rules.length!==3) return false;
 for(let i=0;i<3;i++){
   const id=Object.keys(SOURCE_URLS)[i],source=pack.sources[i];
   if(!exact(source,["id","url"])||source.id!==id||source.url!==SOURCE_URLS[id])return false;
 }
 for(let i=0;i<3;i++){
   const id=Object.keys(CONDITIONS)[i],rule=pack.rules[i];
   const keys=["issueId","ruleId","reasonCode","sourceId","condition",
     ...(id==="increase_contrast"?["contrastThreshold"]:[]),"decisionWhenMet","fallback"];
   if(!exact(rule,keys)||rule.issueId!==id||rule.ruleId!==ASSESSMENT_RULES[id].ruleId
      ||rule.reasonCode!==ASSESSMENT_RULES[id].reasonCode
      ||rule.sourceId!==CONDITIONS[id].sourceId
      ||rule.condition!==CONDITIONS[id].condition
      ||rule.decisionWhenMet!=="recommend"||rule.fallback!=="hold")return false;
   if(id==="increase_contrast"&&rule.contrastThreshold!==4.5)return false;
 }
 return true;
}

async function limitedBytes(response) {
 const length=response.headers?.get?.("content-length");
 if(length && (+length>MAX_BYTES||!/^(?:0|[1-9][0-9]*)$/.test(length)))throw Error("size");
 if(response.body?.getReader) {
   const reader=response.body.getReader();
   const chunks=[];let size=0;
   try {
     while(true){
       const {done,value}=await reader.read();if(done)break;
       size+=value.byteLength;
       if(size>MAX_BYTES){await reader.cancel().catch(()=>{});throw Error("size");}
       chunks.push(value);
     }
   }finally{reader.releaseLock();}
   const all=new Uint8Array(size);let off=0;
   for(const chunk of chunks){all.set(chunk,off);off+=chunk.byteLength;}
   return all;
 }
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.byteLength>MAX_BYTES)throw Error("size");
 return bytes;
}
export async function fetchPinnedPolicy({origin,fetchImpl=fetch,cryptoImpl=crypto}) {
 let url;try{
   const u=new URL(origin);
   if(origin!==u.origin || !["https:","http:"].includes(u.protocol)
      ||(u.protocol==="http:"&&!["localhost","127.0.0.1","[::1]"].includes(u.hostname)))
     return fail("policy_origin_invalid");
   url=new URL("/"+POLICY_FILE,u.origin).href;
 }catch{return fail("policy_origin_invalid");}
 let response;
 try{
   response=await fetchImpl(url,{mode:"cors",credentials:"omit",redirect:"error",cache:"no-store"});
 }catch{return fail("policy_fetch_failed");}
 if(!response?.ok||response.status!==200)return fail("policy_http_rejected");
 if(response.url!==url)return fail("policy_response_url_mismatch");
 const ct=response.headers?.get?.("content-type")??"";
 if(!/^(application\/json|application\/[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(ct))
   return fail("policy_content_type_invalid");
 let bytes;try{bytes=await limitedBytes(response);}catch{return fail("policy_size_or_read_error");}
 let hash;try{
   hash=Array.from(new Uint8Array(await cryptoImpl.subtle.digest("SHA-256",bytes)))
     .map(x=>x.toString(16).padStart(2,"0")).join("");
 }catch{return fail("policy_digest_unavailable");}
 if(hash!==POLICY_SHA256)return fail("policy_digest_mismatch");
 let pack;try{pack=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
 catch{return fail("policy_json_invalid");}
 if(!validatePolicy(pack))return fail("policy_schema_invalid");
 return {ok:true,pack,sha256:hash,servedFrom:new URL(response.url).origin};
}
function rgb(s) {
 const m=/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(s??"");
 if(!m)return null;
 const values=m.slice(1).map(Number);
 return values.every(x=>x>=0&&x<=255)?values:null;
}
function luminance(v) {
 const x=v.map(n=>{const c=n/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;});
 return x[0]*.2126+x[1]*.7152+x[2]*.0722;
}
function ratio(a,b) {
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
export function readTargetedEvidence({documentImpl,styleImpl}) {
 const doc=documentImpl;
 if(!doc?.getElementById)return {associate_label:false,announce_errors:false,increase_contrast:false};
 const label=doc.getElementById("email-label"),input=doc.getElementById("email");
 const labelMissing=!!(label&&input&&label.tagName==="LABEL"&&input.tagName==="INPUT"
   &&input.id==="email"&&label.textContent?.trim()&&label.htmlFor!==input.id);
 const feedback=doc.getElementById("form-error");
 const errorMissing=!!(feedback&&feedback.textContent?.trim()
   &&feedback.getAttribute("role")!=="alert"
   &&feedback.getAttribute("aria-live")!=="assertive");
 let contrast=null;
 const helper=doc.getElementById("helper");
 if(helper&&typeof styleImpl==="function"){
   try{
     const fg=rgb(styleImpl(helper).color);
     let node=helper,background=null;
     for(let i=0;node&&i<9;i++,node=node.parentElement){
       background=rgb(styleImpl(node).backgroundColor);
       if(background)break;
     }
     if(fg&&background)contrast=ratio(fg,background);
   }catch{contrast=null;}
 }
 return {
   associate_label:labelMissing,announce_errors:errorMissing,
   increase_contrast:Number.isFinite(contrast)?contrast:null
 };
}
export function assessPolicyEvidence({pack,fixId,evidence}) {
 if(!validatePolicy(pack))return fail("policy_schema_invalid");
 const rule=pack.rules.find(r=>r.issueId===fixId);
 if(!rule)return fail("policy_issue_not_supported");
 const measured=evidence?.[fixId];
 const conditionMet=fixId==="increase_contrast"
   ? typeof measured==="number"&&Number.isFinite(measured)&&measured>=1
      &&measured<rule.contrastThreshold
   : measured===true;
 return {ok:true,decision:conditionMet?"recommend":"hold",ruleId:rule.ruleId,
    issueId:fixId,sourceId:rule.sourceId,sourceUrl:SOURCE_URLS[rule.sourceId],
    revision:pack.revision,measuredContrast:fixId==="increase_contrast"?measured:null,
    evidenceMatched:conditionMet};
}

export async function requestPinnedPolicyAssessment({
 engine,peerOrigin,localOrigin,fixId,requestId,readCurrentState,
 readEvidence,fetchImpl=fetch,cryptoImpl=crypto
}) {
 if(!engine?.top?.manifest||typeof engine.requestConsent!=="function"
    ||typeof engine.onConsent!=="function")return fail("consent_ui_unavailable");
 if(typeof readCurrentState!=="function"||typeof readEvidence!=="function")
   return fail("first_party_evidence_unavailable");
 let request;
 try{
   if(!manifestAllowsPeer(peerOrigin+"/accessrelay",engine.top.manifest))
     return fail("policy_peer_not_allowlisted");
   request=makeAssessmentRequest({
     state:readCurrentState(),fixId,requestId,siteOrigin:new URL(localOrigin).origin,peerOrigin
   });
 }catch{return fail("policy_request_invalid");}
 let consent;
 try{
   consent=await engine.requestConsent({
     kind:"network",peerLabel:"AccessRelay public WCAG-based policy pack",peerOrigin,
     requestText:"Fetch public versioned policy (no form fields, input values or model call).",
     est:{totalTokens:0,costText:"No model inference"}
   });
 }catch{return fail("policy_consent_error");}
 if(!["allow","always"].includes(consent))return fail("policy_consent_declined");
 const loaded=await fetchPinnedPolicy({origin:peerOrigin,fetchImpl,cryptoImpl});
 if(!loaded.ok)return loaded;
 const evidence=readEvidence();
 const assessed=assessPolicyEvidence({pack:loaded.pack,fixId,evidence});
 if(!assessed.ok)return assessed;
 if(assessed.decision!=="recommend"){
   return {...assessed,ok:false,reason:"policy_requires_additional_evidence",
     verifiedPolicySha256:loaded.sha256,servedFrom:loaded.servedFrom};
 }
 const rule=ASSESSMENT_RULES[fixId];
 const reply={
   protocol:ASSESSMENT_PROTOCOL,requestId:request.requestId,
   siteOrigin:request.siteOrigin,peerOrigin:request.peerOrigin,
   issueId:request.issueId,ruleId:request.ruleId,expectedVersion:request.expectedVersion,
   decision:"recommend",reasonCode:rule.reasonCode
 };
 const gate=createSingleUseAssessmentGate({
   request,observedPeerOrigin:loaded.servedFrom
 });
 const verdict=gate.assess(reply,readCurrentState());
 if(!verdict.ok)return verdict;
 return {ok:true,mode:"versioned-policy-not-llm",requestId:request.requestId,issueId:verdict.issueId,
   expectedVersion:verdict.expectedVersion,sourceId:assessed.sourceId,
   sourceUrl:assessed.sourceUrl,policyRevision:assessed.revision,
   policySha256:loaded.sha256,servedFrom:loaded.servedFrom,
   verifiedDomChange:false,requiresHumanApproval:true,
   recommendedChange:verdict.recommendedChange,
   measuredContrast:assessed.measuredContrast};
}
