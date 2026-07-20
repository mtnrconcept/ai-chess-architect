import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Clipboard,
  Clock3,
  DoorOpen,
  Globe2,
  KeyRound,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TIME_CONTROL_SETTINGS,
  type TimeControlOption,
} from "@/types/timeControl";
import {
  createChessRoomInvitation,
  createStandardChessRoom,
  getChessMatchByRoom,
  getChessRoom,
  joinChessRoom,
  listOpenChessRooms,
  type ChessRoomInvitation,
  type CreatedChessRoom,
  type OpenChessRoom,
} from "./platform-api";
import {
  buildStandardRoomInviteUrl,
  isStandardRoomId,
  isStandardRoomInvitationToken,
} from "./standard-room-invite";

interface StandardRoomsCardProps {
  isAuthenticated: boolean;
  playerName: string;
  userId?: string;
}

type RoomVisibility = "public" | "private";
type StandardTimeControl = Exclude<TimeControlOption, "untimed">;

const standardTimeControls: readonly StandardTimeControl[] = [
  "bullet",
  "blitz",
  "long",
];

const formatTimeControl = (
  room: Pick<OpenChessRoom, "initialSeconds" | "incrementSeconds">,
) => `${Math.floor(room.initialSeconds / 60)}+${room.incrementSeconds}`;

