import { Link } from "react-router-dom";

const Legal = () => {
  const currentYear = new Date().getFullYear();

  return (
    <div className="relative min-h-screen bg-[#020312] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.15),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(244,114,182,0.2),transparent_65%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-12 px-6 py-16">
        <header className="space-y-4 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/70">
            Cadre légal
          </span>
          <h1 className="text-4xl font-bold text-white sm:text-5xl">
            Conditions générales & Politique de confidentialité
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-cyan-100/70 sm:text-base">
            Cette page détaille les engagements de Voltus-Chess en matière
            d&apos;utilisation du service, de protection des données
            personnelles et de respect de la vie privée.
          </p>
        </header>

        <section className="space-y-6 rounded-3xl border border-white/10 bg-black/40 p-8 shadow-[0_0_35px_rgba(34,211,238,0.25)] backdrop-blur-xl">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">
              Conditions générales d&apos;utilisation
            </h2>
            <p className="text-sm text-cyan-100/70">
              Voltus-Chess met à disposition une plateforme
              d&apos;expérimentation et de création de variantes d&apos;échecs
              assistées par l&apos;IA. L&apos;utilisation du service implique
              l&apos;acceptation des règles suivantes : respect des autres
              joueuses et joueurs, conformité avec les lois en vigueur et
              interdiction d&apos;exploiter la plateforme à des fins
              malveillantes. Les comptes peuvent être suspendus en cas
              d&apos;activité frauduleuse, de tentative de contournement de la
              sécurité ou de diffusion de contenus illicites.
            </p>
            <p className="text-sm text-cyan-100/70">
              En créant un compte, vous vous engagez à fournir des informations
              exactes et à conserver la confidentialité de vos identifiants. Les
              fonctionnalités premium ou expérimentales peuvent évoluer au fil
              du temps ; nous préviendrons les utilisatrices et utilisateurs
              concernés avant tout changement majeur ayant un impact sur leur
              abonnement en cours.
            </p>
          </div>
        </section>

        <section className="space-y-6 rounded-3xl border border-white/10 bg-black/40 p-8 shadow-[0_0_35px_rgba(244,114,182,0.25)] backdrop-blur-xl">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">
              Politique de confidentialité
            </h2>
            <p className="text-sm text-cyan-100/70">
              Voltus-Chess collecte uniquement les données nécessaires au
              fonctionnement du service : adresse e-mail, paramètres du compte
              et préférences de jeu. Ces informations sont stockées de manière
              sécurisée et ne sont jamais revendues à des tiers. Nous utilisons
              des cookies techniques pour maintenir votre session active et
              améliorer l&apos;expérience utilisateur ; aucun traqueur
              publicitaire tiers n&apos;est déployé sur la plateforme.
            </p>
            <p className="text-sm text-cyan-100/70">
              Vous pouvez à tout moment demander la suppression de votre compte
              ou l&apos;export de vos données personnelles en nous contactant à{" "}
              <a
                href="mailto:privacy@voltus-chess.ai"
                className="underline decoration-dotted decoration-cyan-300/70"
              >
                privacy@voltus-chess.ai
              </a>
              . Notre équipe répond dans un délai de trente jours. Les
              informations relatives aux tournois publics restent visibles pour
              assurer l&apos;intégrité de la compétition, mais nous anonymisons
              les données sur demande légitime.
            </p>
          </div>
        </section>

        <section className="space-y-4 rounded-3xl border border-white/10 bg-black/40 p-8 text-sm text-cyan-100/70 shadow-[0_0_25px_rgba(34,211,238,0.2)] backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-white">
            Contact et mises à jour
          </h2>
          <p>
            Pour toute question relative à ces informations légales, vous pouvez
            écrire à
            <a
              href="mailto:legal@voltus-chess.ai"
              className="ml-1 underline decoration-dotted decoration-cyan-300/70"
            >
              legal@voltus-chess.ai
            </a>
            . Nous mettrons cette page à jour en cas de modification
            substantielle de nos pratiques.
          </p>
          <p className="text-xs text-white/40">
            Dernière mise à jour : {currentYear}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-cyan-200 hover:text-white"
          >
            Retourner à l&apos;accueil
          </Link>
        </section>
      </div>
    </div>
  );
};

export default Legal;
