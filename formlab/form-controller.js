import {FIXES, createInitialState, getIssues, snapshot, previewFix, applyFix, undoLast} from "./form-core.mjs";
import {checkVerifiedPeerBinding} from "./verified-peer-binding.mjs";
import {runReviewedTransition} from "./shared/review-boundary.mjs";

// First-party adapter: bounded state/DOM facts, never input values or HTML.
function readFormReviewEvidence(){
 const state=formController.state;
 return {version:state.version,facts:{
  appliedFixes:state.applied.join("|"),
  historyCount:state.history.length,
  selectedFix:formController.selectedFix??"none",
  labelLinked:document.getElementById("email-label")?.getAttribute("for")==="email",
  errorsAnnounced:document.getElementById("form-error")?.getAttribute("role")==="alert",
  contrastImproved:document.documentElement.dataset.contrast==="improved"
 }};
}

export const formController = {
  state: createInitialState(), selectedFix: null, lastReceipt: null,
  verifiedPeerAssessment: null,
  previewRevision: 0, // user-initiated preview selections invalidate in-flight peer suggestions
  clearVerifiedPeerAssessment() { this.verifiedPeerAssessment=null; },
  transitionListeners: new Set(),
  onTransition(listener) {
    if (typeof listener !== "function") throw TypeError("Transition listener must be a function.");
    this.transitionListeners.add(listener);
    return () => this.transitionListeners.delete(listener);
  },
  notifyTransition(phase, detail) {
    // Receipt observation must never block a verified, explicitly approved form edit.
    // A failed observer cannot turn an unobserved write into proof.
    for (const listener of this.transitionListeners) {
      try { listener({phase, ...detail}); } catch { /* no receipt; action still completes */ }
    }
  },
  snapshot() { return snapshot(this.state); },
  preview(fixId) { return previewFix(this.state, fixId); },
  apply(fixId, expectedVersion, options={}) {
    const gate=checkVerifiedPeerBinding(this.verifiedPeerAssessment,{fixId,version:expectedVersion});
    if(!gate.ok){
      this.clearVerifiedPeerAssessment();
      this.selectedFix=null;
      this.render();
      return {ok:false,reason:"Verified peer recommendation expired. Request it again or use a fresh manual preview."};
    }
    const peerAssessment=gate.mode==="peer-advised" && options.approvedBy==="browser-dialog"
      ? this.verifiedPeerAssessment : null;
    const result = applyFix(this.state, fixId, expectedVersion);
    if (result.ok) {
      const detail={action:"apply",fixId,beforeVersion:this.state.version,
        afterVersion:result.state.version,peerAssessment,approvedBy:
          options.approvedBy==="browser-dialog"?"browser-dialog":"not-attested"};
      this.notifyTransition("before",detail);
      this.state=result.state;
      this.lastReceipt={type:"apply",fixId,version:this.state.version};
      this.selectedFix=null;
      this.clearVerifiedPeerAssessment();
      this.render();
      this.notifyTransition("after",detail);
    }
    return { ...result, state: undefined };
  },
  undo(expectedVersion, options={}) {
    const result = undoLast(this.state, expectedVersion);
    if (result.ok) {
      const detail={action:"undo",fixId:result.fixId,beforeVersion:this.state.version,
        afterVersion:result.state.version,approvedBy:
          options.approvedBy==="browser-dialog"?"browser-dialog":"not-attested"};
      this.notifyTransition("before",detail);
      this.state=result.state;
      this.lastReceipt={type:"undo",fixId:result.fixId,version:this.state.version};
      this.clearVerifiedPeerAssessment();
      this.selectedFix=null;
      this.render();
      this.notifyTransition("after",detail);
    }
    return { ...result, state: undefined };
  },
  render() {
    if (typeof document === "undefined") return;
    const applied = this.state.applied;
    const label = document.getElementById("email-label");
    if (applied.includes("associate_label")) label.setAttribute("for","email");
    else label.removeAttribute("for");
    const feedback = document.getElementById("form-error");
    if (applied.includes("announce_errors")) { feedback.setAttribute("role","alert");feedback.setAttribute("aria-live","assertive"); }
    else {feedback.removeAttribute("role");feedback.removeAttribute("aria-live");}
    document.documentElement.dataset.contrast = applied.includes("increase_contrast")?"improved":"baseline";
    const items = getIssues(this.state);
    document.getElementById("issue-count").textContent = String(items.length);
    document.getElementById("version").textContent = String(this.state.version);
    document.getElementById("issues").textContent = items.length?items.map(x=>x.title).join(" · "):"No remaining targeted findings";
    document.getElementById("fix-list").replaceChildren(...FIXES.map(fix => {
      const b=document.createElement("button");
      b.type="button";b.className="fix";b.dataset.fix=fix.id;
      b.textContent=(applied.includes(fix.id)?"Applied: ":"Preview: ")+fix.title;
      b.disabled=applied.includes(fix.id);
      return b;
    }));
    document.getElementById("undo").disabled=this.state.history.length===0;
    document.getElementById("apply").disabled=!this.selectedFix;
    document.getElementById("last-receipt").textContent=this.lastReceipt?JSON.stringify(this.lastReceipt):"No changes applied.";
    document.getElementById("evidence").textContent="Version "+this.state.version+" · "+items.length+" targeted findings · "+applied.length+" applied fixes";
  }
};
if(typeof document !== "undefined"){
  document.getElementById("fix-list").addEventListener("click", event => {
    const fixId=event.target.closest("button[data-fix]")?.dataset.fix;
    if(!fixId)return;
    formController.previewRevision++;
    formController.clearVerifiedPeerAssessment(); // new manual preview never inherits old peer provenance
    const p=formController.preview(fixId);
    formController.selectedFix=p.ok?fixId:null;
    document.getElementById("preview").textContent=p.ok?p.diff+"\nBefore: "+p.beforeRemaining+" findings · After: "+p.afterRemaining+" findings":"Cannot preview: "+p.reason;
    formController.render();
  });
  const dialog=document.getElementById("review-dialog");
  const summary=document.getElementById("review-summary");
  document.getElementById("review-approve").addEventListener("click",()=>dialog.close("approve"));
  document.getElementById("review-cancel").addEventListener("click",()=>dialog.close("cancel"));
  function requestReview(message) {
    if(dialog.open) return Promise.resolve(false);
    summary.textContent=message;
    dialog.returnValue="cancel";
    dialog.showModal();
    return new Promise(resolve=>{
      dialog.addEventListener("close",()=>resolve(dialog.returnValue==="approve"),{once:true});
    });
  }
  function reviewOutcome(result,success){
    if(result.ok){document.getElementById("preview").textContent=success;return;}
    if(result.reason==="approval_declined")return;
    document.getElementById("preview").textContent=result.didMutate
      ?"Action may have executed, but local evidence was not verified. Inspect the form before trying again."
      :"NO CHANGE — approval boundary refused: "+result.reason;
  }
  document.getElementById("apply").addEventListener("click", async () => {
    const id=formController.selectedFix;
    const preview=formController.preview(id);
    if(!preview.ok){document.getElementById("preview").textContent=preview.reason;return;}
    const result=await runReviewedTransition({
      origin:location.origin,operation:"formlab-apply",readEvidence:readFormReviewEvidence,
      requestApproval:()=>requestReview("Apply this reversible browser-local change? "+preview.diff),
      mutate:()=>formController.apply(id,preview.expectedVersion,{approvedBy:"browser-dialog"})
    });
    reviewOutcome(result,"Applied. Use Undo to revert.");
  });
  document.getElementById("undo").addEventListener("click", async () => {
    if(!formController.state.history.length)return;
    const version=formController.state.version;
    const result=await runReviewedTransition({
      origin:location.origin,operation:"formlab-undo",readEvidence:readFormReviewEvidence,
      requestApproval:()=>requestReview("Undo the most recent browser-local accessibility fix?"),
      mutate:()=>formController.undo(version,{approvedBy:"browser-dialog"})
    });
    reviewOutcome(result,"Undone; the prior finding is restored.");
  });
  document.getElementById("signup").addEventListener("submit",e=>{
    e.preventDefault();
    const email=document.getElementById("email");
    const note=document.getElementById("form-error");
    note.textContent=email.value.trim()?"Demo only: no information was sent.":"Enter an email address to continue.";
  });
  formController.render();
}
