import {describe, expect, it} from "vitest";
import {RULE_CATALOGUE_100, makeCatalogBlueprint, getCompiledCatalogRule} from "./ruleCatalogue100";
import {compileRuleBlueprint} from "@/rules-v2/compiler";
import {createRuleEngine, EventBus, StateStore, Cooldown} from "@/engine/bootstrap";
import type {BoardAPI, Piece, Side, Tile, VFXAPI} from "@/engine/types";

class TestBoard implements BoardAPI {
  pieces = new Map<string,Piece>();
  decals = new Map<string,string>();
  constructor(type="pawn") {
    this.pieces.set("source",{id:"source",type,side:"white",tile:"b2",statuses:{}});
    this.pieces.set("enemy",{id:"enemy",type:"pawn",side:"black",tile:"d5",statuses:{}});
  }
  tiles():Tile[] {return Array.from({length:64},(_,i)=>`${"abcdefgh"[i%8]}${Math.floor(i/8)+1}`);}
  isEmpty(tile:Tile) {return !this.getPieceAt(tile);}
  getPieceAt(tile:Tile) {return [...this.pieces.values()].find(p=>p.tile===tile)?.id ?? null;}
  getPiece(id:string) { const p=this.pieces.get(id); if(!p)throw new Error("piece missing");return p;}
  setPieceTile(id:string,tile:Tile) {if(!this.isEmpty(tile))throw new Error("occupied");this.getPiece(id).tile=tile;}
  removePiece(id:string) {this.pieces.delete(id);}
  spawnPiece(type:string,side:Side,tile:Tile) {
    if(!this.isEmpty(tile))throw new Error("occupied");
    const id=`spawn-${this.pieces.size}`;this.pieces.set(id,{id,type,side,tile,statuses:{}});return id;
  }
  setPieceInvisible(id:string,value:boolean){this.getPiece(id).invisible=value;}
  setPieceStatus(id:string,key:string,value:unknown){this.getPiece(id).statuses![key]=value;}
  clearPieceStatus(id:string,key:string){delete this.getPiece(id).statuses![key];}
  withinBoard(tile:Tile){return /^[a-h][1-8]$/.test(tile);}
  neighbors(tile:Tile,radius=1):Tile[] {
    const file=tile.charCodeAt(0)-97,rank=Number(tile[1])-1;
    return this.tiles().filter(t=>Math.max(Math.abs(t.charCodeAt(0)-97-file),Math.abs(Number(t[1])-1-rank))<=radius && t!==tile);
  }
  setDecal(tile:Tile,sprite:string|null){if(sprite)this.decals.set(tile,sprite);else this.decals.delete(tile);}
  clearDecal(tile:Tile){this.decals.delete(tile);}
  serialize(){return JSON.stringify({pieces:[...this.pieces],decals:[...this.decals]});}
  deserialize(snapshot:string){const v=JSON.parse(snapshot);this.pieces=new Map(v.pieces);this.decals=new Map(v.decals);}
}
function exercise(id:string) {
  const item=RULE_CATALOGUE_100.find(x=>x.id===id)!;
  const rule=getCompiledCatalogRule(id);
  expect(rule).not.toBeNull();
  const initialPieceType=item.piece==="any"?"pawn":item.piece==="king" && item.mode==="promote"?"pawn":item.piece;
  const board=new TestBoard(initialPieceType);
  let animationCount=0;
  const vfx:VFXAPI={
    spawnDecal:()=>{},clearDecal:()=>{},
    playAnimation:()=>{animationCount++;},playAudio:()=>{},
  };
  const bus=new EventBus();
  const engine=createRuleEngine({
    board,
    ui:{toast:()=>{},registerAction:()=>{}},
    vfx,
    cooldown:new Cooldown(),state:new StateStore(),eventBus:bus,
    match:{get:()=>({ply:1,turnSide:"white"}),setTurn:()=>{},endTurn:()=>{}},
    util:{uuid:()=>"test-id"},
    capturePiece:(pieceId)=>board.removePiece(pieceId),
  },[rule!],{matchSeed:"test-catalogue"});
  const target=item.mode==="capture"?"d5":item.mode==="warp-near"?"c3":
    ["promote","cloak","sacrifice"].includes(item.mode)?undefined:"c3";
  const actionId=engine.getUIActions()[0]?.id ?? `${id}.activate`;
  const result=engine.runUIAction(actionId,"source",target);
  expect(result.ok,`${item.title}: ${result.reason ?? "action refused"}`).toBe(true);
  switch(item.mode){
    case "warp":case "warp-near":expect(board.getPiece("source").tile).toBe("c3");break;
    case "capture":expect(board.pieces.has("enemy")).toBe(false);break;
    case "summon":expect(board.getPieceAt("c3")).not.toBeNull();break;
    case "duplicate":expect(board.getPieceAt("c3")).not.toBeNull();break;
    case "promote":expect(board.getPieceAt("b2")).not.toBeNull();expect(board.getPieceAt("b2")).not.toBe("source");break;
    case "cloak":expect(board.getPiece("source").invisible).toBe(true);break;
    case "sacrifice":expect(board.pieces.has("source")).toBe(false);break;
    case "trap":{
      expect(board.decals.get("c3")).toBeTruthy();
      board.removePiece("enemy");
      board.spawnPiece("pawn","black","c3");
      const entrant=board.getPieceAt("c3")!;
      bus.emit("lifecycle.onEnterTile",{pieceId:entrant,to:"c3"});
      expect(board.getPieceAt("c3")).toBeNull();
      break;
    }
  }
  expect(animationCount).toBeGreaterThan(0);
}
describe("100 Aichess catalog variants",()=>{
  it("contains exactly 100 distinct named variants across 10 families",()=>{
    expect(RULE_CATALOGUE_100).toHaveLength(100);
    expect(new Set(RULE_CATALOGUE_100.map(x=>x.id)).size).toBe(100);
    expect(new Set(RULE_CATALOGUE_100.map(x=>x.family)).size).toBe(10);
    expect(new Set(RULE_CATALOGUE_100.map(x=>x.title)).size).toBe(100);
  });
  it.each(RULE_CATALOGUE_100)("compiles $id — $title via guarded V2",item=>{
    const result=compileRuleBlueprint(makeCatalogBlueprint(item));
    expect(result.diagnostics.filter(x=>x.severity==="error"),item.title).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.compiledRule?.ui.actions).toHaveLength(1);
    expect(result.compiledRule?.logic.effects.length).toBeGreaterThan(0);
  });
  it.each(RULE_CATALOGUE_100)("executes $id — $title on a test board",item=>{
    exercise(item.id);
  });
  it("rejects unknown catalogue URLs rather than compiling an arbitrary rule",()=>{
    expect(getCompiledCatalogRule("something-malicious")).toBeNull();
  });
});
