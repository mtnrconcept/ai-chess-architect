import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { requireSupabaseClient } from "@/integrations/supabase/client";

type BillingInterval = "monthly" | "yearly";
type PlanId = "freemium" | "starter" | "pro" | "club";

type Plan = {
  id: PlanId;
  title: string;
  subtitle: string;
  description: string;
  price: Record<
    BillingInterval,
    {
      label: string;
      subLabel: string;
      detail?: string;
    }
  >;
  features: string[];
  actionLabel: string;
  actionType: "signup" | "stripe" | "contact";
  badge?: string;
  icon: string;
  theme: {
    border: string;
    background: string;
    glow: string;
    icon: string;
    accent: string;
    bullet: string;
    button?: string;
  };
};

const STRIPE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
  "pk_test_51SHGJAGwpXEChTPFAyGylqs3WKQZypuOs89SSpKMPR7PZxrLBK0LsQZA1mMAiN0W2vVe8PglUOT5IUj8DLULWQqF00D2oe7206";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

const PLANS: Plan[] = [
  {
    id: "freemium",
    title: "Freemium",
    subtitle: "Découvrez l'IA sans carte de crédit",
    description: "L'essentiel pour tester Voltus Chess Architect avec un coach IA limité mais inspirant.",
    icon: "♟",
    price: {
      monthly: {
        label: "0 CHF",
        subLabel: "par mois",
        detail: "Accès gratuit en continu",
      },
      yearly: {
        label: "0 CHF",
        subLabel: "par an",
        detail: "Toujours gratuit — idéal pour commencer",
      },
    },
    features: [
      "5 parties assistées par l'IA chaque mois",
      "Analyse stratégique de base",
      "Suggestions tactiques légères",
      "Publicité discrète pour soutenir le programme",
    ],
    actionLabel: "Commencer",
    actionType: "signup",
    theme: {
      border: "border-fuchsia-500/50",
      background: "from-fuchsia-600/25 via-purple-700/15 to-transparent",
      glow: "shadow-[0_0_35px_rgba(217,70,239,0.35)]",
      icon: "border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-100",
      accent: "text-fuchsia-200",
      bullet: "bg-fuchsia-300",
      button: "bg-fuchsia-500/80 hover:bg-fuchsia-500 shadow-[0_0_22px_rgba(217,70,239,0.45)]",
    },
  },
  {
    id: "starter",
    title: "Starter",
    subtitle: "Progressez chaque semaine",
    description: "Pour les compétiteurs occasionnels qui veulent des analyses fiables et un suivi dynamique.",
    icon: "♞",
    price: {
      monthly: {
        label: "7 CHF",
        subLabel: "par mois",
        detail: "Facturation mensuelle flexible",
      },
      yearly: {
        label: "70 CHF",
        subLabel: "par an",
        detail: "2 mois offerts (facturation annuelle)",
      },
    },
    features: [
      "30 analyses IA avancées par mois",
      "Puzzles dynamiques adaptés à votre niveau",
      "Suivi de progression personnalisé",
      "Accès prioritaire aux nouvelles variantes IA",
    ],
    actionLabel: "S'abonner",
    actionType: "stripe",
    theme: {
      border: "border-cyan-400/50",
      background: "from-cyan-500/25 via-sky-500/15 to-transparent",
      glow: "shadow-[0_0_35px_rgba(56,189,248,0.45)]",
      icon: "border-cyan-300/60 bg-cyan-400/20 text-cyan-100",
      accent: "text-cyan-200",
      bullet: "bg-cyan-300",
      button: "bg-cyan-500 hover:bg-cyan-400 text-[#03040f] shadow-[0_0_25px_rgba(56,189,248,0.5)]",
    },
  },
  {
    id: "pro",
    title: "Pro",
    subtitle: "Coaching contextuel illimité",
    description: "La boîte à outils complète pour les joueurs ambitieux, clubs élite et créateurs de variantes.",
    icon: "♜",
    price: {
      monthly: {
        label: "19 CHF",
        subLabel: "par mois",
        detail: "Coaching premium sans engagement",
      },
      yearly: {
        label: "190 CHF",
        subLabel: "par an",
        detail: "2 mois offerts + support prioritaire",
      },
    },
    features: [
      "150 analyses IA contextuelles / mois",
      "Coaching temps réel basé sur la partie",
      "Préparation d'ouvertures adaptative",
      "Exports PGN & rapports détaillés illimités",
      "Accès anticipé aux modules expérimental IA",
    ],
    actionLabel: "S'abonner",
    actionType: "stripe",
    badge: "Le plus populaire",
    theme: {
      border: "border-rose-500/50",
      background: "from-rose-600/25 via-pink-600/15 to-transparent",
      glow: "shadow-[0_0_40px_rgba(244,63,94,0.5)]",
      icon: "border-rose-400/60 bg-rose-500/25 text-rose-100",
      accent: "text-rose-200",
      bullet: "bg-rose-300",
      button: "bg-gradient-to-r from-rose-500 via-fuchsia-500 to-purple-500 hover:opacity-95 shadow-[0_0_28px_rgba(244,63,94,0.65)]",
    },
  },
  {
    id: "club",
    title: "Club / Équipe",
    subtitle: "Coaching collaboratif et reporting",
    description: "Pensé pour les clubs, académies et équipes qui veulent un suivi collectif et un support dédié.",
    icon: "🏛",
    price: {
      monthly: {
        label: "79 CHF",
        subLabel: "par mois",
        detail: "Tarif indicatif pour 10 comptes",
      },
      yearly: {
        label: "Sur devis",
        subLabel: "annuel",
        detail: "Contactez-nous pour une offre personnalisée",
      },
    },
    features: [
      "Jusqu'à 10 comptes inclus (packs additionnels)",
      "Statistiques collectives et dashboard coach",
      "Bibliothèque de variantes partagée",
      "Support onboarding dédié & formations trimestrielles",
    ],
    actionLabel: "Nous contacter",
    actionType: "contact",
    theme: {
      border: "border-amber-400/60",
      background: "from-amber-400/25 via-yellow-400/15 to-transparent",
      glow: "shadow-[0_0_38px_rgba(245,158,11,0.45)]",
      icon: "border-amber-300/70 bg-amber-400/20 text-amber-100",
      accent: "text-amber-200",
      bullet: "bg-amber-300",
      button: "bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-400 text-[#2b1500] hover:opacity-95 shadow-[0_0_25px_rgba(245,158,11,0.55)]",
    },
  },
];

