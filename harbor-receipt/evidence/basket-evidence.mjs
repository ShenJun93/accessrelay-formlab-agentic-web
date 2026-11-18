// P768 — second domain: safe, reversible trip basket. No bookings, identities or payment.
import {TourData} from "../js/tour-data.js";
import {FareCalculator} from "../js/fare-calculator.js";
import {sealPortable,verifyPortable} from "../../shared/portable-integrity.mjs";

export const BASKET_SCHEMA="harbor-basket-evidence/v1";
export const SOURCE_COMMIT="7817c1f75b8d4f497c869540212be17dda94dcae";
const TOUR=TourData.TOURS.find(x=>x.id==="seal-rocks");
const FIXED_TIME="14:00";
const ERROR=reason=>({ok:false,reason});
const plain=o=>o!==null&&typeof o==="object"&&!Array.isArray(o)
  &&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const exact=(v,names)=>plain(v)&&Object.keys(v).length===names.length
  &&names.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),"value"));
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const validVersion=v=>Number.isSafeInteger(v)&&v>=0&&v<1_000_000;
const validOrigin=s=>{
 try{const u=new URL(s);return s===u.origin&&
   (u.protocol==="https:"||(u.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(u.hostname)));}
 catch{return false;}
};
const expectedCents=FareCalculator.quote(TOUR,{adults:1,children:0,under4s:0}).total;
export function makeDemoTrip(date){
 if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date)
  ||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)
  throw TypeError("valid date required");
 return {tourId:TOUR.id,date,time:FIXED_TIME,adults:1,children:0,under4s:0};
}
export function observeBasket(page,doc,expectedTrip) {
 if(!page?.basketState||!page.pricedBasket||!doc?.getElementById||!expectedTrip)return ERROR("basket_unavailable");
 const state=page.basketState(),priced=page.pricedBasket();
 const list=doc.getElementById("reserve-basket");
 const total=doc.getElementById("basket-total");
 if(!list||!total||!validVersion(state.version)||!Array.isArray(state.trips)
   ||state.trips.length>8||!Number.isSafeInteger(priced.total)||priced.total<0)return ERROR("basket_observation_invalid");
 const removes=list.querySelectorAll('button').length;
 const obs={
   version:state.version,
   tripCount:state.trips.length,
   totalCents:priced.total,
   removeControls:removes,
   totalVisible:!total.hidden,
   targetMatch:state.trips.length===1&&state.trips[0]?.tourId===expectedTrip.tourId
     &&state.trips[0]?.date===expectedTrip.date&&state.trips[0]?.time===expectedTrip.time
 };
 return validateObservation(obs)?{ok:true,observation:obs}:ERROR("basket_observation_invalid");
}
function validateObservation(o){
 return exact(o,["version","tripCount","totalCents","removeControls","totalVisible","targetMatch"])
  &&validVersion(o.version)
  &&Number.isSafeInteger(o.tripCount)&&o.tripCount>=0&&o.tripCount<=8
  &&Number.isSafeInteger(o.totalCents)&&o.totalCents>=0&&o.totalCents<=1e8
  &&Number.isSafeInteger(o.removeControls)&&o.removeControls>=0&&o.removeControls<=8
  &&typeof o.totalVisible==="boolean"&&typeof o.targetMatch==="boolean";
}
export function validateBasketPayload(p){
 if(!exact(p,["schema","receiptId","createdAt","siteOrigin","sitePath","source","quote","action","observations","status"]))
  return ERROR("schema_invalid");
 if(p.schema!==BASKET_SCHEMA||!uuid.test(p.receiptId)||typeof p.createdAt!=="string"
   ||p.createdAt.length!==24||!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(p.createdAt)
   ||Number.isNaN(Date.parse(p.createdAt))||!validOrigin(p.siteOrigin)
   ||p.sitePath!=="/harbor-receipt/")return ERROR("metadata_invalid");
 if(!exact(p.source,["kind","sample","upstreamCommit"])
   ||p.source.kind!=="first-party-quote-rules"
   ||p.source.sample!=="Marrow Point Harbor Tours demo"
   ||p.source.upstreamCommit!==SOURCE_COMMIT)return ERROR("source_invalid");
 const q=p.quote;
 if(!exact(q,["tourId","date","time","adults","children","under4s","quotedCents"])
   ||q.tourId!==TOUR.id||q.time!==FIXED_TIME
   ||q.adults!==1||q.children!==0||q.under4s!==0||q.quotedCents!==expectedCents)
   return ERROR("quote_invalid");
 try{makeDemoTrip(q.date)}catch{return ERROR("quote_invalid")}
 if(!exact(p.action,["kind","approval","appliedVersion","undoneVersion"])
   ||p.action.kind!=="basket-add-trip"
   ||p.action.approval!=="native-user-confirmation"
   ||!validVersion(p.action.appliedVersion))return ERROR("action_invalid");
 const o=p.observations;
 if(!exact(o,["before","after","undone"])
   ||!validateObservation(o.before)||!validateObservation(o.after))return ERROR("observations_invalid");
 const b=o.before,a=o.after;
 if(a.version!==b.version+1||a.version!==p.action.appliedVersion)
   return ERROR("apply_version_invalid");
 if(b.tripCount!==0||b.totalCents!==0||b.removeControls!==0||b.totalVisible
   ||a.tripCount!==1||a.totalCents!==expectedCents
   ||a.removeControls!==1||!a.totalVisible||a.targetMatch!==true
   ||b.targetMatch!==false)return ERROR("observed_basket_invalid");
 if(p.status==="APPLIED_PENDING_UNDO"){
  if(p.action.undoneVersion!==null||o.undone!==null)return ERROR("invalid_pending");
 }else if(p.status==="UNDONE_OBSERVED"){
  const u=o.undone;
  if(!validVersion(p.action.undoneVersion)||!validateObservation(u)
    ||u.version!==a.version+1||u.version!==p.action.undoneVersion)
    return ERROR("undo_version_invalid");
  if(u.tripCount!==0||u.totalCents!==0||u.removeControls!==0||u.totalVisible||u.targetMatch)
    return ERROR("undo_not_restored");
 }else return ERROR("status_invalid");
 return {ok:true,status:p.status};
}
export function makeBasketReceipt({receiptId,createdAt,siteOrigin,trip,before,after}){
 const p={
  schema:BASKET_SCHEMA,receiptId,createdAt,siteOrigin,sitePath:"/harbor-receipt/",
  source:{kind:"first-party-quote-rules",sample:"Marrow Point Harbor Tours demo",upstreamCommit:SOURCE_COMMIT},
  quote:{...trip,quotedCents:expectedCents},
  action:{kind:"basket-add-trip",approval:"native-user-confirmation",appliedVersion:after.version,undoneVersion:null},
  observations:{before,after,undone:null},status:"APPLIED_PENDING_UNDO"
 };
 const v=validateBasketPayload(p);return v.ok?{ok:true,payload:p}:v;
}
export function markBasketUndo(payload,undone){
 if(!validateBasketPayload(payload).ok||payload.status!=="APPLIED_PENDING_UNDO")return ERROR("not_pending");
 const p={...payload,action:{...payload.action,undoneVersion:undone?.version},
  observations:{...payload.observations,undone},status:"UNDONE_OBSERVED"};
 const v=validateBasketPayload(p);return v.ok?{ok:true,payload:p}:v;
}
export const sealBasketReceipt=(payload,crypto)=>sealPortable(payload,validateBasketPayload,crypto);
export const verifyBasketReceipt=(receipt,crypto)=>verifyPortable(receipt,validateBasketPayload,crypto);
export function projectedQuoteCents(){return expectedCents;}
