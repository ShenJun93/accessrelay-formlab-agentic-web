// Offline verifier for a FormLab JSON receipt. No network, tokens, or private inputs.
import {readFile,stat} from "node:fs/promises";
import {webcrypto} from "node:crypto";
import {verifyEvidenceReceipt} from "../formlab/evidence-receipt.mjs";

const file=process.argv[2];
if(!file||process.argv.length!==3){
 console.error("Usage: node dev/verify-receipt.mjs <downloaded-receipt.json>");
 process.exitCode=2;
}else{
 try{
  if((await stat(file)).size>24000)throw Error("Receipt exceeds 24 KB");
  const text=await readFile(file,"utf8");
  const checked=await verifyEvidenceReceipt(JSON.parse(text),webcrypto);
  if(!checked.ok){
   console.error("INVALID: "+checked.reason);
   process.exitCode=1;
  }else{
   console.log("INTEGRITY PASS: "+checked.status+" / "+checked.fixId);
   console.log("Receipt ID: "+checked.receiptId);
   console.log("Assurance: self-attested browser evidence only; NOT a trusted signature or a WCAG audit.");
  }
 }catch{
  console.error("INVALID: JSON could not be read or parsed");
  process.exitCode=1;
 }
}
