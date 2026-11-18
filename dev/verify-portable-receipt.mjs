// P768: offline read-only verifier for FormLab v1 and Harbor Basket v1.
// Never contacts servers, loads scripts from receipt, or processes personal fields.
import {readFile,stat} from "node:fs/promises";
import {webcrypto} from "node:crypto";
import {verifyPortable} from "../shared/portable-integrity.mjs";
import {validateReceiptPayload} from "../formlab/evidence-receipt.mjs";
import {validateBasketPayload} from "../harbor-receipt/evidence/basket-evidence.mjs";

const file=process.argv[2];
if(!file||process.argv.length!==3){
 console.error("Usage: node dev/verify-portable-receipt.mjs <receipt.json>");
 process.exitCode=2;
}else{
 try{
  const {size}=await stat(file);
  if(size>24000)throw Error("size");
  const payload=JSON.parse(await readFile(file,"utf8"));
  const kind=payload?.payload?.schema;
  const validate=kind==="formlab-reversible-evidence/v1"
   ?validateReceiptPayload:kind==="harbor-basket-evidence/v1"
   ?validateBasketPayload:null;
  if(!validate){
   console.error("INVALID: unsupported receipt schema");
   process.exitCode=1;
  }else{
   const checked=await verifyPortable(payload,validate,webcrypto);
   if(!checked.ok){
    console.error("INVALID: "+checked.reason);
    process.exitCode=1;
   }else{
    console.log("INTEGRITY PASS: "+kind+" / "+checked.status);
    console.log("Assurance: SELF-ATTESTED ONLY — no signature, independent witness, booking, payment or WCAG certification.");
   }
  }
 }catch{
  console.error("INVALID: file unreadable, oversized, malformed or not a receipt");
  process.exitCode=1;
 }
}
