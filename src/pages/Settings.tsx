import { useState } from "react";
import {
  Palette,
  Volume2,
  Shield,
  Bell,
  Languages,
  Accessibility,
  UserCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";

const sidebarSections = [
  { id: "profile", label: "Profil", icon: UserCircle },
  { id: "appearance", label: "Apparence", icon: Palette },
  { id: "audio", label: "Audio & Vibration", icon: Volume2 },
  { id: "accessibility", label: "Accessibilité", icon: Accessibility },
  { id: "language", label: "Langue", icon: Languages },
  { id: "privacy", label: "Confidentialité & Sécurité", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
];

const Settings = () => {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState("appearance");
  const [theme, setTheme] = useState("neon");
  const [neonIntensity, setNeonIntensity] = useState(80);
  const [uiSize, setUiSize] = useState("md");
  const [highContrast, setHighContrast] = useState(true);
  const [colorBlindMode, setColorBlindMode] = useState(false);
  const [gdprMode, setGdprMode] = useState(true);
  const [visibility, setVisibility] = useState(true);
  const [dataSharing, setDataSharing] = useState(false);

  const handleReset = () => {
    setTheme("neon");
    setNeonIntensity(80);
    setUiSize("md");
    setHighContrast(true);
    setColorBlindMode(false);
    setGdprMode(true);
    setVisibility(true);
    setDataSharing(false);
    toast({
      title: "Paramètres réinitialisés",
      description: "Toutes vos préférences sont revenues à leurs valeurs par défaut.",
    });
  };

  const handleSave = () => {
    toast({
      title: "Paramètres sauvegardés",
      description: "Vos préférences d'apparence et d'accessibilité ont été mises à jour.",
    });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-16 px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(20,230,255,0.18),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(255,0,200,0.14),transparent_60%)]" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 lg:flex-row">
        <aside className="flex h-fit min-w-[250px] flex-col gap-3 rounded-2xl border border-cyan-500/30 bg-black/40 p-6 shadow-[0_0_45px_rgba(14,165,233,0.25)] backdrop-blur-xl">
          <div className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300/80">Paramètres</div>
          <div className="space-y-2">
            {sidebarSections.map(section => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`group flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left transition-colors duration-200 ${
                    isActive
                      ? "border-cyan-400/60 bg-cyan-500/10 text-white shadow-[0_0_25px_rgba(6,182,212,0.45)]"
                      : "text-slate-300/80 hover:border-cyan-500/40 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 transition-all ${
                      isActive ? "shadow-[0_0_20px_rgba(6,182,212,0.45)]" : "group-hover:shadow-[0_0_15px_rgba(6,182,212,0.35)]"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-base font-medium">{section.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex-1">
          <Card className="relative overflow-hidden rounded-3xl border border-cyan-400/30 bg-black/50 shadow-[0_0_55px_rgba(20,230,255,0.25)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400" />
            <div className="pointer-events-none absolute -left-32 top-24 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -right-24 bottom-16 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
            <CardHeader className="relative z-10 flex flex-col gap-2 pb-6">
              <span className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200/70">Apparence</span>
              <CardTitle className="bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 bg-clip-text text-4xl font-bold text-transparent">
                Personnalisation néon
              </CardTitle>
              <p className="max-w-xl text-sm text-slate-300/80">
                Ajustez l'expérience visuelle pour correspondre à votre style de jeu. Les paramètres sont appliqués
                instantanément à toutes vos interfaces de Voltus Chess.
              </p>
            </CardHeader>
            <CardContent className="relative z-10 grid gap-10 pb-10">
              <section className="grid gap-6 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-6 shadow-inner shadow-cyan-500/10 lg:grid-cols-2">
                <div className="space-y-4">
                  <Label className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">Thème</Label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { id: "neon", label: "Néon" },
                      { id: "luminous", label: "Lumineux" },
                      { id: "stealth", label: "Sombre" },
                    ].map(option => (
                      <button
                        key={option.id}
                        onClick={() => setTheme(option.id)}
                        className={`flex flex-col gap-2 rounded-2xl border-2 p-4 transition-all ${
                          theme === option.id
                            ? "border-cyan-400 bg-cyan-500/10 shadow-[0_0_35px_rgba(34,211,238,0.45)]"
                            : "border-cyan-500/20 bg-black/40 hover:border-cyan-400/60 hover:bg-cyan-500/5"
                        }`}
                      >
                        <span className="text-left text-lg font-semibold text-white">{option.label}</span>
                        <span className="text-left text-xs text-cyan-100/70">
                          {option.id === "neon"
                            ? "Contrastes intenses et lueurs futuristes"
                            : option.id === "luminous"
                            ? "Interface plus claire pour les sessions diurnes"
                            : "Palette discrète inspirée des salles d'analyse"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">Intensité néon</Label>
                    <div className="rounded-2xl border border-cyan-400/30 bg-black/40 p-5">
                      <div className="flex items-center justify-between text-sm text-cyan-100/70">
                        <span>Brillance</span>
                        <span className="font-semibold text-white">{neonIntensity}%</span>
                      </div>
                      <Slider
                        value={[neonIntensity]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={value => setNeonIntensity(value[0])}
                        className="mt-4"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">Taille de l'interface</Label>
                    <ToggleGroup
                      type="single"
                      value={uiSize}
                      onValueChange={value => value && setUiSize(value)}
                      className="flex gap-3"
                    >
                      {[
                        { id: "sm", label: "SM" },
                        { id: "md", label: "MD" },
                        { id: "lg", label: "LG" },
                      ].map(option => (
                        <ToggleGroupItem
                          key={option.id}
                          value={option.id}
                          className={`flex h-12 flex-1 items-center justify-center rounded-xl border-2 text-sm font-semibold transition-all ${
                            uiSize === option.id
                              ? "border-cyan-400 bg-cyan-500/10 text-white shadow-[0_0_25px_rgba(34,211,238,0.45)]"
                              : "border-cyan-500/30 text-cyan-100/70 hover:border-cyan-400/80 hover:text-white"
                          }`}
                        >
                          {option.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    <p className="text-xs text-cyan-100/60">
                      Ajustez la densité de l'interface pour optimiser la lisibilité selon votre appareil.
                    </p>
                  </div>
                </div>
              </section>

              <section className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4 rounded-2xl border border-cyan-400/25 bg-cyan-500/5 p-6 shadow-inner shadow-cyan-500/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Accessibilité</h3>
                      <p className="text-xs text-cyan-100/60">Renforcez la visibilité et l'inclusivité de vos analyses.</p>
                    </div>
                    <Accessibility className="h-6 w-6 text-cyan-300" />
                  </div>
                  <div className="space-y-5">
                    <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/40 px-4 py-3">
                      <div>
                        <h4 className="text-sm font-semibold text-white">Contraste élevé</h4>
                        <p className="text-xs text-cyan-100/60">Optimise les zones critiques pour la lecture rapide.</p>
                      </div>
                      <Switch checked={highContrast} onCheckedChange={setHighContrast} />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/40 px-4 py-3">
                      <div>
                        <h4 className="text-sm font-semibold text-white">Mode daltonien</h4>
                        <p className="text-xs text-cyan-100/60">Ajuste les couleurs pour une meilleure différenciation.</p>
                      </div>
                      <Switch checked={colorBlindMode} onCheckedChange={setColorBlindMode} />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-cyan-400/25 bg-black/50 p-6 shadow-inner shadow-fuchsia-500/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Confidentialité & Sécurité</h3>
                      <p className="text-xs text-cyan-100/60">Contrôlez la visibilité de vos performances et données.</p>
                    </div>
                    <Shield className="h-6 w-6 text-fuchsia-300" />
                  </div>
                  <div className="space-y-5">
                    <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-4 py-3">
                      <div>
                        <h4 className="text-sm font-semibold text-white">Mode RGPD</h4>
                        <p className="text-xs text-cyan-100/60">Minimise la collecte des données non essentielles.</p>
                      </div>
                      <Switch checked={gdprMode} onCheckedChange={setGdprMode} />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-4 py-3">
                      <div>
                        <h4 className="text-sm font-semibold text-white">Visibilité du profil</h4>
                        <p className="text-xs text-cyan-100/60">Partagez vos analyses avec la communauté.</p>
                      </div>
                      <Switch checked={visibility} onCheckedChange={setVisibility} />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-4 py-3">
                      <div>
                        <h4 className="text-sm font-semibold text-white">Partage de données</h4>
                        <p className="text-xs text-cyan-100/60">Contribuez anonymement à l'entraînement des modèles.</p>
                      </div>
                      <Switch checked={dataSharing} onCheckedChange={setDataSharing} />
                    </div>
                  </div>
                </div>
              </section>

              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-cyan-400/20 bg-black/40 p-6 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="h-12 rounded-xl border-cyan-500/50 bg-transparent px-6 text-cyan-200 hover:border-cyan-300 hover:bg-cyan-500/10"
                >
                  Réinitialiser
                </Button>
                <Button
                  onClick={handleSave}
                  className="h-12 rounded-xl bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 px-8 text-base font-semibold text-black shadow-[0_0_35px_rgba(34,211,238,0.45)] transition-transform hover:scale-[1.02]"
                >
                  Sauvegarder
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
};

export default Settings;
