import React, { createContext, useContext, useState, ReactNode } from "react";

interface AppContextType {
  text: string;
  setText: (text: string) => void;
  voice: string;
  setVoice: (voice: string) => void;
  isLangDetected: boolean;
  setIsLangDetected: (val: boolean) => void;
  isPlaying: boolean;
  playAudio: () => void;
  stopAudio: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("Nova - Friendly");
  const [isLangDetected, setIsLangDetected] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  const playAudio = () => {
    if (!text.trim()) return;
    setIsPlaying(true);
    // Mock audio playing duration (e.g., 3 seconds)
    setTimeout(() => {
      setIsPlaying(false);
    }, 3000);
  };

  const stopAudio = () => {
    setIsPlaying(false);
  };

  return (
    <AppContext.Provider
      value={{
        text,
        setText,
        voice,
        setVoice,
        isLangDetected,
        setIsLangDetected,
        isPlaying,
        playAudio,
        stopAudio,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}
