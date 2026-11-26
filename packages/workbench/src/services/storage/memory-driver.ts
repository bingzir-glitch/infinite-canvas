// 内存存储驱动：localforage 合规的自定义驱动，纯内存 Map 实现。
//
// 用途：浏览器拒绝本地存储（IndexedDB 打不开）时，启动流程降级为「仅会话模式」——
// 应用照常打开、功能全可用，数据只保存在内存里，关闭页面即丢失。这比直接拒绝打开
// 对普通用户友好得多。
//
// 实现要点：方法签名与 localforage typings 里的 LocalForageDriver 逐项一致
// （官方 indexeddb 驱动就是这么写的，这里逐项镜像，官方驱动运行时 resolve null
// 的地方这里也一样：key() 取不到、iterate() 无提前结束）。
// - this 上下文用 WeakMap 存放（不往实例上挂字段，避免与宿主实例属性冲突）：
//   _initStorage 登记，业务方法按 this 取回。
// - 值按 IDB 语义 structuredClone 后存放，避免调用方持有引用后续改动污染已存数据。
// - 键按 IDB 语义比较：字符串原样，其余 JSON 序列化（IDB 的数组键也是按值比较的）。
// - 同名（name/storeName）实例共享同一份 Map，与 IDB 同库同表共享一致；
//   localforage 本身也会缓存实例（见 browser.ts 的 instances），双保险。
import localforage from "localforage";

export const MEMORY_DRIVER = "memoryStorage";

type DbInfo = { name: string; storeName: string };

// 实例上下文：localforage 创建实例时调 _initStorage(this=实例)，业务方法同样以实例
// 为 this 调用，用 WeakMap 关联两者，实例释放后上下文自动回收。
const contexts = new WeakMap<object, DbInfo>();
const stores = new Map<string, Map<string, unknown>>();

function normalizeKey(key: unknown): string {
    return typeof key === "string" ? key : JSON.stringify(key) ?? String(key);
}

function currentStore(self: object): Map<string, unknown> {
    const info = contexts.get(self) ?? { name: "", storeName: "" };
    const key = `${info.name}\n${info.storeName}`;
    let store = stores.get(key);
    if (!store) {
        store = new Map();
        stores.set(key, store);
    }
    return store;
}

// 回调桥接：localforage 驱动按 (err, result) 调用 callback，同时返回 promise。
// 分两个 helper 是为了让参数个数与声明严格对齐，避免 strictFunctionTypes 下的误报。
function fire0(callback: ((err: any) => void) | undefined, promise: Promise<unknown>): void {
    if (callback) promise.then(() => callback(null), (error) => callback(error));
}
function fire1<T>(callback: ((err: any, value: T) => void) | undefined, promise: Promise<T>): void {
    // 拒绝时没有值可传：与官方 executeCallback 一致，只带 error 调用
    //（undefined as T 是类型层面的桥接，运行时就是官方同款的 callback(error)）。
    if (callback) promise.then((value) => callback(null, value), (error) => callback(error, undefined as unknown as T));
}

