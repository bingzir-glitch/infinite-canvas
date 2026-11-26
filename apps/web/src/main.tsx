// 首行：http 站点没有 crypto.randomUUID，先补齐再加载任何业务模块
// （import 按顺序求值，副作用模块保证最先执行）。
import "@infinite-canvas/workbench/lib/crypto-polyfill";
import { startBrowser } from "@infinite-canvas/workbench/startup/browser";

void startBrowser().then(() => import("./bootstrap")).catch((error) => {
    console.error("[web] startup failed", error);
    const root = document.getElementById("root")!;
    // 能到这里说明连内存兜底都没救回来（通常是启动链里的非存储 bug，
    // 存储被禁的情况早已降级为仅会话模式继续跑了）。把错误原文打出来，
    // 用户截图发过来就能直接定位，不用来回问。
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const lines = ["暂时无法打开画布，且连仅会话模式都进不去，这一般是程序问题而非浏览器设置问题。", `错误信息：${detail}`, "可以先点重试；如果反复出现，请把这段文字截图发给我们。"];
    root.textContent = lines.join("\n");
    root.style.whiteSpace = "pre-line";
    const button = document.createElement("button");
    button.textContent = "重试";
    button.onclick = () => location.reload();
    root.append(button);
});
