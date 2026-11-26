// 姿态图鉴侧栏 Tab:与节点版共用同一套浏览 UI(PoseAtlasContent),区别只有两处:
// 1. 主题来自宿主外观快照(侧栏没有节点主题),按字段映射成浏览 UI 要的 token;
// 2. 插入落点是视口中心(view.getCenter),而不是某个节点的右侧。
import { useSyncExternalStore } from "react";
import { Images } from "lucide-react";
import type { CanvasSideTabView, PluginContext } from "@infinite-canvas/plugin-sdk";
import { PoseAtlasContent, type PoseAtlasHost, type PoseAtlasTheme } from "./nodes/browser";

// 宿主外观字段 → 浏览 UI token;外观缺失时给一套浅色兜底,保证任何主题不断样式。
const LIGHT_FALLBACK: PoseAtlasTheme = {
    node: { activeStroke: "#1c1917", stroke: "#d6d3ca", text: "#292524", muted: "#78716c", faint: "#a8a29e" },
    toolbar: { activeBg: "#e7e5df", border: "#d6d3ca", panel: "rgba(251,250,247,.96)" },
};

function useSideTabTheme(ctx: PluginContext): PoseAtlasTheme {
    const appearance = useSyncExternalStore(ctx.appearance.subscribe, ctx.appearance.getSnapshot);
    if (!appearance) return LIGHT_FALLBACK;
    return {
        node: { activeStroke: appearance.text, stroke: appearance.border, text: appearance.text, muted: appearance.muted, faint: appearance.muted },
        toolbar: { activeBg: appearance.surface, border: appearance.border, panel: appearance.panel },
    };
}

function PoseAtlasSideContent({ ctx, view }: { ctx: PluginContext; view: CanvasSideTabView }) {
    const theme = useSideTabTheme(ctx);
    const host: PoseAtlasHost = {
        theme,
        getNodes: () => ctx.canvas().getNodes(),
        transact: (ops) => ctx.canvas().transact(ops),
        // 插入行以视口中心为基准居中,超出已有节点时 insertVariants 内会整体下移避让
        place: (width, height) => {
            const center = view.getCenter();
            return { x: center.x - width / 2, y: center.y - height / 2 };
        },
    };
    return <PoseAtlasContent host={host} />;
}

export const poseAtlasTab = {
    id: "pose-atlas:browser-tab",
    value: {
        title: "姿态图鉴",
        icon: <Images size={16} />,
        Content: PoseAtlasSideContent,
    },
};
