// crypto.randomUUID 补齐：该 API 只在安全上下文（HTTPS/localhost）暴露，
// 测试站这类 http://IP 站点上根本不存在，而启动链里大量直接调用
// （存储、插件、日志、MCP clientId 等），缺了它应用在 import 阶段就炸。
// 与其逐个替换调用点（以后还会有人直接写），不如在入口最先补齐。
// getRandomValues 在非安全上下文可用，足以生成 RFC4122 v4。
// 必须在 main.tsx 首行以副作用形式引入，保证在其他业务模块求值前执行。

function randomUUIDFallback(): string {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const cryptoRef = (globalThis as { crypto?: Crypto }).crypto;
if (cryptoRef && typeof cryptoRef.randomUUID !== "function" && typeof cryptoRef.getRandomValues === "function") {
    try {
        Object.defineProperty(cryptoRef, "randomUUID", { value: randomUUIDFallback, writable: true, configurable: true });
    } catch {
        // crypto 对象不可写时不动：调用处自然报错，兜底页会显示原文。
    }
}
