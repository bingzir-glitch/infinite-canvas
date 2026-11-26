import { StorageError } from "@infinite-canvas/shared/storage-data";

let error: StorageError | null = null;
const listeners = new Set<() => void>();
export function reportStorageError(reason: unknown) {
    error = reason instanceof StorageError ? reason : new StorageError("STORAGE_UNAVAILABLE");
    listeners.forEach((listener) => listener());
}
export function getStorageError() { return error; }
export function subscribeStorageError(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

// 仅会话模式：浏览器拒绝了本地存储，启动时已降级为内存存储。
// 数据全功能可用，但关闭页面即丢失；UI 用它显示常驻提示。
let sessionOnly = false;
const sessionListeners = new Set<() => void>();
export function markSessionOnlyStorage() {
    if (sessionOnly) return;
    sessionOnly = true;
    sessionListeners.forEach((listener) => listener());
}
export function isSessionOnlyStorage() { return sessionOnly; }
export function subscribeSessionOnly(listener: () => void) {
    sessionListeners.add(listener);
    return () => { sessionListeners.delete(listener); };
}