const messageFromError = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function StandardRoomsCard({
  isAuthenticated,
  playerName,
  userId,
}: StandardRoomsCardProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [roomName, setRoomName] = useState(`${playerName} · Partie`);
  const [visibility, setVisibility] = useState<RoomVisibility>("public");
  const [timeControl, setTimeControl] = useState<StandardTimeControl>("blitz");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdRoom, setCreatedRoom] = useState<CreatedChessRoom | null>(null);
  const [invitation, setInvitation] = useState<ChessRoomInvitation | null>(
    null,
  );
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [watchedRoomId, setWatchedRoomId] = useState<string | null>(null);
  const requestKeyRef = useRef<string | null>(null);

  const invitedRoomId = searchParams.get("roomId")?.trim() ?? "";
  const invitationToken = searchParams.get("token")?.trim() ?? "";
  const hasValidUrlInvitation =
    isStandardRoomId(invitedRoomId) &&
    isStandardRoomInvitationToken(invitationToken);
  const hasMalformedUrlInvitation =
    Boolean(invitedRoomId || invitationToken) && !hasValidUrlInvitation;

  const roomsQuery = useQuery({
    queryKey: ["chess-platform", "open-standard-rooms"],
    queryFn: () => listOpenChessRooms(50),
    enabled: isAuthenticated,
    retry: 1,
    staleTime: 3_000,
    refetchInterval: 7_000,
  });
  const standardRooms = useMemo(
    () =>
      (roomsQuery.data ?? []).filter(
        (room) => room.rulesetType === "standard" && room.rated === false,
      ),
    [roomsQuery.data],
  );

  const roomSessionQuery = useQuery({
    queryKey: ["chess-platform", "standard-room-session", watchedRoomId],
    queryFn: async () => {
      const [room, match] = await Promise.all([
        getChessRoom(watchedRoomId!),
        getChessMatchByRoom(watchedRoomId!),
      ]);
      return { room, match };
    },
    enabled: isAuthenticated && Boolean(watchedRoomId),
    retry: 1,
    refetchInterval: (query) =>
      !query.state.data?.match && query.state.data?.room?.status === "open"
        ? 2_000
        : false,
  });

  useEffect(() => {
    const matchId = roomSessionQuery.data?.match?.matchId;
    if (matchId) navigate(`/match/${matchId}`, { replace: true });
  }, [navigate, roomSessionQuery.data?.match?.matchId]);

  const invitationUrl = useMemo(() => {
    if (!createdRoom || !invitation || typeof window === "undefined")
      return null;
    try {
      return buildStandardRoomInviteUrl(
        window.location.origin,
        createdRoom.roomId,
        invitation.invitationToken,
      );
    } catch {
      return null;
    }
  }, [createdRoom, invitation]);

  const generateInvitation = async (roomId: string) => {
    setInvitationError(null);
    setCopyState("idle");
    try {
      const nextInvitation = await createChessRoomInvitation(roomId);
      setInvitation(nextInvitation);
    } catch (error) {
      setInvitationError(
        messageFromError(error, "Le lien privé n’a pas pu être généré."),
      );
    }
  };

  const createRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAuthenticated || !userId || creating || createdRoom) return;
    setCreating(true);
    setCreateError(null);
    setInvitationError(null);
    try {
      const requestKey = requestKeyRef.current ?? crypto.randomUUID();
      requestKeyRef.current = requestKey;
      const settings = TIME_CONTROL_SETTINGS[timeControl];
      const room = await createStandardChessRoom({
        name: roomName,
        visibility,
        requestKey,
        initialSeconds: settings.initialSeconds,
        incrementSeconds: 0,
        ownerColor: "random",
      });
      setCreatedRoom(room);
      setWatchedRoomId(room.roomId);
      await roomsQuery.refetch();
      if (visibility === "private") await generateInvitation(room.roomId);
    } catch (error) {
      setCreateError(
        messageFromError(error, "La création n’a pas été confirmée."),
      );
    } finally {
      setCreating(false);
    }
  };

  const join = async (roomId: string, token: string | null = null) => {
    if (!isAuthenticated) {
      navigate("/signup");
      return;
    }
    if (joiningRoomId) return;
    setJoiningRoomId(roomId);
    setJoinError(null);
    try {
      const joined = await joinChessRoom(roomId, token);
      if (joined.matchId) {
        navigate(`/match/${joined.matchId}`);
        return;
      }
      setWatchedRoomId(joined.roomId);
    } catch (error) {
      setJoinError(
        messageFromError(error, "La salle n’a pas pu être rejointe."),
      );
    } finally {
      setJoiningRoomId(null);
    }
  };

  const copyInvitation = async () => {
    if (!invitationUrl) return;
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  return (
    <Card className="border-cyan-300/20 bg-[#070b19]/92">
      <CardHeader className="gap-3 border-b border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
            <DoorOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Salles standard réelles
          </Badge>
          <Badge variant="outline" className="text-white/55">
            Non classé
          </Badge>
        </div>
        <CardTitle>Créer ou rejoindre une salle classique</CardTitle>
        <CardDescription className="text-cyan-50/60">
          Ces salles utilisent les RPC atomiques du serveur. Elles restent
          séparées des lobbies Rule Architect à règles personnalisées.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 p-5 sm:p-6">
        {hasMalformedUrlInvitation && (
          <Alert variant="destructive">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Lien privé invalide</AlertTitle>
            <AlertDescription>
              Le roomId ou le jeton est incomplet. Demande un nouveau lien au
              créateur de la salle.
            </AlertDescription>
          </Alert>
        )}

        {hasValidUrlInvitation && (
          <Alert className="border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-50">
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Invitation privée détectée</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                Le jeton sera envoyé une seule fois à la RPC de jonction. La
                base ne conserve que son empreinte SHA-256.
              </p>
              <Button
                size="sm"
                onClick={() => void join(invitedRoomId, invitationToken)}
                disabled={Boolean(joiningRoomId)}
              >
                {joiningRoomId === invitedRoomId && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isAuthenticated ? "Rejoindre cette salle" : "Se connecter"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!isAuthenticated ? (
          <Alert>
            <Users className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Compte requis</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                La liste, la création et la jonction sont réservées aux comptes
                authentifiés par les politiques RLS.
              </p>
              <Button size="sm" onClick={() => navigate("/signup")}>
                Créer un compte
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <form onSubmit={createRoom} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="standard-room-name">Nom de la salle</Label>
                  <Input
                    id="standard-room-name"
                    value={roomName}
                    onChange={(event) => {
                      setRoomName(event.target.value);
                      setCreateError(null);
                    }}
                    minLength={3}
                    maxLength={80}
                    disabled={creating || Boolean(createdRoom)}
                    className="border-white/10 bg-black/30"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="standard-room-visibility">Accès</Label>
                  <Select
                    value={visibility}
                    onValueChange={(value: RoomVisibility) =>
                      setVisibility(value)
                    }
                    disabled={creating || Boolean(createdRoom)}
                  >
                    <SelectTrigger
                      id="standard-room-visibility"
                      className="border-white/10 bg-black/30"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Publique</SelectItem>
                      <SelectItem value="private">Privée par lien</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="standard-room-cadence">Cadence</Label>
                  <Select
                    value={timeControl}
                    onValueChange={(value: StandardTimeControl) =>
                      setTimeControl(value)
                    }
                    disabled={creating || Boolean(createdRoom)}
                  >
                    <SelectTrigger
                      id="standard-room-cadence"
                      className="border-white/10 bg-black/30"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {standardTimeControls.map((option) => (
                        <SelectItem key={option} value={option}>
                          {TIME_CONTROL_SETTINGS[option].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                type="submit"
                disabled={
                  creating || Boolean(createdRoom) || roomName.trim().length < 3
                }
              >
                {creating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                {createdRoom ? "Salle créée" : "Créer la salle"}
              </Button>
            </form>

            {createError && (
              <Alert variant="destructive">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Création non confirmée</AlertTitle>
                <AlertDescription>
                  {createError} Le bouton réutilise la même clé UUID pour un
                  nouvel essai idempotent.
                </AlertDescription>
              </Alert>
            )}

            {createdRoom && (
              <Alert className="border-emerald-300/25 bg-emerald-300/10 text-emerald-50">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Salle ouverte côté serveur</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>
                    Couleur attribuée :{" "}
                    {createdRoom.ownerColor === "white" ? "Blancs" : "Noirs"}.
                    Le match sera ouvert dès l’arrivée du second joueur.
                  </p>
                  {roomSessionQuery.isFetching && (
                    <p className="flex items-center gap-2 text-xs">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Vérification RLS de la salle et du match…
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {createdRoom && visibility === "private" && (
              <div className="space-y-3 rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/[0.07] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-fuchsia-50">
                  <LockKeyhole className="h-4 w-4" />
                  Lien privé à usage contrôlé
                </div>
                {invitationUrl ? (
                  <>
                    <Input
                      value={invitationUrl}
                      readOnly
                      aria-label="Lien d’invitation privée"
                      className="border-white/10 bg-black/30 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void copyInvitation()}
                    >
                      {copyState === "copied" ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : (
                        <Clipboard className="mr-2 h-4 w-4" />
                      )}
                      {copyState === "copied" ? "Lien copié" : "Copier le lien"}
                    </Button>
                    {copyState === "error" && (
                      <p role="alert" className="text-xs text-rose-200">
                        Copie automatique refusée. Sélectionne le lien
                        manuellement.
                      </p>
                    )}
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void generateInvitation(createdRoom.roomId)}
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    Générer le lien privé
                  </Button>
                )}
                {invitationError && (
                  <p role="alert" className="text-xs text-rose-200">
                    {invitationError}
                  </p>
                )}
              </div>
            )}

            {roomSessionQuery.isError && watchedRoomId && (
              <Alert variant="destructive">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Surveillance interrompue</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>
                    La salle ou son match n’a pas pu être relu via les
                    politiques RLS.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void roomSessionQuery.refetch()}
                  >
                    Réessayer
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-3 border-t border-white/10 pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">Salles publiques</h3>
                  <p className="text-xs text-white/45">
                    Standard, non classées, ouvertes maintenant
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Actualiser les salles"
                  onClick={() => void roomsQuery.refetch()}
                  disabled={roomsQuery.isFetching}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${roomsQuery.isFetching ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>

              {roomsQuery.isLoading ? (
                <p className="flex items-center gap-2 text-sm text-white/50">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement des salles…
                </p>
              ) : roomsQuery.isError ? (
                <Alert variant="destructive">
                  <RefreshCw className="h-4 w-4" />
                  <AlertTitle>Liste indisponible</AlertTitle>
                  <AlertDescription>
                    La RPC publique authentifiée n’a pas répondu. Utilise
                    Actualiser pour réessayer.
                  </AlertDescription>
                </Alert>
              ) : standardRooms.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/45">
                  Aucune salle standard publique n’attend actuellement.
                </p>
              ) : (
                <ul className="space-y-2">
                  {standardRooms.map((room) => {
                    const isOwner = room.ownerId === userId;
                    return (
                      <li
                        key={room.roomId}
                        className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {room.roomName}
                          </p>
                          <p className="mt-1 flex items-center gap-2 text-xs text-white/45">
                            <Clock3 className="h-3.5 w-3.5" />
                            {formatTimeControl(room)} ·{" "}
                            {isOwner ? "ta salle" : "1 place"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void join(room.roomId)}
                          disabled={Boolean(joiningRoomId)}
                        >
                          {joiningRoomId === room.roomId ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : isOwner ? (
                            <Globe2 className="mr-2 h-4 w-4" />
                          ) : (
                            <DoorOpen className="mr-2 h-4 w-4" />
                          )}
                          {isOwner ? "Surveiller" : "Rejoindre"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}

        {joinError && (
          <Alert variant="destructive">
            <DoorOpen className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Jonction refusée</AlertTitle>
            <AlertDescription>{joinError}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
