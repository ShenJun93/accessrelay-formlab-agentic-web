// P768 shared source-level primitive: independent domains can verify exactly
// the same deterministic JSON -> SHA-256 bytes. No signing or identity claim.
const ERR=reason=>({ok:false,reason});
const REC=v=>v!==null&&typeof v==="object"&&!Array.isArray(v)
 &&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
export function canonicalJson(value,depth=0) {
 if(depth>18)throw TypeError("too_deep");
 if(value===null)return "null";
 if(typeof value==="string"||typeof value==="boolean")return JSON.stringify(value);
 if(typeof value==="number"&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value)){
  if(value.length>300)throw TypeError("too_many_items");
  return "["+value.map(x=>canonicalJson(x,depth+1)).join(",")+"]";
 }
 if(!REC(value))throw TypeError("non_plain_json");
 const keys=Object.keys(value).sort();
 if(keys.length>80)throw TypeError("too_many_fields");
 const descriptors=Object.getOwnPropertyDescriptors(value);
 for(const key of keys)if(!Object.hasOwn(descriptors[key],"value"))
    throw TypeError("accessor_disallowed");
 return "{"+keys.map(k=>JSON.stringify(k)+":"+canonicalJson(descriptors[k].value,depth+1)).join(",")+"}";
}
export async function contentSha256(value,cryptoImpl=globalThis.crypto) {
 const bytes=new TextEncoder().encode(canonicalJson(value));
 if(bytes.byteLength>24000)throw TypeError("receipt_too_large");
 const hash=await cryptoImpl.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
const DIGEST=/^[a-f0-9]{64}$/;
export async function sealPortable(payload,validate,cryptoImpl=globalThis.crypto) {
 if(typeof validate!=="function")return ERR("validator_missing");
 const status=validate(payload);
 if(!status?.ok)return status?.reason?status:ERR("payload_invalid");
 try{
  const safe=JSON.parse(JSON.stringify(payload));
  const digest=await contentSha256(safe,cryptoImpl);
  return {ok:true,receipt:{payload:safe,integrity:{algorithm:"SHA-256",digest},
   warning:"Self-attested browser observations; integrity is not independent authentication or WCAG certification."}};
 }catch{return ERR("cannot_seal");}
}
export async function verifyPortable(receipt,validate,cryptoImpl=globalThis.crypto) {
 if(!REC(receipt)||Object.keys(receipt).length!==3
   ||!Object.hasOwn(receipt,"payload")||!Object.hasOwn(receipt,"integrity")
   ||!Object.hasOwn(receipt,"warning")||!REC(receipt.integrity)
   ||Object.keys(receipt.integrity).length!==2
   ||receipt.integrity.algorithm!=="SHA-256"
   ||!DIGEST.test(receipt.integrity.digest)
   ||receipt.warning!=="Self-attested browser observations; integrity is not independent authentication or WCAG certification.")
   return ERR("invalid_envelope");
 if(typeof validate!=="function")return ERR("validator_missing");
 const status=validate(receipt.payload);
 if(!status?.ok)return status?.reason?status:ERR("payload_invalid");
 let digest;try{digest=await contentSha256(receipt.payload,cryptoImpl)}
 catch{return ERR("digest_unavailable")}
 return digest===receipt.integrity.digest?{ok:true,status:status.status??"VALIDATED",
  assurance:"self_attested_only"}:ERR("integrity_mismatch");
}
