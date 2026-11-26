import { finishPluginVideoReceipt, ModelExecutionError, storedPluginVideoReceipt, type PluginTaskTarget, type WebPluginVideoReceipt } from "@infinite-canvas/shared/model-http";
import { StorageError } from "@infinite-canvas/shared/storage-data";
import type { VideoTaskIdentity } from "@infinite-canvas/shared/model-execution";
import { sameCanvasVideoRun, type CanvasDocument, type CanvasWebVideoTask } from "@infinite-canvas/shared/canvas/schema/canvas";
import type { StorageCollection } from "@infinite-canvas/shared/storage";
import { appDatabase, openDatabase } from "@workbench/utils/indexed-db";
import { browserStores, pluginVideoTaskStore } from "./browser-stores";

export async function readPluginVideoReceipt(id: string, target: PluginTaskTarget) {
    const db = await openDatabase(appDatabase);
    if (!db) throw new ModelExecutionError("MODEL_TASK_MISSING");
    try {
        if (!db.objectStoreNames.contains(pluginVideoTaskStore)) throw new ModelExecutionError("MODEL_TASK_MISSING");
        const value = await new Promise<unknown>((resolve, reject) => {
            const tx = db.transaction(pluginVideoTaskStore, "readonly");
            const read = tx.objectStore(pluginVideoTaskStore).get(id);
            tx.oncomplete = () => resolve(read.result);
            tx.onabort = () => reject(new StorageError("STORAGE_UNAVAILABLE"));
        });
        return storedPluginVideoReceipt(value, id, target);
    } finally { db.close(); }
}

/** 新受理的任务只创建。完成时比较原远端任务，在同一事务发表结果和原片，迟到的查询复用赢家。 */
export async function savePluginVideoReceipt(next: WebPluginVideoReceipt, previous?: VideoTaskIdentity, blob?: Blob) {
    const receipt = storedPluginVideoReceipt(next, next.id, next.target);
    if (!previous && receipt.state.status !== "pending") throw new ModelExecutionError("MODEL_TASK_CONFLICT");
    const db = await openDatabase(appDatabase);
    if (!db) throw new StorageError("STORAGE_UNAVAILABLE");
    try {
        return await new Promise<WebPluginVideoReceipt>((resolve, reject) => {
            const mediaKey = receipt.state.status === "completed" ? receipt.state.result.storageKey : undefined;
            const tx = db.transaction(mediaKey ? [pluginVideoTaskStore, browserStores.media] : pluginVideoTaskStore, "readwrite");
            const records = tx.objectStore(pluginVideoTaskStore);
            let result = receipt, failure: unknown;
            const fail = (error: unknown) => { failure = error; tx.abort(); };
            tx.oncomplete = () => resolve(result);
            tx.onabort = () => reject(failure ?? new StorageError("STORAGE_UNAVAILABLE"));
            if (!previous) {
                records.add(receipt, receipt.id);
                return;
            }
            const read = records.get(receipt.id);
            read.onsuccess = () => {
                try {
                    result = finishPluginVideoReceipt(read.result, receipt, previous);
                    if (result !== receipt) return;
                    if (mediaKey) {
                        const files = tx.objectStore(browserStores.media);
                        if (blob) files.add(blob, mediaKey);
                        else {
                            const file = files.getKey(mediaKey);
                            file.onsuccess = () => { if (file.result === undefined) fail(new StorageError("STORAGE_INVALID")); };
                        }
                    }
                    records.put(receipt, receipt.id);
                } catch (error) { fail(error); }
            };
        });
    } finally { db.close(); }
}

// ---------------------------------------------------------------------------
// 仅会话模式：内存回执。逻辑与上面原生 IDB 版逐项对应（同一事务语义在单线程
// 内存里天然成立）：proofs 按 ["canvas", projectId, nodeId, runId] 键存放，
// 回执按 receipt.id 存放；原片 Blob 与原生版一样进共享 media 集合，保证播放
// 读取路径不变。
// ---------------------------------------------------------------------------

