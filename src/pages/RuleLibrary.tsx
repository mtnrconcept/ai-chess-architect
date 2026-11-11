import {suggestAnimationId} from "@/fx/animationLibrary";
import {useMemo, useState} from "react";
import {Link} from "react-router-dom";
import {ArrowLeft, Gamepad2, Search, Sparkles, ShieldCheck} from "lucide-react";
import NeonBackground from "@/components/layout/NeonBackground";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {getCatalogGifUrl} from "@/fx/catalogGif";
import {RULE_CATALOGUE_100} from "@/lib/ruleCatalogue100";

const families=["Toutes",...new Set(RULE_CATALOGUE_100.map(rule=>rule.family))];
export default function RuleLibrary() {
  const [family,setFamily]=useState("Toutes");
  const [search,setSearch]=useState("");
  const results=useMemo(()=>{
    const query=search.toLocaleLowerCase("fr").trim();
    return RULE_CATALOGUE_100.filter(rule=>
      (family==="Toutes"||rule.family===family) &&
      (!query||`${rule.title} ${rule.family} ${rule.summary}`.toLocaleLowerCase("fr").includes(query))
    );
  },[family,search]);
  const faithful=RULE_CATALOGUE_100.filter(x=>x.faithful).length;
  return <NeonBackground>
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 text-white sm:px-6">
      <nav className="flex items-center justify-between gap-3">
        <Button variant="ghost" asChild><Link to="/play-hub"><ArrowLeft className="mr-2 size-4"/> Hub Jouer</Link></Button>
        <Badge className="border-cyan-400/35 bg-cyan-500/15 text-cyan-100">Laboratoire local — non classé</Badge>
      </nav>
      <header className="rounded-3xl border border-cyan-300/30 bg-slate-950/80 p-6 sm:p-9">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[.16em] text-cyan-200"><Sparkles className="size-4"/> Dictionnaire des pouvoirs</div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">100 règles à essayer sur l’échiquier</h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-white/70">
          Chaque carte lance une partie locale avec une règle compilée par le moteur V2.
          Les versions marquées « adaptée » correspondent à une mécanique réellement exécutable,
          mais ne reproduisent pas encore toutes les subtilités du concept original.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm text-white/70">
          <span className="rounded-xl bg-white/10 px-3 py-2">100 concepts</span>
          <span className="rounded-xl bg-white/10 px-3 py-2">10 familles</span>
          <span className="rounded-xl bg-white/10 px-3 py-2">{faithful} concepts directs</span>
          <span className="rounded-xl bg-white/10 px-3 py-2">{100-faithful} adaptations du DSL</span>
        </div>
      </header>
      <div><Button variant="outline" asChild className="border-white/20 text-white"><Link to="/animation-library">Bibliothèque des animations</Link></Button></div>
      <section aria-label="Filtres du catalogue" className="space-y-3">
        <label className="relative block">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/45"/>
          <Input aria-label="Rechercher une règle" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Rechercher une règle, un effet, une famille…" className="min-h-12 border-white/20 bg-black/30 pl-10 text-white"/>
        </label>
        <div className="flex flex-wrap gap-2">
          {families.map(name=><Button key={name} size="sm" variant={family===name?"default":"outline"} className={family===name?"bg-cyan-500 text-slate-950 hover:bg-cyan-400":"border-white/20 bg-black/20 text-white hover:bg-white/10"} onClick={()=>setFamily(name)}>{name}</Button>)}
        </div>
      </section>
      <p role="status" aria-live="polite" className="text-sm text-white/60">{results.length} règle{results.length>1?"s":""} affichée{results.length>1?"s":""}</p>
      <section aria-label="Règles personnalisées" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map(item=>{
          const animationId=suggestAnimationId(`${item.title} ${item.family} ${item.mode}`,item.piece === "any" ? null : item.piece,item.sprite) ?? item.sprite;
          const animation=getCatalogGifUrl(animationId);
          return <Card key={item.id} className="group overflow-hidden border-white/15 bg-slate-950/90 text-white transition hover:border-cyan-300/50">
            <div className="relative h-40 overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950/60 to-slate-950">
              {animation&&<img alt="" aria-hidden="true" src={animation} loading="lazy" className="mx-auto h-full w-full object-contain p-2 transition-transform group-hover:scale-105"/>}
              <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 font-mono text-xs text-white/70">{item.id}</span>
            </div>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-white/20 text-white/70">{item.family}</Badge>
                <Badge variant="outline" className={item.faithful?"border-emerald-400/45 text-emerald-200":"border-amber-400/45 text-amber-200"}>{item.faithful?"Directe":"Adaptée"}</Badge>
              </div>
              <CardTitle className="text-lg leading-snug">{item.title}</CardTitle>
              <CardDescription className="leading-relaxed text-white/65">{item.summary}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-white/50">Recharge : {item.cooldown} tour(s) · {item.uses} utilisation(s) par pièce</p>
              {item.category==="victory"&&<p className="text-xs font-medium text-amber-200">Objectif expérimental : aucune victoire automatique.</p>}
              <Button asChild className="min-h-11 bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Link to={`/play?catalog=${item.id}`}><Gamepad2 className="mr-2 size-4"/> Jouer en local</Link></Button>
              {!item.faithful&&<Button variant="ghost" asChild className="text-sm text-cyan-200 hover:text-white"><Link to={`/generator?idea=${encodeURIComponent(item.intendedConcept)}`}><ShieldCheck className="mr-2 size-4"/> Développer la version exacte</Link></Button>}
            </CardContent>
          </Card>;
        })}
      </section>
      {results.length===0&&<p className="py-16 text-center text-white/60">Aucun pouvoir ne correspond aux filtres sélectionnés.</p>}
    </main>
  </NeonBackground>;
}