export const memoryDriver = {
    _driver: MEMORY_DRIVER,
    _support: true,
    _initStorage(this: object, options?: { name?: string; storeName?: string; driver?: string | string[]; size?: number; version?: number; description?: string }): void {
        // 与官方驱动一致：登记库表信息，后续方法都从 this 取回。
        contexts.set(this, { name: options?.name ?? "", storeName: options?.storeName ?? "" });
        currentStore(this);
    },
    getItem<T>(this: object, key: string, callback?: (err: any, value: T | null) => void): Promise<T | null> {
        const promise = Promise.resolve((currentStore(this).get(normalizeKey(key)) ?? null) as T | null);
        fire1(callback, promise);
        return promise;
    },
    setItem<T>(this: object, key: string, value: T, callback?: (err: any, value: T) => void): Promise<T> {
        // structuredClone 抛错语义与 IDB 存入不可克隆值一致（调用方按 STORAGE_INVALID 处理）。
        const stored = structuredClone(value);
        currentStore(this).set(normalizeKey(key), stored);
        const promise = Promise.resolve(value);
        fire1(callback, promise);
        return promise;
    },
    removeItem(this: object, key: string, callback?: (err: any) => void): Promise<void> {
        currentStore(this).delete(normalizeKey(key));
        const promise = Promise.resolve();
        fire0(callback, promise);
        return promise;
    },
    clear(this: object, callback?: (err: any) => void): Promise<void> {
        currentStore(this).clear();
        const promise = Promise.resolve();
        fire0(callback, promise);
        return promise;
    },
    length(this: object, callback?: (err: any, numberOfKeys: number) => void): Promise<number> {
        const promise = Promise.resolve(currentStore(this).size);
        fire1(callback, promise);
        return promise;
    },
    key(this: object, keyIndex: number, callback?: (err: any, key: string) => void): Promise<string> {
        // 声明按官方类型返回 string；取不到时与官方驱动一样 resolve 空值，
        // 仓库内没有按序取键的逻辑，不影响行为。
        const keys = Array.from(currentStore(this).keys());
        const promise = Promise.resolve(keyIndex >= 0 && keyIndex < keys.length ? keys[keyIndex] : "");
        fire1(callback, promise);
        return promise;
    },
    keys(this: object, callback?: (err: any, keys: string[]) => void): Promise<string[]> {
        const promise = Promise.resolve(Array.from(currentStore(this).keys()));
        fire1(callback, promise);
        return promise;
    },
    iterate<T, U>(this: object, iterator: (value: T, key: string, iterationNumber: number) => U, callback?: (err: any, result: U) => void): Promise<U> {
        const promise: Promise<U | undefined> = (async (): Promise<U | undefined> => {
            // 序号从 1 开始、返回非 undefined 即提前结束：与官方 indexeddb 驱动完全一致。
            let index = 1;
            for (const [key, value] of currentStore(this).entries()) {
                const result = await iterator(value as T, key, index);
                index += 1;
                if (result !== undefined) return result;
            }
            return undefined;
        })();
        // 无提前结束时 resolve undefined，与官方驱动运行时一致（声明上是 Promise<U>）。
        const typed = promise as Promise<U>;
        fire1(callback, typed);
        return typed;
    },
    dropInstance(this: object, options?: { name?: string; storeName?: string }, callback?: (err: any) => void): Promise<void> {
        const promise = (async () => {
            if (!options || (!options.name && !options.storeName)) {
                stores.clear();
                return;
            }
            for (const key of Array.from(stores.keys())) {
                const [name, storeName] = key.split("\n");
                if ((options.name === undefined || options.name === name) && (options.storeName === undefined || options.storeName === storeName)) stores.delete(key);
            }
        })();
        fire0(callback, promise);
        return promise;
    },
};

let defined = false;

/** 在所有 openStore 调用之前执行一次：注册内存驱动。 */
export async function ensureMemoryDriver(): Promise<void> {
    if (defined) return;
    // 方法签名按 LocalForageDriver 逐项书写（见本文件各方法），defineDriver 会再做一次运行时契约校验。
    await localforage.defineDriver(memoryDriver);
    defined = true;
}

let activeDriver: string | undefined;

/** 切换为内存驱动：之后所有 openStore 都走内存。 */
export function useMemoryDriver(): void {
    activeDriver = MEMORY_DRIVER;
}

export function isMemoryDriver(): boolean {
    return activeDriver === MEMORY_DRIVER;
}

/** 全仓库统一的 store 入口：平时走 IndexedDB，降级后走内存，无需各处改逻辑。 */
export function openStore(name: string, storeName: string) {
    return localforage.createInstance({ name, storeName, driver: activeDriver ?? localforage.INDEXEDDB });
}
