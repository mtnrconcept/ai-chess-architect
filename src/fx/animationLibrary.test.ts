import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";

const valid = {
  id:"aichess-s69-01",
  title:"Tempête de météores",
  piece:null,
  tags:["attaque","feu","autonome"],
  url:"/aichess-animations/s69/01_tempete_meteores.gif",
  sha256:"a".repeat(64),
  width:512,height:512,frames:48,duration_ms:1920,
  is_published:true,is_valid_animation:true,
};

describe("Aichess animation library",()=>{
  beforeEach(()=>vi.resetModules());
  afterEach(()=>vi.unstubAllGlobals());

  it("keeps the ten bundled, allow-listed effects if import is unavailable",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("offline")));
    const library=await import("./animationLibrary");
    const animations=await library.loadAnimationAssets();
    expect(animations).toHaveLength(10);
    expect(library.getAnimationAssetUrl("aichess_fire")).toBe("/rule-gifs/fire.gif");
    expect(library.getAnimationAssetUrl("https://evil.example/a.gif")).toBeNull();
  });

  it("only exposes verified local paths with published status",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({
      ok:true,
      json:async()=>({entries:[
        valid,
        {...valid,id:"aichess-s69-02",url:"https://evil.example/remote.gif"},
        {...valid,id:"aichess-s69-03",url:"/aichess-animations/../../malicious.gif"},
        {...valid,id:"aichess-s69-04",is_published:false},
        {...valid,id:"aichess-s69-05",sha256:"bad"},
      ]}),
    }));
    const library=await import("./animationLibrary");
    await library.loadAnimationAssets();
    expect(library.importedAnimationCount()).toBe(1);
    expect(library.getAnimationAssetUrl("aichess-s69-01")).toBe(valid.url);
    expect(library.getAnimationAssetUrl("aichess-s69-02")).toBeNull();
  });

  it("maps old rule descriptions to imported IDs without running new rule logic",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({entries:[valid]})}));
    const library=await import("./animationLibrary");
    await library.loadAnimationAssets();
    expect(library.suggestAnimationId("Explosion de météores carmin")).toBe("aichess-s69-01");
    expect(library.suggestAnimationId("anything", "queen", "aichess_queen")).toBe("aichess-s69-01");
  });
});
