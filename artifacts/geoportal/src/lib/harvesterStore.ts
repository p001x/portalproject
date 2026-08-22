import { useState, useEffect } from "react";
import { api } from "@/lib/api";

export interface HarvesterItem {
  id: string;
  name: string;
  url: string;
  category: "raster" | "vector" | "archive" | "tabular" | "stac" | "unknown";
  format: string;
  size_mb?: number | null;
  is_direct: boolean;
  internal_path?: string;
  stac_asset_key?: string;
  feature_count?: number;
  description?: string;
}

export interface ScanResult {
  url: string;
  title: string;
  source_type: string;
  count: number;
  datasets: HarvesterItem[];
}

export interface GeeTaskState {
  taskId: string;
  progress: number;
  status: "in_progress" | "completed" | "failed" | "cancelled" | string;
  message?: string;
  speed_mbps?: number;
  downloaded_mb?: number;
  total_mb?: number;
  asset_id?: string;
  error?: string;
}

interface HarvesterState {
  inputUrl: string;
  scanResult: ScanResult | null;
  activeFilter: string;
  searchQuery: string;
  customClassLabel: string;
  geeTasks: Record<string, GeeTaskState>;
}

const STORAGE_KEY = "geoportal_harvester_store_v1";

function loadInitialState(): HarvesterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        inputUrl: parsed.inputUrl || "",
        scanResult: parsed.scanResult || null,
        activeFilter: parsed.activeFilter || "all",
        searchQuery: parsed.searchQuery || "",
        customClassLabel: parsed.customClassLabel || "Harvested_Class",
        geeTasks: parsed.geeTasks || {},
      };
    }
  } catch {
    // fallback
  }
  return {
    inputUrl: "",
    scanResult: null,
    activeFilter: "all",
    searchQuery: "",
    customClassLabel: "Harvested_Class",
    geeTasks: {},
  };
}

let state: HarvesterState = loadInitialState();
const listeners = new Set<() => void>();
const activePollers = new Map<string, { interval: any; failCount: number }>();

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function notify() {
  persistState();
  listeners.forEach((l) => l());
}

export const harvesterStore = {
  getState: () => state,

  setInputUrl: (url: string) => {
    state = { ...state, inputUrl: url };
    notify();
  },

  setScanResult: (scanResult: ScanResult | null) => {
    state = { ...state, scanResult };
    notify();
  },

  setActiveFilter: (filter: string) => {
    state = { ...state, activeFilter: filter };
    notify();
  },

  setSearchQuery: (q: string) => {
    state = { ...state, searchQuery: q };
    notify();
  },

  setCustomClassLabel: (label: string) => {
    state = { ...state, customClassLabel: label };
    notify();
  },

  setGeeTask: (itemId: string, taskData: GeeTaskState) => {
    state = {
      ...state,
      geeTasks: {
        ...state.geeTasks,
        [itemId]: taskData,
      },
    };
    notify();
  },

  removeGeeTask: async (itemId: string, taskId?: string) => {
    if (activePollers.has(itemId)) {
      clearInterval(activePollers.get(itemId)!.interval);
      activePollers.delete(itemId);
    }
    if (taskId) {
      try {
        await api.harvester.deleteTask(taskId);
      } catch {}
    }
    const nextTasks = { ...state.geeTasks };
    delete nextTasks[itemId];
    state = { ...state, geeTasks: nextTasks };
    notify();
  },

  cancelGeeTask: async (itemId: string, taskId: string) => {
    if (activePollers.has(itemId)) {
      clearInterval(activePollers.get(itemId)!.interval);
      activePollers.delete(itemId);
    }
    try {
      await api.harvester.cancelTask(taskId);
    } catch {}
    const current = state.geeTasks[itemId] || { taskId, progress: 0 };
    state = {
      ...state,
      geeTasks: {
        ...state.geeTasks,
        [itemId]: {
          ...current,
          status: "cancelled",
          message: "Upload stopped by user.",
        },
      },
    };
    notify();
  },

  startPollingGeeTask: (itemId: string, taskId: string, onComplete?: (msg: string) => void, onError?: (err: string) => void) => {
    if (activePollers.has(itemId)) {
      clearInterval(activePollers.get(itemId)!.interval);
    }

    let failCount = 0;
    const interval = setInterval(async () => {
      try {
        const status = await api.harvester.getTaskStatus(taskId);
        failCount = 0;
        const resData = (status.result_data as any) || {};

        harvesterStore.setGeeTask(itemId, {
          taskId,
          progress: status.progress,
          status: status.status,
          message: status.message,
          speed_mbps: resData.speed_mbps,
          downloaded_mb: resData.downloaded_mb,
          total_mb: resData.total_mb,
          asset_id: resData.asset_id,
          error: status.error,
        });

        if (status.status === "completed" || status.status === "failed" || status.status === "cancelled") {
          clearInterval(interval);
          activePollers.delete(itemId);
          if (status.status === "completed" && onComplete) {
            onComplete(status.message || "GEE Ingestion Finished!");
          } else if (status.status === "failed" && onError) {
            onError(status.error || status.message || "Ingestion failed");
          }
        }
      } catch (err: any) {
        failCount++;
        // Retry up to 8 times before marking task as failed to survive momentary network glitches
        if (failCount > 8) {
          clearInterval(interval);
          activePollers.delete(itemId);
          const current = state.geeTasks[itemId];
          if (current && current.status === "in_progress") {
            harvesterStore.setGeeTask(itemId, {
              ...current,
              status: "failed",
              message: "Connection lost with server",
              error: err?.message || "Polling failed",
            });
            if (onError) onError(err?.message || "Server connection lost");
          }
        }
      }
    }, 3500);

    activePollers.set(itemId, { interval, failCount: 0 });
  },

  resumeActiveTasks: () => {
    Object.entries(state.geeTasks).forEach(([itemId, task]) => {
      if (task.status === "in_progress" && task.taskId && !activePollers.has(itemId)) {
        harvesterStore.startPollingGeeTask(itemId, task.taskId);
      }
    });
  },

  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

// Start background resumption on initial import
if (typeof window !== "undefined") {
  harvesterStore.resumeActiveTasks();
}

export function useHarvesterStore() {
  const [snapshot, setSnapshot] = useState<HarvesterState>(harvesterStore.getState());

  useEffect(() => {
    harvesterStore.resumeActiveTasks();
    const unsub = harvesterStore.subscribe(() => {
      setSnapshot(harvesterStore.getState());
    });
    return () => unsub();
  }, []);

  return {
    ...snapshot,
    setInputUrl: harvesterStore.setInputUrl,
    setScanResult: harvesterStore.setScanResult,
    setActiveFilter: harvesterStore.setActiveFilter,
    setSearchQuery: harvesterStore.setSearchQuery,
    setCustomClassLabel: harvesterStore.setCustomClassLabel,
    setGeeTask: harvesterStore.setGeeTask,
    removeGeeTask: harvesterStore.removeGeeTask,
    cancelGeeTask: harvesterStore.cancelGeeTask,
    startPollingGeeTask: harvesterStore.startPollingGeeTask,
  };
}
