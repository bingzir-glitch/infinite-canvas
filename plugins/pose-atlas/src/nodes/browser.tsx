// 姿态图鉴节点:浏览 RuiC-PoseAtlas(HRuiCcc/RuiC-PoseAtlas)的 288 组人体姿态 × 5 视角线稿,
// 支持中/英/日名称、编号、分类搜索,点视角图直接把原图落成画布图片节点,单张或整组五视角。
//
// 素材直接取自上游静态站(data/poses.json + img/ + thumbs/),两处都带 Access-Control-Allow-Origin: *,
// 可跨域取用;jsDelivr 为主源、GitHub Pages 为备源。写入画布的是远端 URL,不占本地存储,
// 断网或上游变更会失效,要长期留存请在节点里下载原图。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Images, Search } from "lucide-react";
import type { CanvasDocumentOp, CanvasNodeContentProps, CanvasNodeContext, CanvasNodeDefinition, CanvasTheme } from "@infinite-canvas/plugin-sdk";

// 浏览 UI 只用到主题里这几个 token;节点用宿主完整主题,侧栏 Tab 用外观快照映射过来。
export type PoseAtlasTheme = {
    node: Pick<CanvasTheme["node"], "activeStroke" | "stroke" | "text" | "muted" | "faint">;
    toolbar: Pick<CanvasTheme["toolbar"], "activeBg" | "border" | "panel">;
};

// 插入画布的抽象宿主:节点版以后续节点位置为锚点,侧栏版以视口中心为锚点。
// 宽高用节点/图片节点的自然宽高结构,transact 透传宿主(节点 ctx 或 canvas())。
export type PoseAtlasHost = {
    theme: PoseAtlasTheme;
    getNodes: () => ReadonlyArray<{ position: { x: number; y: number }; width: number; height: number }>;
    transact: (ops: CanvasDocumentOp[]) => Promise<unknown>;
    /** 给定插入块的宽高,返回行起点(节点版:源节点右侧;侧栏版:视口中心)。 */
    place: (width: number, height: number) => { x: number; y: number };
};

// ---------------------------------------------------------------------------
// 数据源
// ---------------------------------------------------------------------------

// 主源走 jsDelivr,GitHub Pages 兜底;两者资源路径一致。
const MIRRORS = ["https://cdn.jsdelivr.net/gh/HRuiCcc/RuiC-PoseAtlas@main/", "https://hruiccc.github.io/RuiC-PoseAtlas/"];
const LOAD_TIMEOUT_MS = 15000;
const ANGLE_ORDER = ["front", "diagonal", "side", "high", "low"];
const PAGE_SIZE = 48;
// 上游原图固定 900×1200,写入画布时按此比例换算高度
const POSE_IMAGE_WIDTH = 900;
const POSE_IMAGE_HEIGHT = 1200;

type PoseVariant = { angle: string; thumb: string; full: string };
type PoseItem = { id: string; series: string; category: string; no: string; names: Record<string, string>; variants: PoseVariant[] };
type Atlas = {
    angles: { key: string; names: Record<string, string> }[];
    series: { key: string; short: Record<string, string> }[];
    categories: { key: string; names: Record<string, string> }[];
    poses: PoseItem[];
    totals: { poses: number; images: number };
};

// 模块级缓存:多个图鉴节点、节点重挂载都只拉一次
let atlasPromise: Promise<{ atlas: Atlas; base: string }> | undefined;