const memoryReceipts = new Map<string, WebPluginVideoReceipt>();
const memoryProofs = new Map<string, { identity: string; fingerprint: string }>();

function proofKey(key: readonly unknown[]) {
    return JSON.stringify(key);
}

function proofKeyMatches(stored: string, prefix: readonly unknown[]) {
    const full = proofKey(prefix);
    return stored === full || stored.startsWith(`${full.slice(0, -1)},`);
}

/** 镜像 removeCanvasTasks：按 ["canvas"] 或 ["canvas", projectId] 前缀清 proofs。 */
export function removeMemoryVideoTasks(key?: string) {
    const prefix = key === undefined ? (["canvas"] as const) : (["canvas", key] as const);
    for (const stored of Array.from(memoryProofs.keys())) {
        if (proofKeyMatches(stored, prefix)) memoryProofs.delete(stored);
    }
}

export async function readMemoryReceipt(id: string, target: PluginTaskTarget) {
    const value = memoryReceipts.get(id);
    if (value === undefined) throw new ModelExecutionError("MODEL_TASK_MISSING");
    return storedPluginVideoReceipt(value, id, target);
}

export async function saveMemoryReceipt(next: WebPluginVideoReceipt, previous: VideoTaskIdentity | undefined, blob: Blob | undefined, media: Pick<StorageCollection, "getItem" | "setItem">) {
    const receipt = storedPluginVideoReceipt(next, next.id, next.target);
    if (!previous && receipt.state.status !== "pending") throw new ModelExecutionError("MODEL_TASK_CONFLICT");
    if (!previous) {
        // IDB add() 在键已存在时约束冲突 → 事务回滚报 STORAGE_UNAVAILABLE，这里同义。
        if (memoryReceipts.has(receipt.id)) throw new StorageError("STORAGE_UNAVAILABLE");
        memoryReceipts.set(receipt.id, receipt);
        return receipt;
    }
    const result = finishPluginVideoReceipt(memoryReceipts.get(receipt.id), receipt, previous);
    // 迟到的查询复用赢家：不覆写，直接返回已定稿的结果（与原生版 return 语义一致）。
    if (result !== receipt) return result;
    if (receipt.state.status === "completed") {
        // storageKey 缺失属于脏数据：原生版此时传 undefined 给 IDB 同样失败，这里直接报 INVALID。
        const mediaKey = receipt.state.result.storageKey;
        if (!mediaKey) throw new StorageError("STORAGE_INVALID");
        if (blob) await media.setItem(mediaKey, blob);
        else if ((await media.getItem<Blob>(mediaKey)) === null) throw new StorageError("STORAGE_INVALID");
    }
    memoryReceipts.set(receipt.id, receipt);
    return receipt;
}

/** 镜像 canvasVideoConnection 的读证明/写证明逻辑；项目文档改从内存集合读。 */
export async function memoryVideoConnection(
    task: CanvasWebVideoTask,
    identity: string,
    originalFingerprint: string | undefined,
    getProject: (projectId: string) => Promise<CanvasDocument | null>,
) {
    const key = proofKey(["canvas", task.projectId, task.nodeId, task.runId]);
    const write = originalFingerprint !== undefined;
    const proof = memoryProofs.get(key);
    if (proof !== undefined) return proof.identity === identity && typeof proof.fingerprint === "string" && (!write || proof.fingerprint === originalFingerprint) ? proof.fingerprint : null;
    if (!write) return null;
    const doc = await getProject(task.projectId);
    const bound = doc?.nodes.find((node) => node.id === task.nodeId && node.type === "video")?.metadata?.webVideoTask;
    if (!bound || doc?.id !== task.projectId || !sameCanvasVideoRun(bound, task)) return null;
    memoryProofs.set(key, { identity, fingerprint: originalFingerprint });
    return originalFingerprint;
}
