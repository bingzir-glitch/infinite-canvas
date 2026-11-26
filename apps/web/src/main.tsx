import { startBrowser } from "@infinite-canvas/workbench/startup/browser";

void startBrowser().then(() => import("./bootstrap")).catch((error) => {
    console.error("[web] startup failed", error);
    const root = document.getElementById("root")!;
    // 启动失败几乎总是本地存储（IndexedDB）被浏览器拒绝：无痕模式、站点数据被阻止、
    // 磁盘配额不足。直接告诉用户去哪里开，比一句"允许保存网站数据"更有用。
    const lines = ["暂时无法打开画布：浏览器拒绝了本地存储，画布数据无处可放。", "请按顺序检查：", "1. 不要用无痕模式打开本站；", "2. Chrome/Edge：设置 → 隐私和安全 → 第三方 Cookie，确保没有阻止本站保存数据（或把本站加到允许名单）；", "3. 确认磁盘还有可用空间，然后点重试。"];
    if (!window.indexedDB) lines.splice(1, 0, "当前浏览器不支持或已禁用 IndexedDB，请换一个现代浏览器。");
    else if (navigator.cookieEnabled === false) lines.splice(1, 0, "检测到 Cookie 被完全阻止，这会连带禁用本地存储，请先放开 Cookie。");
    root.textContent = lines.join("\n");
    root.style.whiteSpace = "pre-line";
    const button = document.createElement("button");
    button.textContent = "重试";
    button.onclick = () => location.reload();
    root.append(button);
});
