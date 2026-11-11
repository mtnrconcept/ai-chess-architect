#!/usr/bin/env node
/**
 * Import existing GIFs only from the verified Aichess inventory. No network
 * requests, paid services or Git pushes. Run from the repository root:
 *
 * node scripts/import-aichess-animations.mjs /path/to/AICHESS_CATALOGUE_690_ANIMATIONS.json /path/to/source-root --dry-run
 * node scripts/import-aichess-animations.mjs /path/to/AICHESS_CATALOGUE_690_ANIMATIONS.json /path/to/source-root --import
 *
 * The asset bundle is ~1.58GB. Configure approved storage/LFS separately
 * BEFORE committing large binaries; never push them blindly to Git history.
 */
import {promises as fs} from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const mediaRoot=path.join(repoRoot,"public","aichess-animations");
const manifestPath=process.argv[2] ? path.resolve(process.argv[2]) : "";
const sourceRoot=process.argv[3] ? path.resolve(process.argv[3]) : "";
const dryRun=process.argv.includes("--dry-run");
const importMode=process.argv.includes("--import");
if(!manifestPath||!sourceRoot||dryRun===importMode){
  console.error("Usage: node scripts/import-aichess-animations.mjs MANIFEST.json SOURCE_ROOT --dry-run|--import");
  process.exit(2);
}

const catalog=JSON.parse(await fs.readFile(manifestPath,"utf8"));
if(catalog.project!=="Aichess"||!Array.isArray(catalog.entries))throw new Error("Manifest Aichess invalide");
const records=[];
const seen=new Set();
let totalBytes=0;
for(const raw of catalog.entries){
  if(!raw||typeof raw!=="object"||typeof raw.source_path!=="string")throw new Error("Chemin source invalide");
  const relative=raw.source_path.replaceAll("\\","/");
  if(!/^AICHESS_serie_\d{4}-\d{2}-\d{2}_SERIE_\d+\/gifs\/[^/]+\.gif$/i.test(relative))throw new Error("Chemin hors structure Aichess: "+relative);
  const source=path.resolve(sourceRoot,relative);
  if(!source.startsWith(sourceRoot+path.sep))throw new Error("Traversal refusé: "+relative);
  const bytes=await fs.readFile(source);
  if(bytes.toString("ascii",0,3)!=="GIF")throw new Error("Non GIF: "+relative);
  const sha=createHash("sha256").update(bytes).digest("hex");
  if(sha!==raw.sha256)throw new Error("SHA256 divergent: "+relative);
  const width=bytes.readUInt16LE(6),height=bytes.readUInt16LE(8);
  if(width<512||height<512||raw.frames<2||!raw.is_valid_animation)throw new Error("GIF non validé: "+relative);
  const index=Number(raw.index),series=Number(raw.series);
  if(!Number.isInteger(series)||series<1||series>99||!Number.isInteger(index)||index<1||index>99)throw new Error("Index non valide");
  const ascii=path.basename(relative).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_.-]/g,"_");
  const destRel=`s${String(series).padStart(2,"0")}/${ascii}`;
  if(seen.has(destRel))throw new Error("Collision de noms: "+destRel);
  seen.add(destRel);
  const destination=path.join(mediaRoot,destRel);
  if(importMode){
    await fs.mkdir(path.dirname(destination),{recursive:true});
    try{
      const previous=await fs.readFile(destination);
      if(createHash("sha256").update(previous).digest("hex")!==sha)throw new Error("Conflit de destination: "+destination);
    }catch(error){
      if(error?.code!=="ENOENT")throw error;
      await fs.writeFile(destination,bytes,{flag:"wx"});
    }
  }
  records.push({
    id:`aichess-s${String(series).padStart(2,"0")}-${String(index).padStart(2,"0")}`,
    title:String(raw.title||ascii).slice(0,110),series,index,
    piece:raw.piece||null,tags:Array.isArray(raw.tags)?raw.tags:[],
    url:`/aichess-animations/${destRel}`,
    sha256:sha,width,height,
    frames:raw.frames,duration_ms:raw.duration_ms||1920,
    is_valid_animation:true,is_published:importMode,
  });
  totalBytes+=bytes.length;
}
if(records.length!==catalog.entries.length)throw new Error("Inventaire incomplet");
if(importMode){
  const manifest={
    project:"Aichess",version:1,asset_state:"published",total_gifs:records.length,
    generated_at:new Date().toISOString(),entries:records,
  };
  await fs.mkdir(mediaRoot,{recursive:true});
  const tmp=path.join(mediaRoot,"catalog.json.tmp");
  await fs.writeFile(tmp,JSON.stringify(manifest,null,2)+"\n","utf8");
  await fs.rename(tmp,path.join(mediaRoot,"catalog.json"));
}
console.log(JSON.stringify({mode:importMode?"imported":"dry-run",files:records.length,bytes:totalBytes,
  publicPath:mediaRoot,tagged:records.filter(x=>x.tags.length>0).length},null,2));
