import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MoodProvider } from "@/contexts/MoodContext";
import { ProgressProvider } from "@/contexts/ProgressContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { NeuralDock } from "@/components/NeuralDock";
import { MoodTransitionOverlay } from "@/components/MoodTransitionOverlay";
import { EmotionPhysics } from "@/components/EmotionPhysics";
import { NeuralProvider } from "@/contexts/NeuralContext";
import { MoodCursor } from "@/components/MoodCursor";
import Index from "./pages/Index";
import CreatePath from "./pages/CreatePath";
import LearningPath from "./pages/LearningPath";
import Progress from "./pages/Progress";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <MoodProvider>
        <ProgressProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <NeuralProvider>
                <MoodCursor />
                <EmotionPhysics />
                <MoodTransitionOverlay />
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/create-path" element={<CreatePath />} />
                  <Route path="/learning-path" element={<LearningPath />} />
                  <Route path="/progress" element={<Progress />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                <NeuralDock />
              </NeuralProvider>
            </BrowserRouter>
          </TooltipProvider>
        </ProgressProvider>
      </MoodProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;