async function fetchAtlas(base: string) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
    try {
        const response = await fetch(`${base}data/poses.json`, { signal: controller.signal, cache: "force-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as Atlas;
        if (!Array.isArray(data?.poses) || !data.poses.length) throw new Error("数据格式异常");
        return data;
    } finally {
        window.clearTimeout(timer);
    }
}

function loadAtlas() {
    if (!atlasPromise) {
        atlasPromise = (async () => {
            let lastError: unknown;
            for (const base of MIRRORS) {
                try {
                    return { atlas: await fetchAtlas(base), base };
                } catch (error) {
                    lastError = error;
                }
            }
            throw lastError instanceof Error ? lastError : new Error("姿态数据加载失败");
        })().catch((error) => {
            atlasPromise = undefined; // 失败不缓存,下次挂载可重试
            throw error;
        });
    }
    return atlasPromise;
}

// 视角统一按「正面→斜侧→侧面→俯视→仰视」排序:详情页展示与整组插入共用,
// 保证画布上左右排列与界面所见一致。
function sortedVariants(pose: PoseItem) {
    return [...pose.variants].sort((a, b) => ANGLE_ORDER.indexOf(a.angle) - ANGLE_ORDER.indexOf(b.angle));
}

function angleLabel(atlas: Atlas, key: string) {
    return atlas.angles.find((angle) => angle.key === key)?.names.zh || key;
}

// ---------------------------------------------------------------------------
// 落位:在源节点右侧找一块不压住已有节点的区域
// ---------------------------------------------------------------------------

type Rect = { x: number; y: number; width: number; height: number };

function overlaps(a: Rect, b: Rect) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function findFreeY(nodes: readonly { position: { x: number; y: number }; width: number; height: number }[], rect: Rect) {
    let y = rect.y;
    for (let guard = 0; guard < 200; guard += 1) {
        const hit = nodes.find((node) => overlaps({ ...rect, y }, { x: node.position.x, y: node.position.y, width: node.width, height: node.height }));
        if (!hit) break;
        y = hit.position.y + hit.height + 24;
    }
    return y;
}

// 写入画布:variants 为要插入的视角列表,横向排成一行
let nodeSeq = 0;
async function insertVariants(host: PoseAtlasHost, atlas: Atlas, base: string, pose: PoseItem, variants: PoseVariant[]) {
    if (!variants.length) return;
    const gap = 24;
    // 单张给大一点;多张排一行时收窄,避免一条长龙横穿画布
    const width = variants.length > 1 ? 176 : 320;
    const height = Math.round((width * POSE_IMAGE_HEIGHT) / POSE_IMAGE_WIDTH);
    const totalWidth = width * variants.length + gap * (variants.length - 1);
    const origin = host.place(totalWidth, height);
    const x = origin.x;
    const y = findFreeY(host.getNodes(), { x: origin.x, y: origin.y, width: totalWidth, height });
    // 1.0 的 add_node 需要完整节点数据;id 自己生成,避免同一毫秒批量插入撞 id
    const ops = variants.map((variant, index) => {
        nodeSeq += 1;
        return {
            type: "add_node" as const,
            node: {
                id: `pose-atlas-${Date.now()}-${nodeSeq}`,
                type: "image",
                title: pose.names.zh ? `${pose.names.zh} · ${angleLabel(atlas, variant.angle)}` : pose.id,
                position: { x: x + index * (width + gap), y: y },
                width,
                height,
                metadata: {
                    content: `${base}${variant.full}`,
                    status: "success" as const,
                    naturalWidth: POSE_IMAGE_WIDTH,
                    naturalHeight: POSE_IMAGE_HEIGHT,
                    mimeType: "image/png",
                    poseAtlasId: pose.id,
                    poseAtlasAngle: variant.angle,
                },
            },
        };
    });
    await host.transact(ops);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function chipStyle(theme: PoseAtlasTheme, active: boolean) {
    return {
        height: 24,
        padding: "0 10px",
        borderRadius: 999,
        border: `1px solid ${active ? theme.node.activeStroke : theme.node.stroke}`,
        background: active ? theme.toolbar.activeBg : "transparent",
        color: active ? theme.node.text : theme.node.muted,
        fontSize: 11,
        lineHeight: "22px",
        cursor: "pointer",
        whiteSpace: "nowrap" as const,
        flex: "0 0 auto",
    };
}

export function PoseAtlasContent({ host }: { host: PoseAtlasHost }) {
    const theme = host.theme;
    const [atlas, setAtlas] = useState<Atlas | null>(null);
    const [base, setBase] = useState("");
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [series, setSeries] = useState("all");
    const [category, setCategory] = useState("all");
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [flash, setFlash] = useState("");
    const flashTimer = useRef<number | null>(null);

    // 加载数据;失败可点「重试」重新拉取
    const load = useCallback(() => {
        setError("");
        loadAtlas()
            .then((result) => {
                setAtlas(result.atlas);
                setBase(result.base);
            })
            .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(
        () => () => {
            if (flashTimer.current) window.clearTimeout(flashTimer.current);
        },
        [],
    );

    const notify = useCallback((text: string) => {
        setFlash(text);
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlash(""), 1800);
    }, []);

    // 搜索:编号 / 分组 id / 三语名称 / 分类 / 系列 都参与匹配
    const filtered = useMemo(() => {
        if (!atlas) return [];
        const keyword = query.trim().toLowerCase();
        return atlas.poses.filter((pose) => {
            if (series !== "all" && pose.series !== series) return false;
            if (category !== "all" && pose.category !== category) return false;
            if (!keyword) return true;
            return [pose.id, pose.no, pose.category, pose.series, pose.names.zh, pose.names.en, pose.names.ja].join(" ").toLowerCase().includes(keyword);
        });
    }, [atlas, query, series, category]);

    // 条件变化后重置分页,避免停在超出结果数的位置
    useEffect(() => {
        setLimit(PAGE_SIZE);
    }, [query, series, category]);

    const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
    const detail = useMemo(() => (atlas && detailId ? atlas.poses.find((pose) => pose.id === detailId) || null : null), [atlas, detailId]);

    const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

    const handleInsert = useCallback(
        (pose: PoseItem, variants: PoseVariant[]) => {
            if (!atlas || !base) return;
            insertVariants(host, atlas, base, pose, variants)
                .then(() => notify(variants.length > 1 ? `已插入 ${variants.length} 个视角` : "已插入画布"))
                .catch((err) => notify(`插入失败:${err instanceof Error ? err.message : String(err)}`));
        },
        [atlas, base, host, notify],
    );

    // 跨域链接的 <a download> 会被浏览器忽略(只跳转不下载),先取成 blob 再存;
    // 上游带 ACAO *,blob 转换不会被拦。
    const handleDownload = useCallback(
        async (variant: PoseVariant) => {
            const url = `${base}${variant.full}`;
            const filename = variant.full.split("/").pop() || "pose.png";
            try {
                const response = await fetch(url, { cache: "force-cache" });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const objectUrl = URL.createObjectURL(await response.blob());
                const link = document.createElement("a");
                link.href = objectUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                link.remove();
                // 立刻 revoke 会让部分浏览器中断下载,延后释放
                window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
                notify("已开始下载");
            } catch (err) {
                notify(`下载失败:${err instanceof Error ? err.message : String(err)}`);
            }
        },
        [base, notify],
    );

    // 加载 / 失败态
    if (!atlas) {
        return (
            <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: theme.node.muted, fontSize: 12 }}>
                {error ? (
                    <>
                        <span style={{ color: theme.node.text }}>姿态数据加载失败</span>
                        <span style={{ maxWidth: 320, textAlign: "center", lineHeight: 1.6 }}>{error}</span>
                        <button type="button" onMouseDown={stop} onClick={load} style={chipStyle(theme, true)}>
                            重试
                        </button>
                    </>
                ) : (
                    <>
                        <span style={{ width: 26, height: 26, borderRadius: "50%", border: `2px solid ${theme.node.stroke}`, borderTopColor: theme.node.activeStroke, animation: "pose-atlas-spin .8s linear infinite" }} />
                        <span>正在加载姿态图鉴…</span>
                    </>
                )}
            </div>
        );
    }

    return (
        <div
            data-canvas-no-zoom
            style={{ position: "relative", height: "100%", width: "100%", display: "flex", flexDirection: "column", color: theme.node.text, fontSize: 12, overflow: "hidden" }}
        >
            {/* 头部:标题 + 搜索 */}
            <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 8px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flex: "0 0 auto" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>姿态图鉴</span>
                    <span style={{ fontSize: 10, color: theme.node.faint }}>{atlas.totals.poses} 组</span>
                </div>
                <label
                    style={{ flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px", borderRadius: 8, border: `1px solid ${theme.node.stroke}` }}
                >
                    <Search size={13} style={{ color: theme.node.faint, flex: "0 0 auto" }} />
                    <input
                        data-canvas-no-zoom
                        value={query}
                        placeholder="搜索姿态名称 / 编号 / 分类…"
                        onChange={(event) => setQuery(event.target.value)}
                        onMouseDown={stop}
                        onPointerDown={stop}
                        onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Escape") setQuery("");
                        }}
                        style={{ flex: "1 1 auto", minWidth: 0, border: "none", background: "transparent", color: theme.node.text, fontSize: 12, outline: "none" }}
                    />
                </label>
            </div>

            {/* 筛选:系列 chips + 分类下拉 */}
            <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6, padding: "0 12px 8px", overflowX: "auto" }} onWheel={(event) => event.stopPropagation()}>
                <button type="button" onMouseDown={stop} onClick={() => setSeries("all")} style={chipStyle(theme, series === "all")}>
                    全部
                </button>
                {atlas.series.map((item) => (
                    <button key={item.key} type="button" onMouseDown={stop} onClick={() => setSeries(item.key)} style={chipStyle(theme, series === item.key)}>
                        {item.short.zh || item.key}
                    </button>
                ))}
                <select
                    data-canvas-no-zoom
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    onMouseDown={stop}
                    onPointerDown={stop}
                    style={{ marginLeft: "auto", height: 24, maxWidth: 130, borderRadius: 999, border: `1px solid ${theme.node.stroke}`, background: "transparent", color: theme.node.muted, fontSize: 11, padding: "0 6px", outline: "none", flex: "0 0 auto" }}
                >
                    <option value="all">全部分类</option>
                    {atlas.categories.map((item) => (
                        <option key={item.key} value={item.key}>
                            {item.names.zh || item.key}
                        </option>
                    ))}
                </select>
            </div>

            {/* 主体:列表 / 详情 */}
            <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "0 12px 12px" }} onWheel={(event) => event.stopPropagation()}>
                {detail ? (
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <button type="button" onMouseDown={stop} onClick={() => setDetailId(null)} style={chipStyle(theme, false)}>
                                ← 返回
                            </button>
                            <span style={{ fontSize: 12, fontWeight: 600, flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail.names.zh || detail.id}</span>
                            <button type="button" onMouseDown={stop} onClick={() => handleInsert(detail, sortedVariants(detail))} style={chipStyle(theme, true)}>
                                整组插入
                            </button>
                        </div>
                        <div style={{ fontSize: 10, color: theme.node.faint, marginBottom: 8, lineHeight: 1.5 }}>
                            {detail.id} · {detail.category} · {detail.names.en || ""}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
                            {sortedVariants(detail).map((variant) => (
                                <div key={variant.angle} style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: `1px solid ${theme.node.stroke}` }}>
                                    <button
                                        type="button"
                                        title="插入到画布"
                                        onMouseDown={stop}
                                        onClick={() => handleInsert(detail, [variant])}
                                        style={{ display: "block", width: "100%", padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                                    >
                                        <img src={`${base}${variant.thumb}`} alt={variant.angle} loading="lazy" draggable={false} style={{ display: "block", width: "100%", aspectRatio: "3 / 4", objectFit: "cover" }} />
                                        <span style={{ display: "block", padding: "4px 6px", fontSize: 10, color: theme.node.muted, textAlign: "left" }}>{angleLabel(atlas, variant.angle)}</span>
                                    </button>
                                    <button
                                        type="button"
                                        title="下载原图"
                                        onMouseDown={stop}
                                        onClick={() => handleDownload(variant)}
                                        style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, display: "grid", placeItems: "center", borderRadius: 6, border: `1px solid ${theme.toolbar.border}`, background: theme.toolbar.panel, color: theme.node.text, fontSize: 11, cursor: "pointer", padding: 0 }}
                                    >
                                        ↓
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : visible.length === 0 ? (
                    <div style={{ padding: "32px 0", textAlign: "center", color: theme.node.faint }}>没有匹配的姿态</div>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
                        {visible.map((pose) => {
                            // 列表只用正面缩略图,避免一次拉取上千张图
                            const cover = pose.variants.find((variant) => variant.angle === "front") || pose.variants[0];
                            return (
                                <button
                                    key={pose.id}
                                    type="button"
                                    title={`${pose.names.zh || pose.id}(${pose.variants.length} 视角)`}
                                    onMouseDown={stop}
                                    onClick={() => setDetailId(pose.id)}
                                    style={{ padding: 0, border: `1px solid ${theme.node.stroke}`, borderRadius: 10, overflow: "hidden", background: "transparent", cursor: "pointer", textAlign: "left" }}
                                >
                                    <img src={`${base}${cover.thumb}`} alt={pose.id} loading="lazy" draggable={false} style={{ display: "block", width: "100%", aspectRatio: "3 / 4", objectFit: "cover" }} />
                                    <span style={{ display: "block", padding: "4px 6px", fontSize: 10, color: theme.node.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pose.names.zh || pose.no}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {!detail && visible.length < filtered.length ? (
                    <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
                        <button type="button" onMouseDown={stop} onClick={() => setLimit((value) => value + PAGE_SIZE)} style={chipStyle(theme, true)}>
                            加载更多({filtered.length - visible.length})
                        </button>
                    </div>
                ) : null}
            </div>

            {/* 结果计数 + 操作反馈 */}
            <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderTop: `1px solid ${theme.node.stroke}`, fontSize: 10, color: theme.node.faint }}>
                <span>{detail ? "点击视角图插入画布" : `筛选结果 ${filtered.length} 组`}</span>
                {flash ? <span style={{ marginLeft: "auto", color: theme.node.text }}>{flash}</span> : null}
            </div>
        </div>
    );
}

/** 节点版宿主:主题直接用宿主主题,插入行落在源节点右侧。 */
function nodeHost(ctx: CanvasNodeContext): PoseAtlasHost {
    return {
        theme: ctx.theme,
        getNodes: () => ctx.getNodes(),
        transact: (ops) => ctx.transact(ops),
        place: () => ({ x: ctx.node.position.x + ctx.node.width + 96, y: ctx.node.position.y }),
    };
}

export const poseAtlas: CanvasNodeDefinition = {
    type: "pose-atlas:browser",
    title: "姿态图鉴",
    icon: <Images size={16} />,
    description: "288 组人体姿态 × 5 视角参考线稿",
    defaultSize: { width: 560, height: 460 },
    defaultMetadata: {},
    hidePanel: true,
    Content: ({ ctx }: CanvasNodeContentProps) => <PoseAtlasContent host={nodeHost(ctx)} />,
};
