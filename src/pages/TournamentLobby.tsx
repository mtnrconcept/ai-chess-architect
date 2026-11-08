import {useEffect, useMemo, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {Link, useNavigate, useParams} from "react-router-dom";
import {ArrowLeft, Clock3, Loader2, Radio, RefreshCw, ShieldCheck, Swords, Trophy, Users} from "lucide-react";
import NeonBackground from "@/components/layout/NeonBackground";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {useAuth} from "@/contexts/AuthContext";
import {fetchTournamentDetails, registerForTournament} from "@/lib/tournamentApi";
import {createStandardChessRoom, getChessMatchByRoom, getChessRoom, joinChessRoom, listOpenChessRooms} from "@/features/play-hub/platform-api";
import {isTournamentId, isTournamentFriendlyRoom, tournamentFriendlyRoomName} from "@/features/play-hub/tournament-friendly-rooms";

const textError = (caught: unknown) => caught instanceof Error ? caught.message : "Opération indisponible.";
const prettyTime = (iso: string) => new Intl.DateTimeFormat("fr-CH",{
  dateStyle:"medium",timeStyle:"short",
}).format(new Date(iso));

export default function TournamentLobby() {
  const {tournamentId} = useParams<{tournamentId:string}>();
  const validId = isTournamentId(tournamentId) ? tournamentId.toLowerCase() : null;
  const {user} = useAuth();
  const navigate=useNavigate();
  const queryClient=useQueryClient();
  const [busy,setBusy]=useState<"register"|"create"|"join"|null>(null);
  const [busyRoom,setBusyRoom]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const requestIdRef=useRef<string|null>(null);
  const storageKey=validId ? `aichess:tournament-friendly-room:${validId}` : null;
  const [watchedRoomId,setWatchedRoomId]=useState<string|null>(()=>{
    if(!storageKey || typeof window==="undefined")return null;
    try {
      const value=window.sessionStorage.getItem(storageKey);
      return value && isTournamentId(value) ? value : null;
    } catch {return null;}
  });

  const tournamentQuery=useQuery({
    queryKey:["tournament-details",validId],
    queryFn:()=>fetchTournamentDetails(validId!),
    enabled:Boolean(validId),
    staleTime:4_000,retry:1,refetchInterval:7_000,
  });
  const roomsQuery=useQuery({
    queryKey:["chess-platform","open-standard-rooms","tournament",validId],
    queryFn:()=>listOpenChessRooms(100),
    enabled:Boolean(validId && user),
    retry:1,staleTime:2_000,refetchInterval:5_000,
  });
  const roomSessionQuery=useQuery({
    queryKey:["chess-platform","tournament-room",watchedRoomId],
    queryFn:async()=>{
      const [room,match]=await Promise.all([
        getChessRoom(watchedRoomId!),getChessMatchByRoom(watchedRoomId!),
      ]);
      return {room,match};
    },
    enabled:Boolean(watchedRoomId && user),
    retry:1,refetchInterval:2_000,
  });

  useEffect(()=>{
    if(!storageKey || typeof window==="undefined")return;
    try {
      if(watchedRoomId) window.sessionStorage.setItem(storageKey,watchedRoomId);
      else window.sessionStorage.removeItem(storageKey);
    } catch {/* private browsing */}
  },[storageKey,watchedRoomId]);
  useEffect(()=>{
    const matchId=roomSessionQuery.data?.match?.matchId;
    if(matchId)navigate(`/match/${matchId}`,{replace:true});
  },[navigate,roomSessionQuery.data?.match?.matchId]);
  useEffect(()=>{
    if(roomSessionQuery.data?.room &&
      ["cancelled","completed"].includes(roomSessionQuery.data.room.status) &&
      !roomSessionQuery.data.match) setWatchedRoomId(null);
  },[roomSessionQuery.data]);

  const details=tournamentQuery.data;
  const tournament=details?.overview;
  const registered = useMemo(
    ()=>Boolean(user && details?.registrations?.some(r=>r.user_id===user.id)),
    [details?.registrations,user],
  );
  const friendlyRooms=useMemo(()=>{
    return (roomsQuery.data??[])
      .filter(room=>room.rulesetType==="standard" && !room.rated && validId && isTournamentFriendlyRoom(room.roomName,validId))
      .sort((a,b)=>a.waitingSince.localeCompare(b.waitingSince));
  },[roomsQuery.data,validId]);
  const lobbyLabel=tournament ? tournament.title : "Salon de tournoi";
  const active=tournament ? Date.now()>=Date.parse(tournament.starts_at) &&
    Date.now()<=Date.parse(tournament.ends_at) &&
    !["cancelled","completed"].includes(tournament.status) : false;

  const register=async()=>{
    if(!validId)return;
    if(!user){navigate("/signup");return;}
    if(busy)return;
    setBusy("register");setError(null);setNotice(null);
    try {
      const display=String(user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Joueur").slice(0,80);
      const avatar=typeof user.user_metadata?.avatar_url==="string" ? user.user_metadata.avatar_url : null;
      await registerForTournament(validId,user.id,display,avatar);
      setNotice("Inscription au tournoi enregistrée.");
      await queryClient.invalidateQueries({queryKey:["tournament-details",validId]});
    }catch(e){setError(textError(e));}
    finally{setBusy(null);}
  };
  const createFriendly=async()=>{
    if(!validId)return;
    if(!user){navigate("/signup");return;}
    if(busy)return;
    setBusy("create");setError(null);setNotice(null);
    try {
      const requestKey=requestIdRef.current??crypto.randomUUID();
      requestIdRef.current=requestKey;
      const created=await createStandardChessRoom({
        name:tournamentFriendlyRoomName(validId),
        visibility:"public",requestKey,
        initialSeconds:600,incrementSeconds:0,ownerColor:"random",
      });
      setWatchedRoomId(created.roomId);
      setNotice("Salon sécurisé créé. Un second joueur peut maintenant vous rejoindre.");
      await roomsQuery.refetch();
    }catch(e){setError(textError(e));}
    finally{setBusy(null);}
  };
  const joinFriendly=async(roomId:string)=>{
    if(!user){navigate("/signup");return;}
    if(busy)return;
    setBusy("join");setBusyRoom(roomId);setError(null);setNotice(null);
    try {
      const joined=await joinChessRoom(roomId);
      if(joined.matchId){navigate(`/match/${joined.matchId}`);return;}
      setWatchedRoomId(joined.roomId);
      setNotice("Salle rejointe. Connexion de la partie sécurisée en cours.");
    }catch(e){setError(textError(e));await roomsQuery.refetch();}
    finally{setBusy(null);setBusyRoom(null);}
  };

  return <NeonBackground>
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 text-white sm:px-6 sm:py-10">
      <nav className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost"><Link to="/tournaments"><ArrowLeft className="mr-2 h-4 w-4"/>Tournois</Link></Button>
        <Badge className="border-cyan-300/40 bg-cyan-300/15 text-cyan-100"><Radio className="mr-1.5 h-3.5 w-3.5"/>Données serveur, actualisation automatique</Badge>
      </nav>
      {!validId ? <Alert variant="destructive"><AlertTitle>Identifiant invalide</AlertTitle><AlertDescription>Ce lien ne correspond à aucun tournoi.</AlertDescription></Alert>
      : tournamentQuery.isLoading ? <div role="status" className="flex min-h-52 items-center justify-center"><Loader2 className="mr-3 h-5 w-5 animate-spin"/>Chargement du tournoi…</div>
      : tournamentQuery.isError || !tournament ? <Alert variant="destructive"><AlertTitle>Tournoi indisponible</AlertTitle><AlertDescription>{textError(tournamentQuery.error)}</AlertDescription></Alert>
      : <>
        <header className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-slate-950 to-fuchsia-500/10 p-6 sm:p-9">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-cyan-200"><Trophy className="h-5 w-5"/>Salon de tournoi</div>
          <h1 className="text-2xl font-black sm:text-4xl">{lobbyLabel}</h1>
          <p className="mt-3 text-sm text-slate-300">{prettyTime(tournament.starts_at)} → {prettyTime(tournament.ends_at)}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Badge variant="outline" className="border-cyan-400/40 text-cyan-200"><Users className="mr-1 h-3.5 w-3.5"/>{tournament.player_count} inscrits</Badge>
            <Badge variant="outline" className={active?"border-emerald-400/40 text-emerald-200":"border-amber-400/40 text-amber-200"}><Clock3 className="mr-1 h-3.5 w-3.5"/>{active?"Créneau en cours":"Créneau hors jeu"}</Badge>
            <Badge variant="outline" className="border-white/20 text-slate-200">{tournament.active_match_count} matches en cours</Badge>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {!registered && <Button onClick={()=>void register()} disabled={busy!==null || !user} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">{busy==="register"?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:null}S'inscrire au tournoi</Button>}
            {registered && <Badge className="bg-emerald-600/20 px-4 py-3 text-emerald-100">Inscription confirmée</Badge>}
            <Button onClick={()=>void tournamentQuery.refetch()} variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10"><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button>
            <Button asChild variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10"><Link to="/play-hub"><Swords className="mr-2 h-4 w-4"/>Matchmaking PvP</Link></Button>
            {!user && <Button asChild><Link to="/signup">Connexion requise pour participer</Link></Button>}
          </div>
        </header>

        <Alert className="border-amber-400/30 bg-amber-950/25 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Parties multijoueur sécurisées</AlertTitle>
          <AlertDescription>Les salons ci-dessous utilisent le moteur serveur, la synchronisation Realtime et l'horloge partagée. Ce sont des parties <strong>amicales et non classées</strong> : elles ne modifient pas le score officiel du tournoi. Le classement officiel reste géré par le système de tournoi distinct.</AlertDescription>
        </Alert>

        {error && <Alert variant="destructive"><AlertTitle>Action interrompue</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {notice && <Alert className="border-emerald-300/30 bg-emerald-900/20 text-emerald-100"><AlertTitle>Confirmation</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert>}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-white/15 bg-slate-950/80 text-white">
            <CardHeader><CardTitle>Salons multijoueur en attente</CardTitle><CardDescription>Deux joueurs réels, 10 minutes chacun. Actualisation toutes les 5 secondes.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {roomsQuery.isLoading && <p className="text-sm text-slate-400">Recherche des adversaires…</p>}
              {roomsQuery.isError && <p className="text-sm text-red-300">Impossible de consulter les salons : {textError(roomsQuery.error)}</p>}
              {friendlyRooms.length===0 && !roomsQuery.isLoading && <p className="rounded-xl border border-dashed border-white/20 p-4 text-sm text-slate-400">Aucun salon ouvert : créez le premier duel.</p>}
              {friendlyRooms.map(room=><div key={room.roomId} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div><p className="font-semibold">{room.roomName}</p><p className="text-xs text-slate-400">En attente depuis {prettyTime(room.waitingSince)}</p></div>
                <Button size="sm" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                  disabled={!user || busy!==null || room.ownerId===user.id}
                  onClick={()=>void joinFriendly(room.roomId)}>
                  {busyRoom===room.roomId?<Loader2 className="h-4 w-4 animate-spin"/>:room.ownerId===user?.id?"Votre salon":"Rejoindre"}
                </Button>
              </div>)}
              <Button className="w-full bg-fuchsia-500 text-white hover:bg-fuchsia-400" disabled={!user || busy!==null || Boolean(watchedRoomId)} onClick={()=>void createFriendly()}>
                {busy==="create"&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Créer un salon PvP
              </Button>
              {watchedRoomId && <div role="status" className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm">
                <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin"/>Salon créé ou rejoint. Attente de l'adversaire…</div>
                <Button type="button" size="sm" variant="ghost" className="mt-2 text-cyan-200" onClick={()=>setWatchedRoomId(null)}>Quitter cette attente</Button>
              </div>}
            </CardContent>
          </Card>

          <Card className="border-white/15 bg-slate-950/80 text-white">
            <CardHeader><CardTitle>Tables du tournoi</CardTitle><CardDescription>État officiel des parties et du classement, sans résultats fictifs.</CardDescription></CardHeader>
            <CardContent className="max-h-[480px] space-y-2 overflow-y-auto">
              {details.matches.length===0 ? <p className="rounded-xl border border-dashed border-white/20 p-4 text-sm text-slate-400">Aucune table officielle créée pour ce tournoi.</p>
              : details.matches.map(match=><div key={match.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div><p className="font-medium">Table {match.table_number??"—"}</p><p className="text-xs text-slate-400">{match.is_ai_match?"Partie contre l'IA":"Deux joueurs"} · {match.result??"Pas de résultat"}</p></div>
                <Badge className={match.status==="playing"?"bg-emerald-500/20 text-emerald-100":"bg-white/10 text-white/70"}>{match.status==="playing"?"En cours":match.status==="finished"?"Terminée":"En attente"}</Badge>
              </div>)}
            </CardContent>
          </Card>
        </div>
        <Card className="border-white/15 bg-slate-950/80 text-white">
          <CardHeader><CardTitle>Participants inscrits</CardTitle></CardHeader>
          <CardContent>
            {details.registrations.length===0?<p className="text-sm text-slate-400">Aucun participant inscrit pour le moment.</p>
            : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {details.registrations.map(reg=><div key={reg.id} className="flex justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                <span>{reg.display_name??"Joueur"}</span><span className="text-cyan-200">{reg.points??0} pts</span>
              </div>)}
            </div>}
          </CardContent>
        </Card>
      </>}
    </main>
  </NeonBackground>;
}
