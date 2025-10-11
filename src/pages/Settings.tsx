import { useEffect, useMemo, useRef, useState } from "react";
import {
  Palette,
  Volume2,
  Shield,
  Bell,
  Languages,
  Accessibility,
  UserCircle,
  Sparkles,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { useSettingsEffects } from "@/hooks/useSettingsEffects";

type ThemeId = "neon" | "luminous" | "stealth";
type UiSize = "sm" | "md" | "lg";
type ProfileAccent = "cyber" | "aurora" | "ember";
type DigestFrequency = "daily" | "weekly" | "monthly";

type VoltusSettings = {
  theme: ThemeId;
  neonIntensity: number;
  uiSize: UiSize;
  spectralTrails: boolean;
  boardReflections: boolean;
  displayName: string;
  email: string;
  bio: string;
  profileAccent: ProfileAccent;
  avatarGlow: boolean;
  soundEnabled: boolean;
  musicVolume: number;
  effectsVolume: number;
  voiceVolume: number;
  vibration: boolean;
  hapticsIntensity: number;
  highContrast: boolean;
  colorBlindMode: boolean;
  reduceAnimations: boolean;
  largeCoordinates: boolean;
  language: string;
  secondaryLanguage: string;
  autoTranslate: boolean;
  subtitles: boolean;
  pronunciationGuide: boolean;
  gdprMode: boolean;
  visibility: boolean;
  dataSharing: boolean;
  twoFactor: boolean;
  sessionHistory: boolean;
  challengeRequests: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  matchReminders: boolean;
  digestFrequency: DigestFrequency;
  clanInvites: boolean;
  marketingOptIn: boolean;
};

const SETTINGS_STORAGE_KEY = "voltus-settings";

const defaultSettings: VoltusSettings = {
  theme: "neon",
  neonIntensity: 80,
  uiSize: "md",
  spectralTrails: false,
  boardReflections: true,
  displayName: "VoltusMaster",
  email: "player@voltus.gg",
  bio: "Stratège quantique passionné par les variantes les plus audacieuses.",
  profileAccent: "cyber",
  avatarGlow: true,
  soundEnabled: true,
  musicVolume: 65,
  effectsVolume: 75,
  voiceVolume: 45,
  vibration: true,
  hapticsIntensity: 70,
  highContrast: true,
  colorBlindMode: false,
  reduceAnimations: false,
  largeCoordinates: true,
  language: "fr",
  secondaryLanguage: "en",
  autoTranslate: true,
  subtitles: true,
  pronunciationGuide: false,
  gdprMode: true,
  visibility: true,
  dataSharing: false,
  twoFactor: true,
  sessionHistory: true,
  challengeRequests: true,
  emailNotifications: true,
  pushNotifications: true,
  matchReminders: true,
  digestFrequency: "weekly",
  clanInvites: true,
  marketingOptIn: false,
};

const loadPersistedSettings = (): Partial<VoltusSettings> | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<VoltusSettings>) : null;
  } catch (error) {
    console.warn("Impossible de charger les préférences Voltus depuis le stockage local:", error);
    return null;
  }
};

const booleanLabel = (value: boolean) => (value ? "Activé" : "Désactivé");

const languageLabels: Record<string, string> = {
  fr: "Français",
  en: "Anglais",
  es: "Espagnol",
  de: "Allemand",
  it: "Italien",
  jp: "Japonais",
};

const themeLabels: Record<ThemeId, string> = {
  neon: "Néon",
  luminous: "Lumineux",
  stealth: "Sombre",
};

const profileAccentLabels: Record<ProfileAccent, string> = {
  cyber: "Cyber",
  aurora: "Aurora",
  ember: "Ember",
};