const BILLING_OPTIONS: { id: BillingInterval; label: string; helper?: string }[] = [
  { id: "monthly", label: "Mensuel", helper: "Souplesse totale" },
  { id: "yearly", label: "Annuel", helper: "2 mois offerts" },
];

const Pricing = () => {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const status = searchParams.get("status");
    const plan = searchParams.get("plan");
    if (!status) return;

    if (status === "success") {
      toast({
        title: "Merci !",
        description:
          plan === "freemium"
            ? "Votre accès gratuit est actif."
            : "Le paiement Stripe est confirmé. Vous recevrez un e-mail de confirmation dans les prochaines minutes.",
      });
    } else if (status === "cancelled") {
      toast({
        variant: "destructive",
        title: "Paiement annulé",
        description: "Vous pouvez relancer la souscription à tout moment depuis cette page.",
      });
    }

    const next = new URLSearchParams(searchParams);
    next.delete("status");
    next.delete("plan");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  const heroCopy = useMemo(
    () => ({
      title: "Swiss Chess Coach AI",
      kicker: "Plans IA faits pour votre cadence",
      lead:
        "Choisissez l'abonnement qui correspond à votre intensité de jeu. Chaque formule intègre nos moteurs d'analyse augmentés pour accélérer votre progression.",
    }),
    [],
  );

  const handlePlanAction = async (plan: Plan) => {
    if (plan.actionType === "signup") {
      navigate("/signup");
      return;
    }

    if (plan.actionType === "contact") {
      window.open("mailto:team@voltuschess.ai?subject=Demande%20offre%20Club%20Voltus", "_blank", "noopener,noreferrer");
      return;
    }

    setLoadingPlan(plan.id);
    try {
      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error("Impossible d'initialiser Stripe. Vérifiez la clé publique.");
      }

      const supabaseClient = requireSupabaseClient();
      const { data, error } = await supabaseClient.functions.invoke<{
        sessionId?: string;
        url?: string;
        error?: string;
      }>("create-checkout-session", {
        body: {
          planId: plan.id,
          billingInterval,
          successUrl: `${window.location.origin}/pricing?status=success&plan=${plan.id}`,
          cancelUrl: `${window.location.origin}/pricing?status=cancelled&plan=${plan.id}`,
        },
      });

      if (error) {
        throw new Error(error.message ?? "La fonction Stripe a retourné une erreur.");
      }

      if (!data?.sessionId && !data?.url) {
        throw new Error("Session Stripe introuvable. Vérifiez la configuration des prix.");
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      const { error: redirectError } = await stripe.redirectToCheckout({
        sessionId: data.sessionId!,
      });

      if (redirectError) {
        throw new Error(redirectError.message);
      }
    } catch (rawError) {
      const message =
        rawError instanceof Error
          ? rawError.message
          : "Impossible de démarrer la session de paiement Stripe.";

      toast({
        title: "Paiement indisponible",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020312] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.08),_transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(236,72,153,0.1),_transparent_60%)]" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 pb-24 pt-12 sm:px-6 lg:px-8">
        <section className="flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/60">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            {heroCopy.kicker}
          </span>
          <h1 className="mt-6 bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl lg:text-6xl">
            {heroCopy.title}
          </h1>
          <p className="mt-4 max-w-3xl text-base text-white/70 sm:text-lg">
            {heroCopy.lead}
          </p>

          <div className="mt-10 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 shadow-[0_0_25px_rgba(45,212,191,0.1)]">
            {BILLING_OPTIONS.map(option => {
              const isActive = option.id === billingInterval;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setBillingInterval(option.id)}
                  className={cn(
                    "flex min-w-[140px] flex-col items-center rounded-full px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] transition",
                    isActive
                      ? "bg-cyan-500/20 text-white shadow-[0_0_18px_rgba(34,211,238,0.45)]"
                      : "text-white/60 hover:text-white",
                  )}
                >
                  <span>{option.label}</span>
                  {option.helper && <span className="mt-1 text-[10px] font-medium normal-case tracking-normal text-white/60">{option.helper}</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map(plan => {
            const price = plan.price[billingInterval];
            const otherInterval = billingInterval === "monthly" ? "yearly" : "monthly";
            const alternativePrice = plan.price[otherInterval];
            const isLoading = loadingPlan === plan.id;

            return (
              <article
                key={plan.id}
                className={cn(
                  "relative flex h-full flex-col overflow-hidden rounded-3xl border p-8 transition-all duration-200 hover:-translate-y-1 hover:scale-[1.01]",
                  plan.theme.border,
                  plan.theme.glow,
                  "bg-[#07081c]/80",
                  "bg-gradient-to-br",
                  plan.theme.background,
                  "before:absolute before:-inset-0 before:-z-10 before:blur-3xl before:transition-opacity before:duration-300 hover:before:opacity-100",
                )}
              >
                <div className={cn("absolute inset-0 -z-10 opacity-70 blur-3xl transition duration-300")} />

                {plan.badge && (
                  <span className="absolute right-6 top-6 inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/80">
                    {plan.badge}
                  </span>
                )}

                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "flex h-14 w-14 items-center justify-center rounded-2xl border text-3xl font-semibold",
                      plan.theme.icon,
                    )}
                  >
                    {plan.icon}
                  </div>
                  <div className="text-left">
                    <h2 className={cn("text-2xl font-semibold text-white", plan.theme.accent)}>{plan.title}</h2>
                    <p className="text-sm text-white/60">{plan.subtitle}</p>
                  </div>
                </div>

                <p className="mt-6 text-sm text-white/70">{plan.description}</p>

                <div className="mt-6 flex flex-col gap-1">
                  <p className="text-4xl font-semibold text-white">
                    {price.label}
                    <span className="ml-2 text-base font-medium text-white/70">{price.subLabel}</span>
                  </p>
                  {price.detail && <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/45">{price.detail}</p>}
                  {alternativePrice?.detail && (
                    <p className="text-xs text-white/35">
                      {billingInterval === "monthly" ? "Annuel" : "Mensuel"} : {alternativePrice.label} {alternativePrice.subLabel}
                    </p>
                  )}
                </div>

                <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm text-white/80">
                  {plan.features.map(feature => (
                    <li key={feature} className="flex items-start gap-3">
                      <span className={cn("mt-1 inline-block h-2 w-2 rounded-full", plan.theme.bullet)} aria-hidden />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handlePlanAction(plan)}
                  disabled={isLoading}
                  className={cn(
                    "mt-8 w-full rounded-2xl py-3 text-sm font-semibold uppercase tracking-[0.3em]",
                    plan.theme.button,
                  )}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Redirection en cours…
                    </>
                  ) : (
                    plan.actionLabel
                  )}
                </Button>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
};

export default Pricing;
