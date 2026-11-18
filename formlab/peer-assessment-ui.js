// P770: origin-bound peer advice -> one version-bound local preview -> manual Apply/Undo.
// No peer text/HTML can mutate the DOM. Measurement is self-attested and scoped.
import {formController} from "./form-controller.js";
import {requestVerifiedPeerAssessment} from "./peer-runtime-adapter.mjs";
import {createVerifiedPeerBinding} from "./verified-peer-binding.mjs";
import {captureTargetedObservation,validateObservedTargetTransition} from "./evidence-receipt.mjs";
import {readTargetedEvidence} from "./remote-policy.mjs";

export function setupPeerAssessmentUi(engine) {
  const button=document.getElementById("peer-assess");
  const selector=document.getElementById("peer-assess-issue");
  const status=document.getElementById("peer-assess-status");
  if (!button || !selector || !status) throw Error("P765 assessment UI is missing.");
  let pending=false;
  let observed=null;
  const observe=(fixId,version)=>captureTargetedObservation({
    documentImpl:document,computedStyle:node=>getComputedStyle(node),
    contrastReader:readTargetedEvidence,fixId,version
  });

  // Observe only actions linked to an accepted peer binding AND a browser dialog.
  // This evidence is not a signed audit or general WCAG conformance check.
  formController.onTransition(event=>{
    const {phase,action,fixId,beforeVersion,afterVersion,approvedBy,peerAssessment}=event;
    if(action==="apply"&&phase==="before"){
      observed=null;
      if(approvedBy!=="browser-dialog"||!peerAssessment)return;
      const before=observe(fixId,beforeVersion);
      if(!before.ok){
        status.textContent="NO DOM PROOF — before-state was not measurable.";
        return;
      }
      observed={fixId,before:before.observation,after:null,expectedAppliedVersion:afterVersion};
    }else if(action==="apply"&&phase==="after"&&observed){
      if(observed.fixId!==fixId||observed.expectedAppliedVersion!==afterVersion){
        observed=null;
        return;
      }
      const after=observe(fixId,afterVersion);
      const check=after.ok&&validateObservedTargetTransition({
        fixId,before:observed.before,after:after.observation
      });
      if(!check?.ok){
        observed=null;
        status.textContent="NO DOM PROOF — approved change was not independently measured by this page.";
        return;
      }
      observed.after=after.observation;
      status.textContent="PEER-ASSISTED APPLY OBSERVED — targeted DOM improvement at version "+
        afterVersion+". Undo needs a separate approval. Self-attested only.";
    }else if(action==="undo"&&phase==="after"&&observed?.after){
      if(observed.fixId!==fixId||observed.after.version!==beforeVersion)return;
      const undone=observe(fixId,afterVersion);
      const check=undone.ok&&validateObservedTargetTransition({
        fixId,before:observed.before,after:observed.after,undone:undone.observation
      });
      if(check?.ok){
        status.textContent="PEER-ASSISTED UNDO VERIFIED — targeted DOM restored at version "+
          afterVersion+". Two browser approvals; self-attested, not signed.";
      }else status.textContent="UNDO NOT VERIFIED — targeted restoration was not observed.";
      observed=null;
    }
  });

  selector.addEventListener("change",()=>{
    if(!formController.verifiedPeerAssessment)return;
    formController.clearVerifiedPeerAssessment();
    formController.selectedFix=null;
    formController.render();
    status.textContent="NO CHANGE — selection changed; prior peer assessment expired.";
  });

  button.addEventListener("click",async()=>{
    if(pending)return;
    pending=true;
    button.disabled=true;
    const requestedIssue=selector.value;
    const requestedPreviewRevision=formController.previewRevision;
    // An in-flight assessment is NOT authority to apply a previous preview.
    formController.clearVerifiedPeerAssessment();
    formController.selectedFix=null;
    formController.render();
    status.textContent="Checking provider, consent and the AccessRelay assessment...";
    try{
      const verdict=await requestVerifiedPeerAssessment({
        engine,localOrigin:location.origin,peerUrl:"https://oaw-accessrelay-2026.vercel.app/accessrelay",
        fixId:requestedIssue,requestId:crypto.randomUUID(),
        readCurrentState:()=>formController.state
      });
      if(!verdict.ok){
        status.textContent="NO CHANGE — peer assessment blocked: "+verdict.reason+".";
        return;
      }
      if(selector.value!==requestedIssue){
        status.textContent="NO CHANGE — selected finding changed while peer was evaluating it.";
        return;
      }
      if(formController.previewRevision!==requestedPreviewRevision){
        status.textContent="NO CHANGE — visitor chose a manual preview while the peer was evaluating it.";
        return;
      }
      const preview=formController.preview(verdict.issueId);
      const checked=createVerifiedPeerBinding({
        verdict,selectedIssue:requestedIssue,preview,currentVersion:formController.state.version
      });
      if(!checked.ok){
        status.textContent="NO CHANGE — peer advice expired: "+checked.reason+".";
        return;
      }
      formController.verifiedPeerAssessment=checked.binding;
      formController.selectedFix=verdict.issueId;
      formController.render();
      document.getElementById("preview").textContent=[
        "Validated external assessment from "+verdict.trustedPeerOrigin,
        verdict.recommendedChange,
        "Before: "+preview.beforeRemaining+" findings; After: "+preview.afterRemaining+" findings.",
        "Bound to version "+verdict.assessedVersion+" and one issue. No page changes yet.",
        "Review and use Apply previewed fix to request separate human approval."
      ].join("\n");
      status.textContent="VALIDATED RECOMMENDATION — version-bound manual approval required. No changes applied.";
    }catch{
      status.textContent="NO CHANGE — peer assessment failed. Check runtime/network diagnostics.";
    }finally{
      pending=false;
      button.disabled=false;
    }
  });
}
