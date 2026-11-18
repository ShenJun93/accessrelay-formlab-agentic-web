// Local site actions; the linked peer does not receive these executors or user-entered email.
import {formController} from "./form-controller.js";
const idSchema={type:"string",enum:["associate_label","announce_errors","increase_contrast"]};
export function registerActions(registry){
  registry.register({
    name:"get_form_state",description:"Read only the three targeted accessibility check results and current version. Never read, return, or transmit user-entered form values.",
    effect:"read",inputSchema:{type:"object",properties:{},additionalProperties:false},
    execute:()=>({ok:true,...formController.snapshot()})
  });
  registry.register({
    name:"preview_accessibility_fix",description:"Describe one allowlisted accessible-form fix without modifying the page.",
    effect:"read",inputSchema:{type:"object",required:["fixId"],additionalProperties:false,properties:{fixId:idSchema}},
    execute:args=>formController.preview(args.fixId)
  });
  registry.register({
    name:"apply_accessibility_fix",description:"Apply exactly one previewed and user-confirmed allowlisted fix to the browser-local demo state. Validate the expected version; never run arbitrary scripts.",
    effect:"irreversible",inputSchema:{type:"object",required:["fixId","expectedVersion"],additionalProperties:false,
      properties:{fixId:idSchema,expectedVersion:{type:"integer",minimum:0,maximum:100000}}},
    execute:args=>formController.apply(args.fixId,args.expectedVersion)
  });
  registry.register({
    name:"undo_accessibility_fix",description:"After human confirmation undo the last applied browser-local fix with a version check.",
    effect:"irreversible",inputSchema:{type:"object",required:["expectedVersion"],additionalProperties:false,
      properties:{expectedVersion:{type:"integer",minimum:0,maximum:100000}}},
    execute:args=>formController.undo(args.expectedVersion)
  });
}
