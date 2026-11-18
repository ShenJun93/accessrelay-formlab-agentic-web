// No cross-origin host action is exposed by this static-only agent network.
export function registerActions(actions){
  actions.register({
    name:"get_public_guidance",
    description:"Read three public accessibility categories. No user details or host credentials.",
    effect:"read",
    inputSchema:{type:"object",properties:{},additionalProperties:false},
    execute:()=>({ok:true,guidance:[
      "Associate visible labels with their matching form inputs.",
      "Make dynamic validation errors available to assistive technology.",
      "Verify text contrast with a computed-style check; evaluate manually as well."
    ],scope:"general educational guidance, not a certification or a remote DOM operation"})
  });
}
