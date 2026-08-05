import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from "react";

// Shared "what's downloading right now" state - one source of truth so the
// nav pill's dot and the Library screen's Downloads tab both reflect the
// same live progress/controls, no matter which screen kicked the download
// off (Search, PasteUrl, batch download, etc).
//
// activeDownloads shape: Map<key, {
//   key, title, progress (0-1), status: "downloading"|"paused",
//   pause, resume, cancel  <- functions registered by whoever started it
// }>

const DownloadsContext = createContext(null);

export function DownloadsProvider({ children }) {
  const [activeDownloads, setActiveDownloads] = useState(() => new Map());
  // Keys the user explicitly cancelled - checked by the download-starting
  // code before it saves a finished file to the library, in case the
  // underlying download promise resolves anyway after being paused/cancelled.
  const cancelledKeysRef = useRef(new Set());

  const startDownload = useCallback((key, meta = {}) => {
    cancelledKeysRef.current.delete(key);
    setActiveDownloads((prev) => {
      const next = new Map(prev);
      next.set(key, {
        key,
        title: meta.title || "Downloading...",
        progress: 0,
        status: "downloading",
        pause: null,
        resume: null,
        cancel: null,
      });
      return next;
    });
  }, []);

  const updateProgress = useCallback((key, progress) => {
    setActiveDownloads((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.set(key, { ...next.get(key), progress });
      return next;
    });
  }, []);

  const setStatus = useCallback((key, status) => {
    setActiveDownloads((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.set(key, { ...next.get(key), status });
      return next;
    });
  }, []);

  // Called by whoever started the download, right after creating the
  // resumable, so Library's pause/resume/cancel buttons have something
  // real to call even though they live in a different mounted screen.
  const registerControls = useCallback((key, controls) => {
    setActiveDownloads((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.set(key, { ...next.get(key), ...controls });
      return next;
    });
  }, []);

  const finishDownload = useCallback((key) => {
    setActiveDownloads((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const pauseDownload = useCallback((key) => {
    setActiveDownloads((prev) => {
      const entry = prev.get(key);
      if (entry?.pause) entry.pause();
      return prev;
    });
    setStatus(key, "paused");
  }, [setStatus]);

  const resumeDownload = useCallback((key) => {
    setStatus(key, "downloading");
    setActiveDownloads((prev) => {
      const entry = prev.get(key);
      if (entry?.resume) entry.resume();
      return prev;
    });
  }, [setStatus]);

  const cancelDownload = useCallback((key) => {
    cancelledKeysRef.current.add(key);
    setActiveDownloads((prev) => {
      const entry = prev.get(key);
      if (entry?.cancel) entry.cancel();
      return prev;
    });
    finishDownload(key);
  }, [finishDownload]);

  const isCancelled = useCallback((key) => cancelledKeysRef.current.has(key), []);

  const hasActiveDownloads = activeDownloads.size > 0;

  const value = useMemo(
    () => ({
      activeDownloads,
      hasActiveDownloads,
      startDownload,
      updateProgress,
      finishDownload,
      registerControls,
      pauseDownload,
      resumeDownload,
      cancelDownload,
      isCancelled,
    }),
    [activeDownloads, hasActiveDownloads, startDownload, updateProgress, finishDownload, registerControls, pauseDownload, resumeDownload, cancelDownload, isCancelled]
  );

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
}

export function useDownloads() {
  const ctx = useContext(DownloadsContext);
  if (!ctx) {
    throw new Error("useDownloads must be used within a DownloadsProvider");
  }
  return ctx;
}
