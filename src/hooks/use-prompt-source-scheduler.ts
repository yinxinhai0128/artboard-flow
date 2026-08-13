import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { refreshAllSources } from "@/services/api/prompts";
import { usePromptSourceStore } from "@/stores/use-prompt-source-store";

const CHECK_INTERVAL_MS = 60_000;

/** Periodically refetch all enabled prompt sources while the app is open, based on the global schedule. */
export function usePromptSourceScheduler() {
    const queryClient = useQueryClient();
    const intervalMinutes = usePromptSourceStore((state) => state.schedule.intervalMinutes);

    useEffect(() => {
        if (!intervalMinutes) return;
        let running = false;
        const tick = async () => {
            if (running) return;
            const { schedule, updateSchedule } = usePromptSourceStore.getState();
            const last = schedule.lastFetchedAt ? new Date(schedule.lastFetchedAt).getTime() : 0;
            if (Date.now() - last < intervalMinutes * 60_000) return;
            running = true;
            try {
                await refreshAllSources();
                updateSchedule("lastFetchedAt", new Date().toISOString());
                await queryClient.invalidateQueries({ queryKey: ["prompts"] });
            } catch {
                // 拉取失败时静默重试，等待下一个检查周期。
            } finally {
                running = false;
            }
        };
        void tick();
        const timer = window.setInterval(() => void tick(), CHECK_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [intervalMinutes, queryClient]);
}
