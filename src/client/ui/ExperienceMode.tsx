import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type ExperienceMode = "simple" | "advanced";

interface ExperienceModeValue {
  mode: ExperienceMode;
  setMode: (mode: ExperienceMode) => void;
}

const ExperienceModeContext = createContext<ExperienceModeValue | null>(null);

export function ExperienceModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ExperienceMode>(() => window.localStorage.getItem("otoflow-experience-mode") === "advanced" ? "advanced" : "simple");

  useEffect(() => {
    window.localStorage.setItem("otoflow-experience-mode", mode);
  }, [mode]);

  const value = useMemo(() => ({ mode, setMode }), [mode]);
  return <ExperienceModeContext.Provider value={value}>{children}</ExperienceModeContext.Provider>;
}

export function useExperienceMode() {
  const context = useContext(ExperienceModeContext);
  if (!context) throw new Error("ExperienceModeProvider bulunamadı.");
  return context;
}
