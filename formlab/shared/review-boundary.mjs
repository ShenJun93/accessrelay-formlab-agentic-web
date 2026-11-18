// P782 — reusable, framework-neutral human-review / TOCTOU gate.
// This module deliberately does not store keys, fetch remote data, run agents,
// issue a consent card, create receipts or mutate website state by itself.
// The host must supply an exact-site evidence adapter and a native approval UI.
// Public integrity receipts are separately provided by portable-integrity.mjs.
const refuse=reason=>Object.freeze({ok:false,reason});
const OPS=/^[a-z][a-z0-9-]{2,55}$/;
const FIELD=/^[a-z][a-zA-Z0-9]{0,39}$/;
const SAFE_VALUE=/^[a-zA-Z0-9_.:|,-]{0,160}$/;
function plain(obj){
 if(obj===null||typeof obj!=="object"||Array.isArray(obj))return false;
 const proto=Object.getPrototypeOf(obj);
 return proto===Object.prototype||proto===null;
}
function exactData(obj,keys){
 return plain(obj)&&Reflect.ownKeys(obj).length===keys.length&&
  keys.every(key=>Object.hasOwn(obj,key)&&
   Object.hasOwn(Object.getOwnPropertyDescriptor(obj,key),"value"));
}
function exactOrigin(origin){
 if(typeof origin!=="string"||origin.length>190)return false;
 try{
  const url=new URL(origin);
  return url.origin===origin&&!url.username&&!url.password&&!url.search&&!url.hash&&
   (url.protocol==="https:"||(url.protocol==="http:"&&
     ["127.0.0.1","localhost","[::1]"].includes(url.hostname)));
 }catch{return false;}
}
function safeEvidence(readEvidence){
 if(typeof readEvidence!=="function")return refuse("evidence_reader_missing");
 let observed;
 try{observed=readEvidence();}
 catch{return refuse("evidence_unavailable");}
 try{
  if(!exactData(observed,["version","facts"]))return refuse("evidence_schema_invalid");
  const version=observed.version;
  if(!Number.isSafeInteger(version)||version<0||version>=1_000_000)
   return refuse("version_invalid");
  const facts=observed.facts;
  if(!plain(facts))return refuse("facts_invalid");
  const keys=Reflect.ownKeys(facts);
  if(keys.length<1||keys.length>12)return refuse("facts_invalid");
  const normalized={};
  for(const key of keys.sort()){
   if(typeof key!=="string"||!FIELD.test(key))return refuse("fact_name_invalid");
   const property=Object.getOwnPropertyDescriptor(facts,key);
   if(!property||!Object.hasOwn(property,"value"))return refuse("fact_accessor_refused");
   const value=property.value;
   if(typeof value==="boolean"||(Number.isSafeInteger(value)&&Math.abs(value)<1e9)
      ||(typeof value==="string"&&SAFE_VALUE.test(value))){
    normalized[key]=value;
   }else return refuse("fact_value_invalid");
  }
  // Snapshot string is bounded, deterministic and contains no arbitrary HTML.
  return {ok:true,version,fingerprint:JSON.stringify(normalized)};
 }catch{return refuse("evidence_unavailable");}
}
export function captureReviewTicket({origin,operation,readEvidence}={}){
 if(!exactOrigin(origin))return refuse("origin_invalid");
 if(typeof operation!=="string"||!OPS.test(operation))return refuse("operation_invalid");
 const snapshot=safeEvidence(readEvidence);
 if(!snapshot.ok)return snapshot;
 return Object.freeze({ok:true,ticket:Object.freeze({
  origin,operation,version:snapshot.version,fingerprint:snapshot.fingerprint
 })});
}
export function checkReviewTicket({ticket,origin,operation,readEvidence,approved}={}){
 if(approved!==true)return refuse("approval_declined");
 if(!exactData(ticket,["origin","operation","version","fingerprint"]))
  return refuse("ticket_invalid");
 if(!exactOrigin(origin)||ticket.origin!==origin||ticket.operation!==operation)
  return refuse("ticket_scope_mismatch");
 if(!Number.isSafeInteger(ticket.version)||ticket.version<0
   ||typeof ticket.fingerprint!=="string"||ticket.fingerprint.length>2000)
  return refuse("ticket_invalid");
 const current=safeEvidence(readEvidence);
 if(!current.ok)return current;
 if(current.version!==ticket.version)return refuse("version_changed_after_review");
 if(current.fingerprint!==ticket.fingerprint)return refuse("facts_changed_after_review");
 return Object.freeze({ok:true,beforeVersion:ticket.version});
}
export function checkObservedTransition({ticket,readEvidence}={}){
 if(!exactData(ticket,["origin","operation","version","fingerprint"]))
  return refuse("ticket_invalid");
 const after=safeEvidence(readEvidence);
 if(!after.ok)return after;
 if(after.version!==ticket.version+1)return refuse("transition_version_invalid");
 if(after.fingerprint===ticket.fingerprint)return refuse("transition_not_observed");
 return Object.freeze({ok:true,afterVersion:after.version});
}
export async function runReviewedTransition({
 origin,operation,readEvidence,requestApproval,mutate
}={}){
 if(typeof requestApproval!=="function"||typeof mutate!=="function")
  return refuse("callbacks_missing");
 const entry=captureReviewTicket({origin,operation,readEvidence});
 if(!entry.ok)return entry;
 let approved;
 try{approved=await requestApproval();}
 catch{return refuse("approval_unavailable");}
 const checked=checkReviewTicket({
  ticket:entry.ticket,origin,operation,readEvidence,approved
 });
 if(!checked.ok)return checked;
 // Reject declared async functions before invocation; even a synchronous wrapper
 // returning a Promise must be treated as potentially already mutated.
 if(mutate.constructor?.name==="AsyncFunction")return refuse("async_mutation_not_supported");
 let result;
 try{result=mutate();}
 catch{return Object.freeze({ok:false,reason:"site_action_threw_check_live_state",didMutate:true});}
 if(result&&typeof result.then==="function")
  return Object.freeze({ok:false,reason:"async_mutation_unverified",didMutate:true});
 if(!result||result.ok!==true)return refuse("site_action_refused");
 const post=checkObservedTransition({ticket:entry.ticket,readEvidence});
 if(!post.ok)return Object.freeze({ok:false,reason:"action_executed_unverified",
  detail:post.reason,didMutate:true});
 return Object.freeze({ok:true,beforeVersion:checked.beforeVersion,
  afterVersion:post.afterVersion,result});
}
