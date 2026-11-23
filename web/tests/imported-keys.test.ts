import { afterAll, expect, test } from "bun:test";
import { MAX_IMPORTED_KEYS, parseImportedKeys } from "../src/stores/use-config-store";

// Config and i18n use browser storage during module initialization.
const values = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    },
});
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

function encode(entries: unknown): string {
    const bytes = new TextEncoder().encode(JSON.stringify(entries));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

test("roundtrips console token list including non-ASCII names", () => {
    const raw = encode([
        { n: "first", k: "sk-one" },
        { n: "中文令牌", k: "sk-two" },
    ]);
    expect(parseImportedKeys(raw)).toEqual([
        { name: "first", key: "sk-one" },
        { name: "中文令牌", key: "sk-two" },
    ]);
});

test("rejects garbage without throwing", () => {
    expect(parseImportedKeys(null)).toEqual([]);
    expect(parseImportedKeys("")).toEqual([]);
    expect(parseImportedKeys("!!!not-base64!!!")).toEqual([]);
    expect(parseImportedKeys(encode({ n: "x", k: "sk-x" }))).toEqual([]);
    expect(parseImportedKeys(encode(["sk-x"]))).toEqual([]);
});

test("skips entries without a key and dedupes by key", () => {
    const raw = encode([{ n: "a", k: "" }, { n: "b", k: "sk-b" }, { n: "dup", k: "sk-b" }, { n: "", k: "sk-c" }]);
    expect(parseImportedKeys(raw)).toEqual([
        { name: "b", key: "sk-b" },
        { name: "Token 2", key: "sk-c" },
    ]);
});

test("caps the list at MAX_IMPORTED_KEYS", () => {
    const entries = Array.from({ length: MAX_IMPORTED_KEYS + 2 }, (_, i) => ({ n: `t${i}`, k: `sk-${i}` }));
    expect(parseImportedKeys(encode(entries))).toHaveLength(MAX_IMPORTED_KEYS);
});
