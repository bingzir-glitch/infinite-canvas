import { sha256JS } from "./sha.js";

function hasSubtle(): boolean {
    try {
        return typeof globalThis.crypto?.subtle?.digest === "function";
    } catch {
        return false;
    }
}

/** http 站点没有 crypto.subtle 时降级为纯 JS 实现（见 ./sha.ts，已逐字节验证）。 */
export async function sha256(bytes: ArrayBuffer) {
    const hash = hasSubtle() ? new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)) : sha256JS(new Uint8Array(bytes));
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const blobDigests = new WeakMap<Blob, Promise<string>>();

export function blobSha256(blob: Blob) {
    const known = blobDigests.get(blob);
    if (known) return known;
    const digest = blob.arrayBuffer().then(sha256);
    blobDigests.set(blob, digest);
    void digest.catch(() => blobDigests.delete(blob));
    return digest;
}
