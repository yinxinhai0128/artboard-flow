import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  DEFAULT_PROMPT_SOURCES,
  createPromptSource,
  type PromptSource,
} from "@/services/api/prompt-source-presets";

export type PromptSourceSchedule = {
  intervalMinutes: number;
  lastFetchedAt: string;
};

const PROMPT_SOURCE_STORE_KEY = "artboard-flow:prompt_source_store";

const defaultSchedule: PromptSourceSchedule = {
  intervalMinutes: 30,
  lastFetchedAt: "",
};

export const PROMPT_SOURCE_INTERVAL_OPTIONS = [
  { label: "关闭定时", value: 0 },
  { label: "每 30 分钟", value: 30 },
  { label: "每 1 小时", value: 60 },
  { label: "每 6 小时", value: 360 },
  { label: "每 24 小时", value: 1440 },
];

type PromptSourceStore = {
  sources: PromptSource[];
  schedule: PromptSourceSchedule;
  addSource: () => PromptSource;
  saveSource: (source: PromptSource) => void;
  removeSource: (id: string) => void;
  toggleSource: (id: string, enabled: boolean) => void;
  updateSchedule: <K extends keyof PromptSourceSchedule>(
    key: K,
    value: PromptSourceSchedule[K],
  ) => void;
};

export const usePromptSourceStore = create<PromptSourceStore>()(
  persist(
    (set) => ({
      sources: DEFAULT_PROMPT_SOURCES,
      schedule: defaultSchedule,
      addSource: () => {
        const source = createPromptSource();
        set((state) => ({ sources: [...state.sources, source] }));
        return source;
      },
      saveSource: (source) =>
        set((state) => ({
          sources: state.sources.map((item) =>
            item.id === source.id ? source : item,
          ),
        })),
      removeSource: (id) =>
        set((state) => ({
          sources: state.sources.filter((item) => item.id !== id),
        })),
      toggleSource: (id, enabled) =>
        set((state) => ({
          sources: state.sources.map((item) =>
            item.id === id ? { ...item, enabled } : item,
          ),
        })),
      updateSchedule: (key, value) =>
        set((state) => ({ schedule: { ...state.schedule, [key]: value } })),
    }),
    {
      name: PROMPT_SOURCE_STORE_KEY,
      partialize: (state) => ({
        sources: state.sources,
        schedule: state.schedule,
      }),
      merge: (persisted, current) => {
        const persistedState = (persisted || {}) as Partial<PromptSourceStore>;
        const sources =
          Array.isArray(persistedState.sources) && persistedState.sources.length
            ? persistedState.sources.map((item) => createPromptSource(item))
            : DEFAULT_PROMPT_SOURCES;
        return {
          ...current,
          sources,
          schedule: { ...defaultSchedule, ...(persistedState.schedule || {}) },
        };
      },
    },
  ),
);
