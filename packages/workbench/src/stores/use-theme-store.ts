import type { PluginAppearance } from "@infinite-canvas/plugin-sdk";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "light" | "dark";

type ThemeStore = {
    baseTheme: ThemeName;
    theme: ThemeName;
    appearance: PluginAppearance | null;
    selection: string | null;
    setTheme: (theme: ThemeName) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            baseTheme: "light",
            theme: "light",
            appearance: null,
            selection: null,
            setTheme: (baseTheme) => set({ baseTheme, selection: null }),
        }),
        // version 2：默认值从 dark 改为 light。无 migrate，旧版本缓存会被丢弃、
        // 用上面的 light 初始值重建，正好把之前存下的 dark 默认一起纠正过来。
        { name: "infinite-canvas-v1:theme_store", version: 2, partialize: ({ baseTheme, selection }) => ({ baseTheme, selection }) },
    ),
);
