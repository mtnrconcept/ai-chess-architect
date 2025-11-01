import { useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import { skateSpots, type SkateSpot } from "@/data/skateSpots";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

const cantonColors: Record<string, string> = {
  "Canton de Genève": "from-cyan-500/80 via-sky-400/80 to-blue-400/60",
  "Canton de Vaud": "from-emerald-500/80 via-teal-400/70 to-emerald-300/60",
  "Canton du Valais": "from-rose-500/80 via-fuchsia-400/70 to-pink-300/60",
  "Canton de Zurich": "from-amber-500/80 via-orange-400/70 to-yellow-300/60",
  "Canton de Berne": "from-purple-500/80 via-indigo-400/70 to-violet-300/60",
  "Canton de Bâle": "from-blue-500/80 via-cyan-400/70 to-sky-300/60",
  "Canton du Tessin": "from-lime-500/80 via-emerald-400/70 to-green-300/60",
  "Canton de Fribourg": "from-red-500/80 via-rose-400/70 to-orange-300/60",
  "Canton de Neuchâtel & Jura":
    "from-yellow-500/80 via-amber-400/70 to-orange-300/60",
  "Canton de Lucerne / Schwyz / Zug":
    "from-sky-500/80 via-cyan-400/70 to-indigo-300/60",
  "Canton de Saint-Gall & Thurgovie":
    "from-teal-500/80 via-cyan-400/70 to-green-300/60",
};

const centerOfSwitzerland: [number, number] = [46.8182, 8.2275];

const SkateMap = () => {
  const [selectedCanton, setSelectedCanton] = useState<string>("all");

  const cantons = useMemo(() => {
    const unique = Array.from(new Set(skateSpots.map((spot) => spot.canton)));
    return unique.sort((a, b) => a.localeCompare(b));
  }, []);

  const visibleSpots = useMemo(() => {
    if (selectedCanton === "all") {
      return skateSpots;
    }
    return skateSpots.filter((spot) => spot.canton === selectedCanton);
  }, [selectedCanton]);

  const groupedSpots = useMemo(() => {
    return visibleSpots.reduce<Record<string, SkateSpot[]>>((acc, spot) => {
      if (!acc[spot.canton]) {
        acc[spot.canton] = [];
      }
      acc[spot.canton].push(spot);
      return acc;
    }, {});
  }, [visibleSpots]);

  return (
    <div className="relative min-h-[calc(100vh-160px)] bg-[#020312] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),transparent_55%)]" />
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 text-left">
            <span className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80">
              Carte des spots
            </span>
            <h1 className="text-3xl font-bold md:text-4xl">
              Explorez les skateparks & pumptracks suisses
            </h1>
            <p className="max-w-3xl text-sm text-cyan-100/70 md:text-base">
              Filtrez par canton, découvrez les surfaces disponibles et repérez
              en un clin d'œil les modules clés pour préparer votre prochaine
              session.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-white/70 md:text-base">
              {visibleSpots.length} spots affichés sur un total de{" "}
              {skateSpots.length} références.
            </div>
            <Select value={selectedCanton} onValueChange={setSelectedCanton}>
              <SelectTrigger className="w-full rounded-full border-white/20 bg-black/40 text-sm text-white sm:w-72">
                <SelectValue placeholder="Choisir un canton" />
              </SelectTrigger>
              <SelectContent className="max-h-72 bg-[#030516] text-white">
                <SelectItem value="all">Tous les cantons</SelectItem>
                {cantons.map((canton) => (
                  <SelectItem key={canton} value={canton}>
                    {canton}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="overflow-hidden rounded-3xl border border-white/10 shadow-[0_0_45px_rgba(14,165,233,0.25)]">
            <MapContainer
              {...({
                center: centerOfSwitzerland,
                zoom: 8,
                scrollWheelZoom: true,
                className: "h-[540px] w-full"
              } as any)}
            >
              <TileLayer
                {...({
                  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                } as any)}
              />
              {visibleSpots.map((spot) => (
                <Marker
                  key={`${spot.name}-${spot.address}`}
                  position={[spot.coordinates.lat, spot.coordinates.lng]}
                >
                  <Popup>
                    <div className="space-y-2 text-left">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {spot.name}
                        </p>
                        <p className="text-xs text-white/70">{spot.address}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant="secondary"
                          className="bg-cyan-500/20 text-cyan-100"
                        >
                          {spot.environment}
                        </Badge>
                        {spot.surfaces.map((surface) => (
                          <Badge
                            key={surface}
                            variant="secondary"
                            className="bg-white/10 text-white/80"
                          >
                            {surface}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-xs text-white/70">
                        Modules : {spot.modules.join(", ")}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          <aside className="flex flex-col gap-4">
            <ScrollArea className="h-[540px] rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
              <div className="flex flex-col gap-4">
                {Object.entries(groupedSpots).map(([canton, spots]) => (
                  <section
                    key={canton}
                    className="rounded-2xl border border-white/10 bg-black/30 p-4 shadow-[0_0_25px_rgba(12,74,110,0.25)]"
                  >
                    <div
                      className={cn(
                        "mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-white/90",
                        "bg-gradient-to-r",
                        cantonColors[canton] ??
                          "from-cyan-500/70 via-blue-500/60 to-purple-500/60",
                      )}
                    >
                      {canton}
                    </div>
                    <ul className="space-y-3">
                      {spots.map((spot) => (
                        <li
                          key={`${spot.name}-${spot.address}`}
                          className="space-y-1 text-sm"
                        >
                          <div className="font-semibold text-white">
                            {spot.name}
                          </div>
                          <div className="text-xs uppercase tracking-[0.25em] text-white/50">
                            {spot.environment}
                          </div>
                          <div className="text-xs text-white/70">
                            {spot.address}
                          </div>
                          <div className="flex flex-wrap gap-1 pt-1">
                            {spot.modules.map((module) => (
                              <Badge
                                key={module}
                                variant="secondary"
                                className="bg-white/10 text-white/70"
                              >
                                {module}
                              </Badge>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </ScrollArea>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default SkateMap;
