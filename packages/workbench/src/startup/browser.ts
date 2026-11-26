import { initializePlugins } from "../services/plugins/runtime";
import { createBrowserStorage } from "../services/storage/browser";
import { prepareBrowserStorage } from "../services/storage/browser-stores";
import { ensureMemoryDriver, useMemoryDriver } from "../services/storage/memory-driver";
import { initializeStorage } from "../services/storage/runtime";
import { markSessionOnlyStorage } from "../services/storage/status";
import { StorageError } from "@infinite-canvas/shared/storage-data";
import { initializeChannels } from "../services/channels/runtime";
import { initializeModels } from "../services/api/models/runtime";
import { initializeNetwork } from "../services/network/runtime";
import { initializeWorkspaceConfig } from "../services/workspace-config/runtime";
import { createBrowserWorkspaceConfig } from "../services/workspace-config/browser";
import { loadWorkspaceConfig } from "../stores/use-workspace-config-store";
import { initializeStorageInspection } from "../services/storage-inspection/runtime";
import { createBrowserStorageInspection } from "../services/storage-inspection/browser";

export async function startBrowser() {
    try {
        await prepareBrowserStorage();
    } catch (error) {
        // 存储不可用（IndexedDB 被禁/无痕模式/配额耗尽）时不直接拒绝打开：
        // 降级为内存存储，应用全功能可用，仅关闭页面后数据不保留。
        // prepareBrowserStorage 只碰 IndexedDB，能抛出来的只会是存储类错误
        // （含 API 缺失时的 ReferenceError/TypeError）；其他未知错误继续上抛，
        // 走 main.tsx 的兜底错误页，避免把真正的 bug 藏进会话模式。
        if (!(error instanceof StorageError) && !(error instanceof ReferenceError) && !(error instanceof TypeError)) throw error;
        await ensureMemoryDriver();
        useMemoryDriver();
        markSessionOnlyStorage();
    }
    const storage = createBrowserStorage();
    initializeStorage(storage);
    initializeStorageInspection(createBrowserStorageInspection());
    initializeWorkspaceConfig(createBrowserWorkspaceConfig());
    await loadWorkspaceConfig();
    const { createBrowserNetwork } = await import("../services/network/browser");
    initializeNetwork(createBrowserNetwork());
    // 模型脚本库在导入时读取存储，必须等存储初始化后再加载。
    const { createBrowserModels } = await import("../services/api/models/browser");
    const { createBrowserChannels } = await import("../services/channels/browser");
    initializeChannels(createBrowserChannels());
    const { loadChannelConfig } = await import("../stores/use-config-store");
    await loadChannelConfig();
    initializeModels(createBrowserModels());
    const { createBrowserPlugins } = await import("../services/plugins/browser");
    initializePlugins(createBrowserPlugins());
}
