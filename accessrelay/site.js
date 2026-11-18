import {boot} from "./runtime/index.js";
import {installRuntimeAccessibility} from "./shared/runtime-accessibility.mjs";
const status=document.getElementById("agent-status");
const base=new URL("./",import.meta.url).href;
try{
  const result=await boot("#agent-app",{originUrl:base,sandboxWorkerUrl:new URL("runtime/sandbox-worker.js",base).href});
  installRuntimeAccessibility(document.getElementById("agent-app"));
  status.textContent=result.engine?.byokKey?"Browser runtime loaded with visitor key.":"Browser runtime ready · BYOK required for live inference.";
  window.__accessrelayPeer={loaded:true,network:"accessrelay"};
}catch(e){
  status.textContent="Browser agent runtime unavailable. Public manifest remains readable.";
  window.__accessrelayPeer={loaded:false,error:String(e.message)};
  console.error("AccessRelay peer runtime failed to boot",e);
}
