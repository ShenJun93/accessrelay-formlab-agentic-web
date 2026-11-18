// P770: Bind a consented, exact-origin peer assessment to ONE local preview/version.
// This is not an authorization to write or independent proof of an agent's claims.
const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=reason=>({ok:false,reason});
const safePeerOrigin=value=>{
 if(typeof value!=="string"||value.length>180)return false;
 try{
  const u=new URL(value);
  return value===u.origin &&
   (u.protocol==="https:"||(u.protocol==="http:"&&["127.0.0.1","localhost","[::1]"].includes(u.hostname)));
 }catch{return false;}
};

export function createVerifiedPeerBinding({verdict,selectedIssue,preview,currentVersion}) {
 if(!verdict||verdict.ok!==true||verdict.requiresHumanApproval!==true||
    verdict.verifiedDomChange!==false||typeof selectedIssue!=="string"||
    !UUID_V4.test(verdict.requestId??"")||!safePeerOrigin(verdict.trustedPeerOrigin)||
    typeof verdict.ruleId!=="string"||!verdict.ruleId.startsWith("form-"))
  return fail("invalid_peer_assessment");
 if(!preview?.ok||verdict.issueId!==selectedIssue||preview.fixId!==selectedIssue)
  return fail("assessment_target_changed");
 if(!Number.isSafeInteger(currentVersion)||currentVersion<0||
    verdict.assessedVersion!==currentVersion||preview.expectedVersion!==currentVersion)
  return fail("stale_form_version");
 return {ok:true,binding:Object.freeze({
  issueId:selectedIssue,expectedVersion:currentVersion,ruleId:verdict.ruleId,
  requestId:verdict.requestId,trustedPeerOrigin:verdict.trustedPeerOrigin,
  provenance:"origin-bound-agent-advice-not-independent-audit"
 })};
}

export function checkVerifiedPeerBinding(binding,{fixId,version}) {
 if(!binding)return {ok:true,mode:"manual"};
 if(!Object.isFrozen(binding)||!UUID_V4.test(binding.requestId??"")||
    !safePeerOrigin(binding.trustedPeerOrigin)||binding.issueId!==fixId||
    !Number.isSafeInteger(version)||version!==binding.expectedVersion)
  return fail("verified_peer_assessment_expired");
 return {ok:true,mode:"peer-advised"};
}
