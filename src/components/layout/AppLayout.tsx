import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const navigationLinks = [
  { label: "Accueil", to: "/" },
  { label: "Lobby", to: "/lobby" },
  { label: "Jouer", to: "/play" },
  { label: "Variantes IA", to: "/generator" },
  { label: "Abonnements", to: "/pricing" },
  { label: "Tournois", to: "/tournaments" },
  { label: "Classement", to: "/leaderboard" },
  { label: "Analyse", to: "/analysis" },
  { label: "Paramètres", to: "/settings" },
  { label: "Diagnostics", to: "/diagnostics" },
];

const AppLayout = () => {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const profileDestination = user ? "/profile" : "/signup";
  const profileLabel = user ? "Profil" : "Inscription";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#030516]/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-lg font-semibold tracking-wide text-white"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-500/10 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.45)]">
              ♞
            </span>
            <span className="hidden sm:inline bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 bg-clip-text text-transparent">
              Voltus Chess Architect
            </span>
            <span className="sm:hidden bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 bg-clip-text text-transparent">
              Voltus
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navigationLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-full px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-white/10 text-white shadow-[0_0_15px_rgba(94,234,212,0.35)]"
                      : "text-cyan-100/70 hover:bg-white/5 hover:text-white",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              className="hidden text-sm font-semibold text-cyan-100 hover:text-white md:inline-flex"
            >
              <Link to={profileDestination}>{profileLabel}</Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-cyan-100 hover:text-white md:hidden"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
            >
              {mobileOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
        <div
          className={cn(
            "border-t border-white/10 bg-[#020312]/95 px-4 pb-4 pt-2 shadow-lg transition-all duration-200 md:hidden",
            "overflow-hidden",
            mobileOpen
              ? "visible max-h-[80vh] opacity-100 pointer-events-auto"
              : "invisible max-h-0 opacity-0 pointer-events-none",
          )}
          id="mobile-navigation"
        >
          <nav className="mx-auto flex w-full max-w-6xl flex-col gap-1">
            {navigationLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm font-medium text-white/70 transition-colors",
                    isActive &&
                      "border-cyan-400/60 bg-cyan-500/10 text-white shadow-[0_0_20px_rgba(34,211,238,0.35)]",
                  )
                }
              >
                {link.label}
                <span className="text-xs uppercase tracking-[0.3em] text-white/40">
                  Go
                </span>
              </NavLink>
            ))}
            <Button
              asChild
              variant="ghost"
              className="mt-2 justify-start rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 hover:text-white"
            >
              <Link to={profileDestination}>{profileLabel}</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-white/10 bg-[#020312]/90 py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between sm:text-sm">
          <p>
            © {new Date().getFullYear()} Voltus-Chess. Tous droits réservés.
          </p>
          <div className="flex flex-col items-start gap-1 text-left sm:flex-row sm:items-center sm:gap-3">
            <Link to="/legal" className="hover:text-white">
              Conditions générales & Politique de confidentialité
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AppLayout;
