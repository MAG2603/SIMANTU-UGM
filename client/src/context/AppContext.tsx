import { createContext, useContext, useState, ReactNode } from "react";

interface AppContextType {
  textId: string;
  setTextId: (text: string) => void;
  textEn: string;
  setTextEn: (text: string) => void;
  voice: string;
  setVoice: (voice: string) => void;
  isLangDetected: boolean;
  setIsLangDetected: (detected: boolean) => void;
  isPlaying: boolean;
  playAudio: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [textId, setTextId] = useState("");
  const [textEn, setTextEn] = useState("");
  const [voice, setVoice] = useState("Nova - Friendly");
  const [isLangDetected, setIsLangDetected] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  const playAudio = () => {
    setIsPlaying(true);
    setTimeout(() => setIsPlaying(false), 5000); // Simulate audio playing for 5 seconds
  };

  return (
    <AppContext.Provider 
      value={{ 
        textId, setTextId, 
        textEn, setTextEn, 
        voice, setVoice, 
        isLangDetected, setIsLangDetected, 
        isPlaying, playAudio 
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}
