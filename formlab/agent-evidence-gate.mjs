// P780: evidence the visitor's FormLab can observe before asking a remote model.
// Exact allowlisted signals only. Never reads or returns email input values,
// arbitrary DOM text, HTML, provider keys, model output or user identifiers.
const SIGNALS=Object.freeze({
 associate_label:"visible_label_unassociated",
 announce_errors:"visible_validation_error_unannounced",
 increase_contrast:"computed_contrast_below_4_5"
});
const fail=reason=>Object.freeze({ok:false,reason});

export function assessLocalAgentEvidence({issueId,evidence}) {
 if(!Object.hasOwn(SIGNALS,issueId))return fail("unknown_targeted_issue");
 if(!evidence||typeof evidence!=="object"||Array.isArray(evidence))
  return fail("first_party_dom_evidence_unavailable");
 let value;
 try{value=Object.getOwnPropertyDescriptor(evidence,issueId)?.value;}
 catch{return fail("first_party_dom_evidence_unavailable");}
 // FormLab's dedicated DOM reader returns these booleans and a measured ratio.
 // Explicitly reject accessors to avoid unexpected side effects/PII extraction.
 if(issueId==="increase_contrast"){
  if(typeof value!=="number"||!Number.isFinite(value)||value<1)
   return fail("first_party_contrast_unmeasurable");
  if(value>=4.5)return fail("target_condition_not_observed");
 }else if(value!==true){
  return fail(value===false?"target_condition_not_observed":"first_party_dom_evidence_unavailable");
 }
 return Object.freeze({ok:true,signal:SIGNALS[issueId],provenance:"caller_first_party_dom_only"});
}
