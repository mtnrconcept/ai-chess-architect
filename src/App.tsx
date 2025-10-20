import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/generator" element={<Generator />} />
              <Route path="/lobby" element={<Lobby />} />
              <Route path="/play" element={<Play />} />
              <Route path="/play/:matchId" element={<Play />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/analysis" element={<MatchAnalysis />} />
              <Route path="/tournaments" element={<Tournaments />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/diagnostics" element={<Diagnostics />} />
              <Route path="/legal" element={<Legal />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
