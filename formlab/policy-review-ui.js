// P766: a consented, no-LLM, independently hosted policy decision.
// Never render remote prose or execute remote JavaScript/HTML.
import {formController} from "./form-controller.js";
import {clearQualifiedPolicy,markQualifiedPolicy} from "./evidence-receipt-ui.js";
import {
  requestPinnedPolicyAssessment,readTargetedEvidence
} from "./remote-policy.mjs";

export function setupPolicyReviewUi(engine) {
 const button=document.getElementById("policy-review");
 const selector=document.getElementById("peer-assess-issue");
 const status=document.getElementById("policy-review-status");
 const proof=document.getElementById("policy-review-proof");
 if(!button||!selector||!status||!proof)throw Error("P766 review UI missing.");
 let pending=false;
 button.addEventListener("click",async()=>{
  if(pending)return;
  pending=true;
  button.disabled=true;
  const requestedIssue=selector.value;
  const requestedPreviewRevision=formController.previewRevision;
  clearQualifiedPolicy();
  formController.clearVerifiedPeerAssessment(); // policy result cannot inherit agent advice
  // Never allow an old preview to masquerade as an approved external policy result.
  formController.selectedFix=null;
  formController.render();
  document.getElementById("preview").textContent="External policy check in progress. No changes will be applied.";
  status.textContent="Checking permission and policy integrity...";
  proof.textContent="No policy proof yet.";
  try {
   const verdict=await requestPinnedPolicyAssessment({
     engine,peerOrigin:"https://oaw-accessrelay-2026.vercel.app",localOrigin:location.origin,
     fixId:requestedIssue,requestId:crypto.randomUUID(),
     readCurrentState:()=>formController.state,
     readEvidence:()=>readTargetedEvidence({
       documentImpl:document,styleImpl:node=>getComputedStyle(node)
     })
   });
   if(selector.value!==requestedIssue){
     status.textContent="NO CHANGE — selection changed during policy review.";
     return;
   }
   if(formController.previewRevision!==requestedPreviewRevision){
     status.textContent="NO CHANGE — a manual preview superseded the pending policy review.";
     return;
   }
   if(!verdict.ok){
     status.textContent=verdict.reason==="policy_requires_additional_evidence"
       ? "HOLD — the external policy requires observable evidence before recommending this fix."
       : "NO CHANGE — policy review blocked: "+verdict.reason+".";
     if(verdict.verifiedPolicySha256){
       proof.textContent="Policy SHA-256 verified: "+verdict.verifiedPolicySha256.slice(0,16)
         +"… · Source origin "+verdict.servedFrom;
     }
     document.getElementById("preview").textContent=
       "No policy-qualified recommendation. You can still use the separate manual demo controls.";
     return;
   }
   const preview=formController.preview(verdict.issueId);
   if(!preview.ok||preview.expectedVersion!==verdict.expectedVersion){
     status.textContent="NO CHANGE — the form changed during external review.";
     return;
   }
   markQualifiedPolicy(verdict);
   formController.selectedFix=verdict.issueId;
   formController.render();
   document.getElementById("preview").textContent=[
     "POLICY-QUALIFIED RECOMMENDATION (no LLM was called)",
     "AccessRelay pack "+verdict.policyRevision+" · "+verdict.sourceId,
     verdict.recommendedChange,
     verdict.measuredContrast===null ? "" : "Measured helper contrast: "+Number(verdict.measuredContrast).toFixed(2)+":1; policy threshold 4.5:1 (normal text).",
     "Before: "+preview.beforeRemaining+" findings; after: "+preview.afterRemaining+".",
     "No fix applied. Review and click Apply previewed fix to open the approval dialog."
   ].join("\n");
   proof.textContent="Pinned SHA-256: "+verdict.policySha256+" · Origin: "
     +verdict.servedFrom+" · Reference: "+verdict.sourceUrl;
   status.textContent="POLICY PASS — independent rules verified; manual approval still required.";
  }catch{
   status.textContent="NO CHANGE — external policy review failed.";
   document.getElementById("preview").textContent="No recommendation was approved.";
  }finally{
   pending=false;
   button.disabled=false;
  }
 });
}
