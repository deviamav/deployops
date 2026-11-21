"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const KEY = "deployops.sidebar.expanded";

type Ctx = {
  expanded: boolean;
  toggle: () => void;
  setExpanded: (v: boolean) => void;
};

const SidebarCtx = createContext<Ctx | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [expanded, setExpandedState] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === "0") setExpandedState(false);
      else if (raw === "1") setExpandedState(true);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const setExpanded = useCallback((v: boolean) => {
    setExpandedState(v);
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => setExpanded(!expanded), [expanded, setExpanded]);

  const value = useMemo(
    () => ({ expanded: ready ? expanded : true, toggle, setExpanded }),
    [expanded, ready, toggle, setExpanded],
  );

  return <SidebarCtx.Provider value={value}>{children}</SidebarCtx.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarCtx);
  if (!ctx) throw new Error("useSidebar outside provider");
  return ctx;
}
