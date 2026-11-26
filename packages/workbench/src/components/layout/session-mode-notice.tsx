// 仅会话模式提示：浏览器拒绝了本地存储，应用降级为内存存储。
// 常驻展示在顶栏公告位（AppTopBar 的 notice 槽），并在挂载时弹一次 toast；
// 用户关掉页面数据即丢失，必须让他一直看得见这件事。
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { workbenchMessageOptions } from "@workbench/components/ui/sonner";
import { isSessionOnlyStorage, subscribeSessionOnly } from "@workbench/services/storage/status";

export function SessionModeNotice() {
    const sessionOnly = useSyncExternalStore(subscribeSessionOnly, isSessionOnlyStorage);
    useEffect(() => {
        if (sessionOnly) toast.warning("仅会话模式：浏览器拒绝了本地存储，关闭页面后数据不会保留", { ...workbenchMessageOptions.warning, duration: 10000 });
    }, [sessionOnly]);
    if (!sessionOnly) return null;
    return (
        <span title="浏览器拒绝了本地存储，数据只保存在内存中，关闭页面后不会保留" className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-600 dark:text-amber-400">
            仅会话模式 · 关闭页面后数据不保留
        </span>
    );
}
