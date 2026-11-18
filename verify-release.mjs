// P777 public-source integrity verifier. Dependencies: Node.js >=22 only.
// Does not contact networks or authenticate publishers; a hash is not a signature.
import {readFile,lstat,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const hash=b=>createHash("sha256").update(b).digest("hex");
function assert(ok,message){if(!ok)throw Error("SOURCE INTEGRITY HOLD: "+message);}
async function walk(dir,found=[]){
 for(const ent of await readdir(dir,{withFileTypes:true})){
  const full=path.join(dir,ent.name),rel=path.relative(ROOT,full).replaceAll("\\","/");
  if(ent.isSymbolicLink())assert(false,"symlink "+rel);
  if(ent.isDirectory()){if(dir===ROOT&&ent.name===".git")continue;await walk(full,found);}
  else if(ent.isFile())found.push(rel);
  else assert(false,"non-regular asset "+rel);
 }
 return found;
}
export async function verifySnapshot(){
 const m=JSON.parse(await readFile(path.join(ROOT,"RELEASE_MANIFEST.json"),"utf8"));
 assert(m.schema==="accessrelay-clean-source-snapshot/v1","invalid schema");
 assert(m.published===true&&m.publicationApproval===true&&m.publicationUrl==="https://github.com/ShenJun93/accessrelay-formlab-agentic-web","public release identity mismatch");
 assert(m.provenance?.p775DeployedAssetSha256==="1bb5fd48067e77a25110df3834839d83fec12df252ecd69514ed274eb546f459","unrecognized source pin");
 assert(Array.isArray(m.files)&&m.fileCount===m.files.length&&m.fileCount>120,"manifest count");
 const names=new Set(),entries=[];
 for(const x of m.files){
  assert(x&&typeof x.path==="string"&&/^[a-zA-Z0-9._/-]+$/.test(x.path)&&
   !x.path.startsWith("/")&&!x.path.includes("//")&&
   !x.path.split("/").some(z=>z==="."||z===".."),"unsafe manifest path");
  assert(!names.has(x.path),"duplicate file "+x.path);
  names.add(x.path);
  const file=path.resolve(ROOT,x.path),stats=await lstat(file);
  assert(file.startsWith(ROOT+path.sep)&&stats.isFile()&&!stats.isSymbolicLink(),"unsafe file "+x.path);
  const bytes=await readFile(file);
  assert(bytes.length===x.bytes&&hash(bytes)===x.sha256,"modified file "+x.path);
  entries.push(x);
 }
 const actual=(await walk(ROOT)).filter(f=>f!=="RELEASE_MANIFEST.json").sort((a,b)=>a.localeCompare(b,"en"));
 assert(actual.length===m.fileCount&&actual.every(name=>names.has(name)),"unexpected or missing published file");
 entries.sort((a,b)=>a.path.localeCompare(b.path,"en"));
 assert(hash(Buffer.from(entries.map(x=>x.path+"\0"+x.sha256).join("\n"),"utf8"))===m.inventorySha256,
  "source inventory digest changed");
 const site=entries.filter(x=>/^(?:formlab|accessrelay)\//.test(x.path)&&
  !x.path.includes("/tests/"));
 assert(site.length===107,"published website file count drift");
 assert(hash(Buffer.from(site.map(x=>x.path+"\0"+x.sha256).join("\n"),"utf8"))===m.provenance.p775DeployedAssetSha256,
  "the two public sites differ from P775");
 return {status:"SELF_ATTESTED_SOURCE_BYTES_PASS",files:m.fileCount,
  publicSiteFiles:site.length,inventorySha256:m.inventorySha256,
  productionArtifactSha256:m.provenance.p775DeployedAssetSha256,
  noImportedInternalHistory:!names.has(".git")};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await verifySnapshot(),null,2))}
 catch(e){console.error(String(e?.message??e));process.exitCode=1}
}
