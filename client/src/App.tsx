import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/context/AppContext";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import LibraryPage, { SchedulerPage, SettingsPage } from "@/pages/SecondaryPages";
import { OpeningAnimation } from "@/components/ui/OpeningAnimation";
import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard}/>
      <Route path="/library" component={LibraryPage}/>
      <Route path="/scheduler" component={SchedulerPage}/>
      <Route path="/settings" component={SettingsPage}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [showOpening, setShowOpening] = useState(true);

  // Use session storage to only show opening once per session
  useEffect(() => {
    const hasSeen = sessionStorage.getItem("simantu_opening_seen");
    if (hasSeen) {
      setShowOpening(false);
    }
  }, []);

  const handleComplete = () => {
    setShowOpening(false);
    sessionStorage.setItem("simantu_opening_seen", "true");
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <TooltipProvider>
          <AnimatePresence>
            {showOpening && <OpeningAnimation onComplete={handleComplete} />}
          </AnimatePresence>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}

export default App;
