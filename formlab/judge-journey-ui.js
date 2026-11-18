// P781: an optional, truthful first-viewport walkthrough of existing browser actions.
// Reads current local state and verified policy/receipt statuses. Never fabricates
// a pass, calls a model, bypasses consent, or changes the form on its own.
import {formController} from "./form-controller.js";
import {getIssues} from "./form-core.mjs";

export function summarizeJudgeJourney({version,findings,policyStatus,receiptStatus}) {
 if(!Number.isSafeInteger(version)||version<0||!Number.isSafeInteger(findings)||findings<0)
  return Object.freeze({label:"Waiting for the local form.",policyVerified:false,approvalVerified:false});
 const policyVerified=String(policyStatus||"").startsWith("POLICY PASS");
 const receipt=String(receiptStatus||"");
 let label="Ready — run the zero-key policy check.";
 let approvalVerified=false;
 if(receipt.startsWith("RECEIPT — Apply and Undo observed")){
  label="Apply and Undo observed — targeted DOM restored. JSON receipt can be exported.";
  approvalVerified=true;
 }else if(receipt.startsWith("RECEIPT — Apply approved")){
  label="Apply observed — a separate Undo approval is still required.";
  // Stage 3 includes Undo; never mark it complete on Apply alone.
 }else if(policyVerified){
  label="External policy verified — inspect the fix and approve Apply.";
 }else if(String(policyStatus||"").startsWith("Checking")){
  label="Checking the public policy after visitor consent.";
 }else if(version>0){
  label="Local state changed; no verified policy receipt for this view.";
 }
 return Object.freeze({label,policyVerified,approvalVerified});
}

export function setupJudgeJourney() {
 const button=document.getElementById("quick-demo");
 const policyButton=document.getElementById("policy-review");
 const count=document.getElementById("journey-count");
 const version=document.getElementById("journey-version");
 const status=document.getElementById("journey-status");
 const policyStatus=document.getElementById("policy-review-status");
 const receiptStatus=document.getElementById("receipt-status");
 if(!button||!policyButton||!count||!version||!status||!policyStatus||!receiptStatus)
  throw Error("P781 journey controls are missing.");
 let ready=true;
 const render=()=>{
  const state=formController.state;
  const findings=getIssues(state).length;
  const verdict=summarizeJudgeJourney({
   version:state.version,findings,
   policyStatus:policyStatus.textContent,receiptStatus:receiptStatus.textContent
  });
  count.textContent=String(findings);
  version.textContent="Version "+state.version;
  status.textContent=verdict.label;
  const steps=document.querySelectorAll(".journey-steps li");
  if(steps.length===3){
   steps[0].dataset.state="complete";
   steps[1].dataset.state=verdict.policyVerified?"complete":"pending";
   steps[2].dataset.state=verdict.approvalVerified?"complete":"pending";
  }
 };
 const observer=new MutationObserver(render);
 observer.observe(policyStatus,{childList:true,characterData:true,subtree:true});
 observer.observe(receiptStatus,{childList:true,characterData:true,subtree:true});
 formController.onTransition(event=>{if(event.phase==="after")render();});
 button.addEventListener("click",()=>{
  if(!ready)return;
  policyButton.scrollIntoView({block:"center",behavior:"instant"});
  policyButton.focus({preventScroll:true});
  // The existing click handler still owns explicit native consent, fetch and SHA.
  policyButton.click();
 });
 button.disabled=false;
 render();
 return ()=>{ready=false;button.disabled=true;observer.disconnect();};
}
