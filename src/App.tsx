import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import Index from "./pages/Index";
import Generator from "./pages/Generator";
import Lobby from "./pages/Lobby";
import Play from "./pages/Play";
import NotFound from "./pages/NotFound";
import SignUp from "./pages/SignUp";
import Profile from "./pages/Profile";
import Leaderboard from "./pages/Leaderboard";
import Settings from "./pages/Settings";
import MatchAnalysis from "./pages/MatchAnalysis";
import Tournaments from "./pages/Tournaments";
import Pricing from "./pages/Pricing";
import Diagnostics from "./pages/Diagnostics";
import Legal from "./pages/Legal";
import { AuthProvider } from "./contexts/AuthContext";

const queryClient = new QueryClient();

const router = createBrowserRouter(
  [
    {
      element: <AppLayout />,
      children: [
        { path: "/", element: <Index /> },
        { path: "/generator", element: <Generator /> },
        { path: "/lobby", element: <Lobby /> },
        { path: "/play", element: <Play /> },
        { path: "/play/:matchId", element: <Play /> },
        { path: "/leaderboard", element: <Leaderboard /> },
        { path: "/signup", element: <SignUp /> },
        { path: "/profile", element: <Profile /> },
        { path: "/settings", element: <Settings /> },
        { path: "/analysis", element: <MatchAnalysis /> },
        { path: "/tournaments", element: <Tournaments /> },
        { path: "/pricing", element: <Pricing /> },
        { path: "/diagnostics", element: <Diagnostics /> },
        { path: "/legal", element: <Legal /> },
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
  {
    future: {
      v7_relativeSplatPath: true,
    },
  },
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <RouterProvider router={router} />
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