const digestLabels: Record<DigestFrequency, string> = {
  daily: "Quotidien",
  weekly: "Hebdomadaire",
  monthly: "Mensuel",
};

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
  const persistedSettingsRef = useRef<VoltusSettings | null>(null);
  if (!persistedSettingsRef.current) {
    const persisted = loadPersistedSettings();
    persistedSettingsRef.current = {
      ...defaultSettings,
      ...(persisted ?? {}),
    };
  }
  const initialSettings = persistedSettingsRef.current ?? defaultSettings;

  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState("appearance");
  const [theme, setTheme] = useState<ThemeId>(initialSettings.theme);
  const [neonIntensity, setNeonIntensity] = useState(initialSettings.neonIntensity);
  const [uiSize, setUiSize] = useState<UiSize>(initialSettings.uiSize);
  const [spectralTrails, setSpectralTrails] = useState(initialSettings.spectralTrails);
  const [boardReflections, setBoardReflections] = useState(initialSettings.boardReflections);

  const [displayName, setDisplayName] = useState(initialSettings.displayName);
  const [email, setEmail] = useState(initialSettings.email);
  const [bio, setBio] = useState(initialSettings.bio);
  const [profileAccent, setProfileAccent] = useState<ProfileAccent>(initialSettings.profileAccent);
  const [avatarGlow, setAvatarGlow] = useState(initialSettings.avatarGlow);

  const [soundEnabled, setSoundEnabled] = useState(initialSettings.soundEnabled);
  const [musicVolume, setMusicVolume] = useState(initialSettings.musicVolume);
  const [effectsVolume, setEffectsVolume] = useState(initialSettings.effectsVolume);
  const [voiceVolume, setVoiceVolume] = useState(initialSettings.voiceVolume);
  const [vibration, setVibration] = useState(initialSettings.vibration);
  const [hapticsIntensity, setHapticsIntensity] = useState(initialSettings.hapticsIntensity);

  const [highContrast, setHighContrast] = useState(initialSettings.highContrast);
  const [colorBlindMode, setColorBlindMode] = useState(initialSettings.colorBlindMode);
  const [reduceAnimations, setReduceAnimations] = useState(initialSettings.reduceAnimations);
  const [largeCoordinates, setLargeCoordinates] = useState(initialSettings.largeCoordinates);

  const [language, setLanguage] = useState(initialSettings.language);
  const [secondaryLanguage, setSecondaryLanguage] = useState(initialSettings.secondaryLanguage);
  const [autoTranslate, setAutoTranslate] = useState(initialSettings.autoTranslate);
  const [subtitles, setSubtitles] = useState(initialSettings.subtitles);
  const [pronunciationGuide, setPronunciationGuide] = useState(initialSettings.pronunciationGuide);

  const [gdprMode, setGdprMode] = useState(initialSettings.gdprMode);
  const [visibility, setVisibility] = useState(initialSettings.visibility);
  const [dataSharing, setDataSharing] = useState(initialSettings.dataSharing);
  const [twoFactor, setTwoFactor] = useState(initialSettings.twoFactor);
  const [sessionHistory, setSessionHistory] = useState(initialSettings.sessionHistory);
  const [challengeRequests, setChallengeRequests] = useState(initialSettings.challengeRequests);

  const [emailNotifications, setEmailNotifications] = useState(initialSettings.emailNotifications);
  const [pushNotifications, setPushNotifications] = useState(initialSettings.pushNotifications);
  const [matchReminders, setMatchReminders] = useState(initialSettings.matchReminders);
  const [digestFrequency, setDigestFrequency] = useState<DigestFrequency>(initialSettings.digestFrequency);
  const [clanInvites, setClanInvites] = useState(initialSettings.clanInvites);
  const [marketingOptIn, setMarketingOptIn] = useState(initialSettings.marketingOptIn);

  const sectionLabels = useMemo(
    () => Object.fromEntries(sidebarSections.map(section => [section.id, section.label.toLowerCase()])),
    [],
  );

  useSettingsEffects({
    theme,
    neonIntensity,
    uiSize,
    spectralTrails,
    boardReflections,
    soundEnabled,
    musicVolume,
    effectsVolume,
    voiceVolume,
    vibration,
    hapticsIntensity,
    highContrast,
    colorBlindMode,
    reduceAnimations,
    largeCoordinates,
    language,
    secondaryLanguage,
    autoTranslate,
    subtitles,
    pronunciationGuide,
  });

  const settingsSnapshot = useMemo<VoltusSettings>(
    () => ({
      theme,
      neonIntensity,
      uiSize,
      spectralTrails,
      boardReflections,
      displayName,
      email,
      bio,
      profileAccent,
      avatarGlow,
      soundEnabled,
      musicVolume,
      effectsVolume,
      voiceVolume,
      vibration,
      hapticsIntensity,
      highContrast,
      colorBlindMode,
      reduceAnimations,
      largeCoordinates,
      language,
      secondaryLanguage,
      autoTranslate,
      subtitles,
      pronunciationGuide,
      gdprMode,
      visibility,
      dataSharing,
      twoFactor,
      sessionHistory,
      challengeRequests,
      emailNotifications,
      pushNotifications,
      matchReminders,
      digestFrequency,
      clanInvites,
      marketingOptIn,
    }),
    [
      theme,
      neonIntensity,
      uiSize,
      spectralTrails,
      boardReflections,
      displayName,
      email,
      bio,
      profileAccent,
      avatarGlow,
      soundEnabled,
      musicVolume,
      effectsVolume,
      voiceVolume,
      vibration,
      hapticsIntensity,
      highContrast,
      colorBlindMode,
      reduceAnimations,
      largeCoordinates,
      language,
      secondaryLanguage,
      autoTranslate,
      subtitles,
      pronunciationGuide,
      gdprMode,
      visibility,
      dataSharing,
      twoFactor,
      sessionHistory,
      challengeRequests,
      emailNotifications,
      pushNotifications,
      matchReminders,
      digestFrequency,
      clanInvites,
      marketingOptIn,
    ],
  );

  useEffect(() => {
    persistedSettingsRef.current = settingsSnapshot;
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsSnapshot));
    } catch (error) {
      console.warn("Impossible de sauvegarder les préférences Voltus:", error);
    }
  }, [settingsSnapshot]);

  const resetActiveSection = () => {
    switch (activeSection) {
      case "profile":
        setDisplayName("VoltusMaster");
        setEmail("player@voltus.gg");
        setBio("Stratège quantique passionné par les variantes les plus audacieuses.");
        setProfileAccent("cyber");
        setAvatarGlow(true);
        break;
      case "appearance":
        setTheme(defaultSettings.theme);
        setNeonIntensity(defaultSettings.neonIntensity);
        setUiSize(defaultSettings.uiSize);
        setSpectralTrails(defaultSettings.spectralTrails);
        setBoardReflections(defaultSettings.boardReflections);
        break;
      case "audio":
        setSoundEnabled(defaultSettings.soundEnabled);
        setMusicVolume(defaultSettings.musicVolume);
        setEffectsVolume(defaultSettings.effectsVolume);
        setVoiceVolume(defaultSettings.voiceVolume);
        setVibration(defaultSettings.vibration);
        setHapticsIntensity(defaultSettings.hapticsIntensity);
        break;
      case "accessibility":
        setHighContrast(defaultSettings.highContrast);
        setColorBlindMode(defaultSettings.colorBlindMode);
        setReduceAnimations(defaultSettings.reduceAnimations);
        setLargeCoordinates(defaultSettings.largeCoordinates);
        break;
      case "language":
        setLanguage(defaultSettings.language);
        setSecondaryLanguage(defaultSettings.secondaryLanguage);
        setAutoTranslate(defaultSettings.autoTranslate);
        setSubtitles(defaultSettings.subtitles);
        setPronunciationGuide(defaultSettings.pronunciationGuide);
        break;
      case "privacy":
        setGdprMode(defaultSettings.gdprMode);
        setVisibility(defaultSettings.visibility);
        setDataSharing(defaultSettings.dataSharing);
        setTwoFactor(defaultSettings.twoFactor);
        setSessionHistory(defaultSettings.sessionHistory);
        setChallengeRequests(defaultSettings.challengeRequests);
        break;
      case "notifications":
        setEmailNotifications(defaultSettings.emailNotifications);
        setPushNotifications(defaultSettings.pushNotifications);
        setMatchReminders(defaultSettings.matchReminders);
        setDigestFrequency(defaultSettings.digestFrequency);
        setClanInvites(defaultSettings.clanInvites);
        setMarketingOptIn(defaultSettings.marketingOptIn);
        break;
      default:
        break;
    }

    toast({
      title: "Paramètres réinitialisés",
      description: `Les préférences ${sectionLabels[activeSection]} ont été restaurées à leurs valeurs par défaut.`,
    });
  };

  const handleSave = () => {
    toast({
      title: "Paramètres sauvegardés",
      description: `Vos préférences ${sectionLabels[activeSection]} ont été mises à jour avec succès.`,
    });
  };

  const sectionSummaries = useMemo(
    () => ({
      profile: [
        { label: "Nom d'affichage", value: displayName },
        { label: "Accent", value: profileAccentLabels[profileAccent] },
        { label: "Lueur avatar", value: booleanLabel(avatarGlow) },
      ],
      appearance: [
        { label: "Thème", value: themeLabels[theme] },
        { label: "Intensité néon", value: `${neonIntensity}%` },
        { label: "Interface", value: uiSize.toUpperCase() },
        { label: "Traînées spectrales", value: booleanLabel(spectralTrails) },
        { label: "Reflets", value: booleanLabel(boardReflections) },
      ],
      audio: [
        { label: "Audio global", value: booleanLabel(soundEnabled) },
        { label: "Musique", value: `${musicVolume}%` },
        { label: "Effets", value: `${effectsVolume}%` },
        { label: "Voix", value: `${voiceVolume}%` },
        { label: "Vibration", value: booleanLabel(vibration) },
      ],
      accessibility: [
        { label: "Contraste élevé", value: booleanLabel(highContrast) },
        { label: "Daltonisme", value: booleanLabel(colorBlindMode) },
        { label: "Animations réduites", value: booleanLabel(reduceAnimations) },
        { label: "Coordonnées", value: booleanLabel(largeCoordinates) },
      ],
      language: [
        { label: "Langue principale", value: languageLabels[language] ?? language.toUpperCase() },
        {
          label: "Langue secondaire",
          value: languageLabels[secondaryLanguage] ?? secondaryLanguage.toUpperCase(),
        },
        { label: "Traduction auto", value: booleanLabel(autoTranslate) },
        { label: "Sous-titres", value: booleanLabel(subtitles) },
        { label: "Prononciation", value: booleanLabel(pronunciationGuide) },
      ],
      privacy: [
        { label: "Mode RGPD", value: booleanLabel(gdprMode) },
        { label: "Profil visible", value: booleanLabel(visibility) },
        { label: "Partage données", value: booleanLabel(dataSharing) },
        { label: "2FA", value: booleanLabel(twoFactor) },
        { label: "Historique", value: booleanLabel(sessionHistory) },
        { label: "Défis", value: booleanLabel(challengeRequests) },
      ],
      notifications: [
        { label: "E-mails", value: booleanLabel(emailNotifications) },
        { label: "Push", value: booleanLabel(pushNotifications) },
        { label: "Rappels", value: booleanLabel(matchReminders) },
        { label: "Digest", value: digestLabels[digestFrequency] },
        { label: "Invitations", value: booleanLabel(clanInvites) },
        { label: "Marketing", value: booleanLabel(marketingOptIn) },
      ],
    }),
    [
      displayName,
      profileAccent,
      avatarGlow,
      theme,
      neonIntensity,
      uiSize,
      spectralTrails,
      boardReflections,
      soundEnabled,
      musicVolume,
      effectsVolume,
      voiceVolume,
      vibration,
      highContrast,
      colorBlindMode,
      reduceAnimations,
      largeCoordinates,
      language,
      secondaryLanguage,
      autoTranslate,
      subtitles,
      pronunciationGuide,
      gdprMode,
      visibility,
      dataSharing,
      twoFactor,
      sessionHistory,
      challengeRequests,
      emailNotifications,
      pushNotifications,
      matchReminders,
      digestFrequency,
      clanInvites,
      marketingOptIn,
    ],
  );

  const sectionMeta = useMemo(
    () => ({
      profile: {
        badge: "Profil",
        title: "Identité Voltus",
        description:
          "Affinez la façon dont les autres stratèges perçoivent votre présence et votre signature lumineuse.",
      },
      appearance: {
        badge: "Apparence",
        title: "Personnalisation néon",
        description:
          "Ajustez l'expérience visuelle pour correspondre à votre style de jeu. Les paramètres sont appliqués instantanément à toutes vos interfaces de Voltus Chess.",
      },
      audio: {
        badge: "Audio & vibration",
        title: "Mixage des sensations",
        description:
          "Calibrez l'ambiance sonore et les retours haptiques pour suivre l'intensité de vos parties.",
      },
      accessibility: {
        badge: "Accessibilité",
        title: "Confort de lecture",
        description:
          "Optimisez la lisibilité et la compréhension des positions complexes sur tous vos appareils.",
      },
      language: {
        badge: "Langue",
        title: "Localisation intelligente",
        description:
          "Choisissez vos langues de référence et laissez Voltus harmoniser vos communications.",
      },
      privacy: {
        badge: "Confidentialité & sécurité",
        title: "Maîtrise des données",
        description:
          "Contrôlez la visibilité de vos performances et protégez l'accès à votre compte.",
      },
      notifications: {
        badge: "Notifications",
        title: "Alertes personnalisées",
        description:
          "Décidez des signaux qui rythment vos entraînements et vos défis en direct.",
      },
    }),
    [],
  );

  const renderSectionContent = () => {
    switch (activeSection) {
      case "profile":
        return (
          <div className="grid gap-8">
            <section className="grid gap-6 rounded-2xl border border-cyan-400/25 bg-black/45 p-6 shadow-inner shadow-cyan-500/10 lg:grid-cols-[3fr_2fr]">
              <div className="space-y-5">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.25em] text-cyan-200/70">Nom d'affichage</Label>
                    <Input
                      value={displayName}
                      onChange={event => setDisplayName(event.target.value)}
                      className="h-12 rounded-xl border-cyan-400/30 bg-black/60 text-base text-white placeholder:text-cyan-100/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.25em] text-cyan-200/70">Adresse de contact</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      className="h-12 rounded-xl border-cyan-400/30 bg-black/60 text-base text-white placeholder:text-cyan-100/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.25em] text-cyan-200/70">Bio stratégique</Label>
                    <Textarea
                      value={bio}
                      onChange={event => setBio(event.target.value)}
                      rows={4}
                      className="rounded-xl border-cyan-400/30 bg-black/60 text-sm text-white placeholder:text-cyan-100/40"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-between gap-6 rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 via-fuchsia-500/10 to-amber-400/10 p-6">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-white">Hologramme</h3>
                  <p className="text-sm text-cyan-100/70">
                    Activez les effets lumineux et choisissez l'ambiance visuelle de votre profil public.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-cyan-400/30 bg-black/50 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Lueur de l'avatar</p>
                      <p className="text-xs text-cyan-100/60">Ajoute un halo animé lors de vos victoires.</p>
                    </div>
                    <Switch checked={avatarGlow} onCheckedChange={setAvatarGlow} />
                  </div>
                  <div className="space-y-3">
                    <Label className="text-xs uppercase tracking-[0.25em] text-cyan-200/70">Accent</Label>
                    <ToggleGroup
                      type="single"
                      value={profileAccent}
                      onValueChange={value => value && setProfileAccent(value as ProfileAccent)}
                      className="flex gap-3"
                    >
                      {(
                        [
                          { id: "cyber", label: "Cyber" },
                          { id: "aurora", label: "Aurora" },
                          { id: "ember", label: "Ember" },
                        ] as const
                      ).map(option => (
                        <ToggleGroupItem
                          key={option.id}
                          value={option.id}
                          className={`flex h-12 flex-1 items-center justify-center rounded-xl border-2 text-sm font-semibold transition-all ${
                            profileAccent === option.id
                              ? "border-cyan-400 bg-cyan-500/10 text-white shadow-[0_0_25px_rgba(34,211,238,0.45)]"
                              : "border-cyan-500/30 text-cyan-100/70 hover:border-cyan-400/80 hover:text-white"
                          }`}
                        >
                          {option.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 rounded-xl border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/10">
                    Mettre à jour l'avatar
                  </Button>
                  <Button className="flex-1 rounded-xl bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 text-black">
                    Modifier la bannière
                  </Button>
                </div>
              </div>
            </section>
          </div>
        );
      case "appearance":
        return (
          <div className="grid gap-10">
            <section className="grid gap-6 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-6 shadow-inner shadow-cyan-500/10 lg:grid-cols-2">
              <div className="space-y-4">
                <Label className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">Thème</Label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      { id: "neon", label: "Néon" },
                      { id: "luminous", label: "Lumineux" },
                      { id: "stealth", label: "Sombre" },
                    ] as const
                  ).map(option => (
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
                    onValueChange={value => value && setUiSize(value as typeof uiSize)}
                    className="flex gap-3"
                  >
                    {(
                      [
                        { id: "sm", label: "SM" },
                        { id: "md", label: "MD" },
                        { id: "lg", label: "LG" },
                      ] as const
                    ).map(option => (
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

            <section className="grid gap-6 rounded-2xl border border-cyan-400/20 bg-black/40 p-6 shadow-inner shadow-cyan-500/10 lg:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Effets visuels dynamiques</h3>
                <p className="text-sm text-cyan-100/70">
                  Renforcez les animations clés et les particules lorsque les pièces se déplacent ou se transforment.
                </p>
                <div className="grid gap-4">
                  <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/50 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Traînées spectrales</p>
                      <p className="text-xs text-cyan-100/60">Ajoute une signature lumineuse aux mouvements rapides.</p>
                    </div>
                    <Switch checked={spectralTrails} onCheckedChange={setSpectralTrails} />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/50 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Reflets de plateau</p>
                      <p className="text-xs text-cyan-100/60">Amplifie la profondeur des cases critiques.</p>
                    </div>
                    <Switch checked={boardReflections} onCheckedChange={setBoardReflections} />
                  </div>
                </div>
              </div>
              <div className="space-y-4 rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 via-fuchsia-500/10 to-amber-400/10 p-6">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-6 w-6 text-cyan-300" />
                  <div>
                    <h4 className="text-sm font-semibold text-white">Prévisualisation instantanée</h4>
                    <p className="text-xs text-cyan-100/60">Testez vos choix sur un plateau miniature en temps réel.</p>
                  </div>
                </div>
                <div className="rounded-xl border border-cyan-400/20 bg-black/50 p-4">
                  <div className="flex items-center justify-between text-xs text-cyan-100/60">
                    <span>Animation</span>
                    <span className="font-semibold text-white">Niveau {Math.round(neonIntensity / 20)}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-cyan-100/60">
                    <span>Contour des pièces</span>
                    <span className="font-semibold text-white">{uiSize.toUpperCase()}</span>
                  </div>
                </div>
                <div className="settings-board-preview">
                  {["A4", "B4", "A3", "B3"].map(code => (
                    <div key={code} className="settings-square">
                      <span className="settings-coordinate">{code}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-100/60">
                  Thème {theme} · Intensité {neonIntensity}%
                </p>
                <Button variant="outline" className="w-full rounded-xl border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/10">
                  Lancer la simulation
                </Button>
              </div>
            </section>
          </div>
        );
      case "audio":
        return (
          <div className="grid gap-8">
            <section className="grid gap-6 rounded-2xl border border-cyan-400/25 bg-black/45 p-6 shadow-inner shadow-cyan-500/10 lg:grid-cols-[2fr_1fr]">
              <div className="space-y-6">
                <div className="flex items-center justify-between rounded-xl border border-cyan-400/25 bg-black/60 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Ambiance sonore</h3>
                    <p className="text-xs text-cyan-100/60">Active la bande-son adaptive Voltus.</p>
                  </div>
                  <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
                </div>
                <div className="grid gap-5">
                  {[
                    {
                      id: "music",
                      label: "Volume musical",
                      value: musicVolume,
                      setter: setMusicVolume,
                      accent: "from-cyan-400 via-sky-400 to-blue-400",
                    },
                    {
                      id: "effects",
                      label: "Effets de jeu",
                      value: effectsVolume,
                      setter: setEffectsVolume,
                      accent: "from-fuchsia-400 via-pink-400 to-rose-400",
                    },
                    {
                      id: "voice",
                      label: "Voix & annonces",
                      value: voiceVolume,
                      setter: setVoiceVolume,
                      accent: "from-amber-400 via-orange-400 to-yellow-400",
                    },
                  ].map(control => (
                    <div key={control.id} className="space-y-3 rounded-2xl border border-cyan-400/20 bg-black/50 p-5">
                      <div className="flex items-center justify-between text-sm text-cyan-100/70">
                        <span>{control.label}</span>
                        <span className="font-semibold text-white">{control.value}%</span>
                      </div>
                      <Slider
                        value={[control.value]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={value => control.setter(value[0])}
                        className="mt-3"
                      />
                      <div className={`h-1 rounded-full bg-gradient-to-r ${control.accent}`} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-5 rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 via-fuchsia-500/10 to-amber-400/10 p-6">
                <div className="space-y-3">
                  <h4 className="text-base font-semibold text-white">Retour haptique</h4>
                  <p className="text-xs text-cyan-100/70">
                    Ajustez l'intensité des vibrations pour sentir chaque capture et chaque promotion décisive.
                  </p>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-cyan-400/25 bg-black/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Vibrations</p>
                    <p className="text-xs text-cyan-100/60">Synchronisées avec les coups importants.</p>
                  </div>
                  <Switch checked={vibration} onCheckedChange={setVibration} />
                </div>
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-[0.25em] text-cyan-200/70">Intensité</Label>
                  <div className="rounded-2xl border border-cyan-400/20 bg-black/50 p-5">
                    <div className="flex items-center justify-between text-xs text-cyan-100/60">
                      <span>Retour</span>
                      <span className="font-semibold text-white">{hapticsIntensity}%</span>
                    </div>
                    <Slider
                      value={[hapticsIntensity]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={value => setHapticsIntensity(value[0])}
                      className="mt-4"
                    />
                  </div>
                </div>
                <Button className="w-full rounded-xl bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 text-black">
                  Tester le mixage
                </Button>
              </div>
            </section>
          </div>
        );
      case "accessibility":
        return (
          <div className="grid gap-8">
            <section className="grid gap-6 rounded-2xl border border-cyan-400/25 bg-black/45 p-6 shadow-inner shadow-cyan-500/10 lg:grid-cols-2">
              <div className="space-y-5">
                <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/50 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Contraste élevé</h3>
                    <p className="text-xs text-cyan-100/60">Optimise les zones critiques pour la lecture rapide.</p>
                  </div>
                  <Switch checked={highContrast} onCheckedChange={setHighContrast} />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/50 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Mode daltonien</h3>
                    <p className="text-xs text-cyan-100/60">Ajuste les couleurs pour une meilleure différenciation.</p>
                  </div>
                  <Switch checked={colorBlindMode} onCheckedChange={setColorBlindMode} />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/50 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Réduire les animations</h3>
                    <p className="text-xs text-cyan-100/60">Limite les effets visuels pour les sessions prolongées.</p>
                  </div>
                  <Switch checked={reduceAnimations} onCheckedChange={setReduceAnimations} />
                </div>
              </div>
              <div className="space-y-5 rounded-2xl border border-cyan-400/25 bg-cyan-500/5 p-6 shadow-inner shadow-cyan-500/10">
                <div className="flex items-center gap-3">
                  <Waves className="h-6 w-6 text-cyan-300" />
                  <div>
                    <h4 className="text-base font-semibold text-white">Guides dynamiques</h4>
                    <p className="text-xs text-cyan-100/60">Affiche des aides à la décision contextuelles.</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Coordonnées XL</p>
                    <p className="text-xs text-cyan-100/60">Agrandit les repères autour du plateau.</p>
                  </div>
                  <Switch checked={largeCoordinates} onCheckedChange={setLargeCoordinates} />
                </div>
                <Button variant="outline" className="w-full rounded-xl border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/10">
                  Aperçu accessibilité
                </Button>
              </div>
            </section>
          </div>
        );
      case "language":
        return (
          <div className="grid gap-8">
            <section className="grid gap-6 rounded-2xl border border-cyan-400/25 bg-black/45 p-6 shadow-inner shadow-cyan-500/10 lg:grid-cols-2">
              <div className="space-y-4">
                <Label className="text-xs uppercase tracking-[0.25em] text-cyan-200/70">Langue principale</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="h-12 rounded-xl border-cyan-400/30 bg-black/60 text-white">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent className="border-cyan-400/20 bg-black/95 text-white">
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="en">Anglais</SelectItem>
                    <SelectItem value="es">Espagnol</SelectItem>
                    <SelectItem value="de">Allemand</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-4">
                <Label className="text-xs uppercase tracking-[0.25em] text-cyan-200/70">Langue secondaire</Label>
                <Select value={secondaryLanguage} onValueChange={setSecondaryLanguage}>
                  <SelectTrigger className="h-12 rounded-xl border-cyan-400/30 bg-black/60 text-white">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent className="border-cyan-400/20 bg-black/95 text-white">
                    <SelectItem value="en">Anglais</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="it">Italien</SelectItem>
                    <SelectItem value="jp">Japonais</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-2xl border border-cyan-400/20 bg-black/50 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Traduction automatique</p>
                    <p className="text-xs text-cyan-100/60">Synchronise les chats et commentaires.</p>
                  </div>
                  <Switch checked={autoTranslate} onCheckedChange={setAutoTranslate} />
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-400/20 bg-black/50 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Sous-titres en direct</p>
                    <p className="text-xs text-cyan-100/60">Affiche les annonces et analyses vocales.</p>
                  </div>
                  <Switch checked={subtitles} onCheckedChange={setSubtitles} />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Guide de prononciation</p>
                    <p className="text-xs text-cyan-100/60">Assistance audio sur les termes complexes.</p>
                  </div>
                  <Switch checked={pronunciationGuide} onCheckedChange={setPronunciationGuide} />
                </div>
              </div>
            </section>
          </div>
        );
      case "privacy":
        return (
          <div className="grid gap-8">
            <section className="grid gap-6 rounded-2xl border border-cyan-400/25 bg-black/45 p-6 shadow-inner shadow-cyan-500/10 lg:grid-cols-2">
              <div className="space-y-5">
                {[
                  {
                    label: "Mode RGPD",
                    description: "Minimise la collecte des données non essentielles.",
                    value: gdprMode,
                    setter: setGdprMode,
                  },
                  {
                    label: "Visibilité du profil",
                    description: "Partagez vos analyses avec la communauté.",
                    value: visibility,
                    setter: setVisibility,
                  },
                  {
                    label: "Partage de données",
                    description: "Contribuez anonymement à l'entraînement des modèles.",
                    value: dataSharing,
                    setter: setDataSharing,
                  },
                ].map(option => (
                  <div
                    key={option.label}
                    className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/50 px-4 py-3"
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-white">{option.label}</h3>
                      <p className="text-xs text-cyan-100/60">{option.description}</p>
                    </div>
                    <Switch checked={option.value} onCheckedChange={option.setter} />
                  </div>
                ))}
              </div>
              <div className="space-y-5 rounded-2xl border border-cyan-400/25 bg-cyan-500/5 p-6 shadow-inner shadow-cyan-500/10">
                <div className="space-y-3">
                  <h4 className="text-base font-semibold text-white">Sécurité renforcée</h4>
                  <p className="text-xs text-cyan-100/70">Empêchez les accès non autorisés à vos analyses privées.</p>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Authentification à deux facteurs</p>
                    <p className="text-xs text-cyan-100/60">Recevez un code lors de chaque connexion sensible.</p>
                  </div>
                  <Switch checked={twoFactor} onCheckedChange={setTwoFactor} />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Historique des sessions</p>
                    <p className="text-xs text-cyan-100/60">Conservez les connexions récentes pour les audits.</p>
                  </div>
                  <Switch checked={sessionHistory} onCheckedChange={setSessionHistory} />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Demandes de défi</p>
                    <p className="text-xs text-cyan-100/60">Approuvez manuellement les invitations inattendues.</p>
                  </div>
                  <Switch checked={challengeRequests} onCheckedChange={setChallengeRequests} />
                </div>
                <Button variant="outline" className="w-full rounded-xl border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/10">
                  Examiner l'activité
                </Button>
              </div>
            </section>
          </div>
        );
      case "notifications":
        return (
          <div className="grid gap-8">
            <section className="grid gap-6 rounded-2xl border border-cyan-400/25 bg-black/45 p-6 shadow-inner shadow-cyan-500/10 lg:grid-cols-[3fr_2fr]">
              <div className="space-y-5">
                {[
                  {
                    label: "Notifications e-mail",
                    description: "Résumés de performance et confirmations importantes.",
                    value: emailNotifications,
                    setter: setEmailNotifications,
                  },
                  {
                    label: "Notifications en direct",
                    description: "Alertes en temps réel pendant vos matchs.",
                    value: pushNotifications,
                    setter: setPushNotifications,
                  },
                  {
                    label: "Rappels de match",
                    description: "Prévenez-vous des rencontres programmées.",
                    value: matchReminders,
                    setter: setMatchReminders,
                  },
                ].map(option => (
                  <div
                    key={option.label}
                    className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/50 px-4 py-3"
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-white">{option.label}</h3>
                      <p className="text-xs text-cyan-100/60">{option.description}</p>
                    </div>
                    <Switch checked={option.value} onCheckedChange={option.setter} />
                  </div>
                ))}
              </div>
              <div className="space-y-5 rounded-2xl border border-cyan-400/25 bg-cyan-500/5 p-6 shadow-inner shadow-cyan-500/10">
                <div className="space-y-3">
                  <h4 className="text-base font-semibold text-white">Digest de la semaine</h4>
                  <p className="text-xs text-cyan-100/70">Choisissez la fréquence des rapports stratégiques.</p>
                </div>
                <ToggleGroup
                  type="single"
                  value={digestFrequency}
                  onValueChange={value => value && setDigestFrequency(value as DigestFrequency)}
                  className="grid gap-2 sm:grid-cols-3"
                >
                  {[
                    { id: "daily", label: "Quotidien" },
                    { id: "weekly", label: "Hebdo" },
                    { id: "monthly", label: "Mensuel" },
                  ].map(option => (
                    <ToggleGroupItem
                      key={option.id}
                      value={option.id}
                      className={`flex h-12 items-center justify-center rounded-xl border-2 text-sm font-semibold transition-all ${
                        digestFrequency === option.id
                          ? "border-cyan-400 bg-cyan-500/10 text-white shadow-[0_0_25px_rgba(34,211,238,0.45)]"
                          : "border-cyan-500/30 text-cyan-100/70 hover:border-cyan-400/80 hover:text-white"
                      }`}
                    >
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Invitations de clan</p>
                    <p className="text-xs text-cyan-100/60">Prévenez-vous lorsqu'un collectif souhaite vous recruter.</p>
                  </div>
                  <Switch checked={clanInvites} onCheckedChange={setClanInvites} />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Offres partenaires</p>
                    <p className="text-xs text-cyan-100/60">Recevez les nouveautés des équipes Voltus.</p>
                  </div>
                  <Switch checked={marketingOptIn} onCheckedChange={setMarketingOptIn} />
                </div>
                <Button variant="outline" className="w-full rounded-xl border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/10">
                  Gérer les canaux
                </Button>
              </div>
            </section>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-6 sm:py-16">
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
                      isActive
                        ? "shadow-[0_0_20px_rgba(6,182,212,0.45)]"
                        : "group-hover:shadow-[0_0_15px_rgba(6,182,212,0.35)]"
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
              <span className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200/70">
                {sectionMeta[activeSection].badge}
              </span>
              <CardTitle className="bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 bg-clip-text text-4xl font-bold text-transparent">
                {sectionMeta[activeSection].title}
              </CardTitle>
              <p className="max-w-xl text-sm text-slate-300/80">{sectionMeta[activeSection].description}</p>
            </CardHeader>
            <CardContent className="relative z-10 grid gap-10 pb-10">
              {renderSectionContent()}
              <div className="rounded-2xl border border-cyan-400/20 bg-black/45 p-6 shadow-inner shadow-cyan-500/10">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/70">
                      Paramètres actifs
                    </p>
                    <p className="text-sm text-slate-300/80">
                      Aperçu instantané des réglages appliqués pour cette section.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {sectionSummaries[activeSection]?.map(item => (
                    <span
                      key={`${item.label}-${item.value}`}
                      className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/80"
                    >
                      <span className="text-cyan-300">{item.label}:</span> {item.value}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-cyan-400/20 bg-black/40 p-6 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={resetActiveSection}
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
