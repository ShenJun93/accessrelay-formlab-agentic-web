import "./form-controller.js";
import {boot} from "./runtime/index.js";
import {setupPeerAssessmentUi} from "./peer-assessment-ui.js";
import {setupPolicyReviewUi} from "./policy-review-ui.js";
import {setupEvidenceReceiptUi} from "./evidence-receipt-ui.js";
setupEvidenceReceiptUi();
const status=document.getElementById("agent-status");
const base=new URL("./",import.meta.url).href;
try{
  const result=await boot("#agent-app",{
    originUrl:base,
    sandboxWorkerUrl:new URL("runtime/sandbox-worker.js",base).href
  });
  window.__accessrelayP0={loaded:true,network:"formlab",remote:"https://oaw-accessrelay-2026.vercel.app/accessrelay"};
  status.textContent=result.engine?.byokKey?"Browser runtime ready with visitor-provided key.":"Browser runtime ready · provide your own key for real agent/LLM calls.";
  setupPeerAssessmentUi(result.engine);
  setupPolicyReviewUi(result.engine);
  // Browser-only proof of consent + cross-origin JSON discovery, NOT a live LLM call.
  const peerButton=document.getElementById("peer-inspect");
  const peerStatus=document.getElementById("peer-inspect-status");
  peerButton.addEventListener("click",async()=>{
    peerButton.disabled=true;
    peerStatus.textContent="Waiting for permission to read AccessRelay's public network.";
    try {
      const peerUrl="https://oaw-accessrelay-2026.vercel.app/accessrelay";
      const peerOrigin=new URL(peerUrl).origin;
      // Runtime consent must be attached; never rely on Engine's headless allow fallback.
      if(typeof result.engine.onConsent!=="function") throw new Error("Consent UI unavailable");
      const {manifestAllowsPeer}=await import("./runtime/engine.js");
      if(!manifestAllowsPeer(peerUrl,result.engine.top?.manifest))
        throw new Error("Peer origin is not allowlisted");
      const decision=await result.engine.requestConsent({
        peerOrigin,peerLabel:"AccessRelay",requestText:"Read public manifest and network definition; no personal data, no model call.",
        est:{totalTokens:0,costText:"no model call"}
      });
      if(!["allow","always"].includes(decision)){
        peerStatus.textContent="DECLINED — no cross-origin fetch attempted.";
        return;
      }
      const manifestResponse=await fetch(peerOrigin+"/agent-manifest.json",{mode:"cors",credentials:"omit",cache:"no-store"});
      if(!manifestResponse.ok)throw new Error("Manifest HTTP "+manifestResponse.status);
      const manifest=await manifestResponse.json();
      const entry=(manifest.networks||[]).find(network=>network.name==="accessrelay");
      if(!entry)throw new Error("Exact network name not found");
      const networkURL=new URL(entry.hocon,peerOrigin+"/");
      const definition=await fetch(networkURL,{mode:"cors",credentials:"omit",cache:"no-store"});
      if(!definition.ok)throw new Error("Network HTTP "+definition.status);
      const [{parseHocon},{AgentNetwork,validateNetwork}]=await Promise.all([
        import("./runtime/hocon.js"),import("./runtime/kernel.js")
      ]);
      const parsed=parseHocon(await definition.text());
      const portable=new AgentNetwork(parsed,"accessrelay");
      const checked=validateNetwork(portable);
      if(checked.errors?.length)throw new Error("Invalid network: "+checked.errors.join("; "));
      peerStatus.textContent="PASS — cross-origin CORS, exact named network and browser-side validation. No model was called.";
    }catch(err){
      peerStatus.textContent="BLOCKED — "+String(err?.message||err);
    }finally{peerButton.disabled=false;}
  });
}catch(e){
  status.textContent="Agent runtime unavailable; manual accessibility demo still works.";
  window.__accessrelayP0={loaded:false,error:String(e.message)};
  console.error("AccessRelay local runtime bootstrap failed",e);
}
