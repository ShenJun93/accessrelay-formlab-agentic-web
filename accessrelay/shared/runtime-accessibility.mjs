// P783: first-party accessibility adapter for the unchanged Cognizant runtime.
// Repairs only host-visible semantics after the official browser boot.
export function rangeForRail(totalWidth,observedRailWidth) {
 const total=Number.isFinite(totalWidth)&&totalWidth>0?Math.round(totalWidth):1000;
 const current=Number.isFinite(observedRailWidth)&&observedRailWidth>=0
  ?Math.round(observedRailWidth):Math.round(total*.34);
 const min=220,max=Math.max(260,total-360,current);
 return Object.freeze({min,max,now:Math.max(min,current)});
}
export function installRuntimeAccessibility(root) {
 if(!root?.querySelector)throw TypeError("Runtime mount must provide DOM querySelector.");
 const main=root.querySelector(".ns-main");
 // The document already has a top-level main. A second nested <main> is an
 // axe violation, and role="presentation"/"none" on <main> is also invalid.
 // Replace only the empty semantic wrapper; move existing child DOM nodes,
 // preserving their event listeners, focusable controls and app references.
 if(main?.tagName==="MAIN"&&main.ownerDocument?.createElement&&
    typeof main.replaceWith==="function"){
  const shell=main.ownerDocument.createElement("div");
  for(const attr of main.attributes)shell.setAttribute(attr.name,attr.value);
  while(main.firstChild)shell.appendChild(main.firstChild);
  main.replaceWith(shell);
 }
 const splitter=root.querySelector("#ns-split");
 const app=splitter?.closest?.(".ns-app");
 const rail=app?.querySelector?.(".ns-agents");
 if(!splitter||!app||!rail)return ()=>{};
 splitter.setAttribute("aria-label","Resize assistant panels");
 splitter.setAttribute("aria-orientation","vertical");
 let active=true;
 const update=()=>{
  if(!active)return;
  const v=rangeForRail(app.clientWidth,rail.getBoundingClientRect().width);
  splitter.setAttribute("aria-valuemin",String(v.min));
  splitter.setAttribute("aria-valuemax",String(v.max));
  splitter.setAttribute("aria-valuenow",String(v.now));
  splitter.setAttribute("aria-valuetext","Agent details width "+v.now+" pixels");
 };
 const mutation=new MutationObserver(update);
 mutation.observe(app,{attributes:true,attributeFilter:["style"]});
 const resize=typeof ResizeObserver==="function"?new ResizeObserver(update):null;
 resize?.observe(app);
 resize?.observe(rail);
 update();
 return ()=>{active=false;mutation.disconnect();resize?.disconnect();};
}
