// 服装模特图鉴节点:浏览 nvzhuang(paipiange/nvzhuang,MIT)的 4200+ 张 AI 服装与模特参考,
// 分写实服装 / 动漫服装 / AI 模特三库,支持中/英文关键词、编号、分类搜索,
// 点图把展示图落成画布图片节点,单张或整页批量。
//
// 数据清单随插件内置(data/*.json,构建时打进包,不断网可读);图片走同站 /nvzhuang/
// 镜像优先,jsDelivr 与 GitHub Pages 按上游 assets/ 路径回退(与镜像同构,无需改路径)。
// 写实库中文关键词取自 ai-ref-library-cn 的整理(仅文本,不涉图片分发)。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageOff, Images, Search } from "lucide-react";
import type { CanvasDocumentOp, CanvasNodeContentProps, CanvasNodeContext, CanvasNodeDefinition, CanvasTheme } from "@infinite-canvas/plugin-sdk";
import realData from "../../data/real.json";
import animeData from "../../data/anime.json";
import portraitData from "../../data/portrait.json";

// 浏览 UI 只用到主题里这几个 token;节点用宿主完整主题,侧栏 Tab 用外观快照映射过来。
export type CostumeAtlasTheme = {
    node: Pick<CanvasTheme["node"], "activeStroke" | "stroke" | "text" | "muted" | "faint">;
    toolbar: Pick<CanvasTheme["toolbar"], "activeBg" | "border" | "panel">;
};

// 插入画布的抽象宿主:节点版以后续节点位置为锚点,侧栏版以视口中心为锚点。
// 宽高用存下来的图片自然宽高结构,transact 透传宿主(节点 ctx 或 canvas())。
// images.store 把远端原图存进本地图片库并返回 storageKey——1.0 的图片节点
// 只认 storageKey 渲染（无 key 只显示占位图标）,所以插入前必须先存本地。
export type StoredPoseImage = { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string };
export type CostumeAtlasHost = {
    theme: CostumeAtlasTheme;
    getNodes: () => ReadonlyArray<{ position: { x: number; y: number }; width: number; height: number }>;
    transact: (ops: CanvasDocumentOp[]) => Promise<unknown>;
    storeImage: (file: Blob, signal: AbortSignal) => Promise<StoredPoseImage>;
    /** 给定插入块的宽高,返回行起点(节点版:源节点右侧;侧栏版:视口中心)。 */
    place: (width: number, height: number) => { x: number; y: number };
};

// ---------------------------------------------------------------------------
// 数据源
// ---------------------------------------------------------------------------

// 图片源:同站镜像优先(部署站自带 /nvzhuang/ 时零跨域、最快),
// 上游 CDN 按相同 assets/ 路径回退。数据清单内置,不走网络。
const MIRRORS = ["https://cdn.jsdelivr.net/gh/paipiange/nvzhuang@main/", "https://paipiange.github.io/nvzhuang/"];
// 注意 data/*.json 里存的是与上游同构的相对路径(assets/...),换 base 即换源,无需改数据。
function localMirrorBase(): string[] {
    try {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        return origin ? [`${origin.replace(/\/+$/, "")}/nvzhuang/`] : [];
    } catch {
        return [];
    }
}
const PAGE_SIZE = 48;

type CostumeItem = { id: string; cat: string; kw: string[]; zh: string[]; thumb: string; full: string; hires: string | null };
type CostumeLib = { key: string; title: string; items: CostumeItem[] };

const LIBS: CostumeLib[] = [
    { key: "real", title: "写实服装", items: realData.items as CostumeItem[] },
    { key: "anime", title: "动漫服装", items: animeData.items as CostumeItem[] },
    { key: "portrait", title: "AI模特", items: portraitData.items as CostumeItem[] },
];

// 可用的源按顺序试：先用上次成功的（粘住，避免每次都撞墙），
// 再试同站镜像，最后两个 CDN。每次成功都更新粘住的源，源挂了自动漂移。
let workingBase: string | null = null;
function baseList(): string[] {
    const rest = [...localMirrorBase(), ...MIRRORS].filter((b) => b !== workingBase);
    return workingBase ? [workingBase, ...rest] : rest;
}

// 单张图片的多源拉取：按 baseList 顺序逐个试，拿回第一个 OK 的。
// 縮略图展示走下面的 MirrorImg 组件（同策略）。
// 403 这类“看起来像成功但实际是错的”按失败处理，继续试下一个源。
async function fetchImageWithFallback(relative: string, signal?: AbortSignal): Promise<{ blob: Blob; url: string }> {
    let lastError: unknown;
    for (const base of baseList()) {
        if (signal?.aborted) throw new Error("已取消");
        try {
            const response = await fetch(`${base}${relative}`, { cache: "force-cache", signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            // 空包/错误页经常只有几百字节，原图不可能这么小，直接判失败换源
            if (blob.size < 1024) throw new Error("内容过小，疑似错误页");
            workingBase = base; // 粘住这次成功的源
            return { blob, url: `${base}${relative}` };
        } catch (error) {
            if (signal?.aborted) throw error;
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error("图片下载失败");
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

// 展示图拉取 + 存本地的去重缓存:详情页打开时预取,点插入时直接复用,
// 同一张图一次会话只下载一次。失败不缓存,下次插入时重试。
// 入参是相对路径,源按 baseList 顺序自动切换。
const storedCache = new Map<string, Promise<{ stored: StoredPoseImage; url: string }>>();
function ensureStoredImage(host: CostumeAtlasHost, relative: string, signal: AbortSignal) {
    let pending = storedCache.get(relative);
    if (!pending) {
        pending = (async () => {
            const { blob, url } = await fetchImageWithFallback(relative, signal);
            const stored = await host.storeImage(blob, signal);
            return { stored, url };
        })().catch((error) => {
            storedCache.delete(relative);
            throw error;
        });
        storedCache.set(relative, pending);
    }
    return pending;
}

// 写入画布:先把展示图存进本地图片库（拿 storageKey,1.0 图片节点渲染与
// 参考都认这个）,再横向排成一行插入。单张给大一点,多张排一行时收窄,
// 避免一条长龙横穿画布。
let nodeSeq = 0;
async function insertItems(host: CostumeAtlasHost, lib: CostumeLib, items: CostumeItem[], signal: AbortSignal) {
    if (!items.length) return;
    // 展示图逐张存本地（源自动切换，见 fetchImageWithFallback）；任一张失败就整批报错
    //（notify 会提示，不会落下半截节点）。实际落盘地址取回退链命中的源。
    const stored = await Promise.all(items.map((item) => ensureStoredImage(host, item.full, signal)));
    const gap = 24;
    const width = items.length > 1 ? 176 : 320;
    // 用存下来的真实尺寸换算显示高度,取实测值更稳
    const ratio = stored[0].stored.height / Math.max(1, stored[0].stored.width);
    const height = Math.round(width * ratio);
    const totalWidth = width * items.length + gap * (items.length - 1);
    const origin = host.place(totalWidth, height);
    const x = origin.x;
    const y = findFreeY(host.getNodes(), { x: origin.x, y: origin.y, width: totalWidth, height });
    // 1.0 的 add_node 需要完整节点数据;id 自己生成,避免同一毫秒批量插入撞 id
    const ops = items.map((item, index) => {
        nodeSeq += 1;
        const image = stored[index];
        return {
            type: "add_node" as const,
            node: {
                id: `costume-atlas-${Date.now()}-${nodeSeq}`,
                type: "image",
                title: `${lib.title} · ${item.id}`,
                position: { x: x + index * (width + gap), y },
                width,
                height,
                metadata: {
                    content: image.url,
                    storageKey: image.stored.storageKey,
                    status: "success" as const,
                    naturalWidth: image.stored.width,
                    naturalHeight: image.stored.height,
                    mimeType: image.stored.mimeType || "image/webp",
                    bytes: image.stored.bytes,
                    costumeAtlasId: item.id,
                    costumeAtlasLib: lib.key,
                },
            },
        };
    });
    await host.transact(ops);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function chipStyle(theme: CostumeAtlasTheme, active: boolean) {
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

// 多源图片:按 baseList() 顺序逐个源试,坏一个自动换下一个,全挂才显示
// 可点击重试的占位（lucide 图标 + 主题色,不用 emoji/硬编码颜色）。
// rel 是数据里的相对路径,与源解耦——哪个源活着就从哪拿。
// sources 每次渲染现算、不 memo 快照 workingBase:源漂移后展示顺序自动
// 跟上,顺序不变时算出的首个 URL 不变,不会引起重复加载。
// 已知局限:<img onError> 只能捕获非 2xx,源返回 200 配错误小包时这里
// 拦不住（插入链有 blob.size < 1024 兜底,展示层接受该局限）。
function MirrorImg({ rel, alt, style, theme }: { rel: string; alt?: string; style?: React.CSSProperties; theme: CostumeAtlasTheme }) {
    const [sourceIndex, setSourceIndex] = useState(0);
    const sources = baseList().map((base) => `${base}${rel}`);
    // rel 变化时从头试起
    useEffect(() => {
        setSourceIndex(0);
    }, [rel]);
    if (sourceIndex >= sources.length) {
        return (
            <button
                type="button"
                title="图片加载失败，点击重试"
                onClick={(event) => {
                    event.stopPropagation();
                    setSourceIndex(0);
                }}
                style={{ display: "grid", placeItems: "center", width: "100%", aspectRatio: "3 / 4", border: "none", background: "transparent", cursor: "pointer", color: theme.node.faint }}
            >
                <ImageOff size={20} />
            </button>
        );
    }
    return <img src={sources[sourceIndex]} alt={alt} loading="lazy" draggable={false} onError={() => setSourceIndex((index) => index + 1)} style={style} />;
}

export function CostumeAtlasContent({ host }: { host: CostumeAtlasHost }) {
    const theme = host.theme;
    const [libKey, setLibKey] = useState("real");
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("all");
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [flash, setFlash] = useState("");
    const flashTimer = useRef<number | null>(null);

    const lib = useMemo(() => LIBS.find((item) => item.key === libKey) || LIBS[0], [libKey]);

    // 分类按首次出现顺序排,三个库各自独立(写实/动漫是季节,模特是发型)
    const categories = useMemo(() => {
        const seen: string[] = [];
        for (const item of lib.items) {
            if (!seen.includes(item.cat)) seen.push(item.cat);
        }
        return seen;
    }, [lib]);

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

    // 搜索:编号 / 分类 / 英文关键词 / 中文关键词 都参与匹配
    const filtered = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        return lib.items.filter((item) => {
            if (category !== "all" && item.cat !== category) return false;
            if (!keyword) return true;
            return [item.id, item.cat, ...item.kw, ...item.zh].join(" ").toLowerCase().includes(keyword);
        });
    }, [lib, query, category]);

    // 条件变化后重置分页与详情,避免停在超出结果数的位置
    useEffect(() => {
        setLimit(PAGE_SIZE);
        setDetailId(null);
    }, [libKey, query, category]);

    const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
    const detail = useMemo(() => (detailId ? lib.items.find((item) => item.id === detailId) || null : null), [lib, detailId]);

    const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

    // host 对象每次渲染都可能是新的（wrapper 里现拼的）,effect 里只用 ref,
    // 避免父组件重渲染导致预取被反复 abort。
    const hostRef = useRef(host);
    hostRef.current = host;

    // 组件卸载时中断未完成的拉取/入库,避免setState到已卸载组件。
    const abortRef = useRef<AbortController | null>(null);
    useEffect(
        () => () => {
            abortRef.current?.abort();
        },
        [],
    );

    // 打开详情就把展示图在后台拉到本地:点插入时直接用缓存,
    // 不用再等下载;失败也不报错,插入时会自动重试。
    // 传相对路径走多源回退链（不要拼 base,否则源挂了无法切换）。
    const libRef = useRef(lib);
    libRef.current = lib;
    useEffect(() => {
        if (!detail) return;
        const controller = new AbortController();
        const hostNow = hostRef.current;
        void ensureStoredImage(hostNow, detail.full, controller.signal).catch(() => {});
        return () => controller.abort();
    }, [detail]);

    const handleInsert = useCallback(
        (items: CostumeItem[]) => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            notify(items.length > 1 ? "正在存入本地并插入…" : "正在存入本地…");
            insertItems(host, libRef.current, items, controller.signal)
                .then(() => notify(items.length > 1 ? `已插入 ${items.length} 张` : "已插入画布"))
                .catch((err) => {
                    if (controller.signal.aborted) return;
                    notify(`插入失败:${err instanceof Error ? err.message : String(err)}`);
                });
        },
        [host, notify],
    );

    return (
        <div
            data-canvas-no-zoom
            style={{ position: "relative", height: "100%", width: "100%", display: "flex", flexDirection: "column", color: theme.node.text, fontSize: 12, overflow: "hidden" }}
        >
            {/* 头部:标题 + 搜索 */}
            <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 8px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flex: "0 0 auto" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>服装模特图鉴</span>
                    <span style={{ fontSize: 10, color: theme.node.faint }}>{lib.items.length} 张</span>
                </div>
                <label
                    style={{ flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px", borderRadius: 8, border: `1px solid ${theme.node.stroke}` }}
                >
                    <Search size={13} style={{ color: theme.node.faint, flex: "0 0 auto" }} />
                    <input
                        data-canvas-no-zoom
                        value={query}
                        placeholder="搜索编号 / 分类 / 中英文关键词…"
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

            {/* 切库 + 分类 */}
            <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6, padding: "0 12px 8px", overflowX: "auto" }} onWheel={(event) => event.stopPropagation()}>
                {LIBS.map((item) => (
                    <button key={item.key} type="button" onMouseDown={stop} onClick={() => setLibKey(item.key)} style={chipStyle(theme, libKey === item.key)}>
                        {item.title}
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
                    {categories.map((cat) => (
                        <option key={cat} value={cat}>
                            {cat}
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
                            <span style={{ fontSize: 12, fontWeight: 600, flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail.id}</span>
                            <button type="button" onMouseDown={stop} onClick={() => handleInsert([detail])} style={chipStyle(theme, true)}>
                                插入画布
                            </button>
                        </div>
                        <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${theme.node.stroke}`, marginBottom: 8 }}>
                            <MirrorImg rel={detail.full} theme={theme} alt={detail.id} style={{ display: "block", width: "100%", objectFit: "contain" }} />
                        </div>
                        <div style={{ fontSize: 10, color: theme.node.faint, marginBottom: 8, lineHeight: 1.5 }}>
                            {detail.cat} · {detail.kw.slice(0, 8).join(" / ")}
                            {detail.zh.length ? ` · ${detail.zh.slice(0, 8).join(" / ")}` : ""}
                        </div>
                        {detail.hires ? (
                            <a href={detail.hires} target="_blank" rel="noreferrer" onMouseDown={stop} style={{ ...chipStyle(theme, false), display: "inline-block", textDecoration: "none" }}>
                                原寸大图 ↗
                            </a>
                        ) : null}
                    </div>
                ) : visible.length === 0 ? (
                    <div style={{ padding: "32px 0", textAlign: "center", color: theme.node.faint }}>没有匹配的图片</div>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
                        {visible.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                title={`${item.id} · ${item.cat}`}
                                onMouseDown={stop}
                                onClick={() => setDetailId(item.id)}
                                style={{ padding: 0, border: `1px solid ${theme.node.stroke}`, borderRadius: 10, overflow: "hidden", background: "transparent", cursor: "pointer", textAlign: "left" }}
                            >
                                <MirrorImg rel={item.thumb} theme={theme} alt={item.id} style={{ display: "block", width: "100%", aspectRatio: "3 / 4", objectFit: "cover" }} />
                                <span style={{ display: "block", padding: "4px 6px", fontSize: 10, color: theme.node.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.id}</span>
                            </button>
                        ))}
                    </div>
                )}

                {!detail && visible.length < filtered.length ? (
                    <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
                        <button type="button" onMouseDown={stop} onClick={() => setLimit((value) => value + PAGE_SIZE)} style={chipStyle(theme, true)}>
                            加载更多({filtered.length - visible.length})
                        </button>
                    </div>
                ) : null}
                {!detail && visible.length > 1 ? (
                    <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
                        <button type="button" onMouseDown={stop} onClick={() => handleInsert(visible)} style={chipStyle(theme, false)}>
                            插入本页 {visible.length} 张
                        </button>
                    </div>
                ) : null}
            </div>

            {/* 结果计数 + 操作反馈 */}
            <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderTop: `1px solid ${theme.node.stroke}`, fontSize: 10, color: theme.node.faint }}>
                <span>{detail ? "点击插入画布落图" : `筛选结果 ${filtered.length} 张`}</span>
                {flash ? <span style={{ marginLeft: "auto", color: theme.node.text }}>{flash}</span> : null}
            </div>
        </div>
    );
}

/** 节点版宿主:主题直接用宿主主题,插入行落在源节点右侧。 */
function nodeHost(ctx: CanvasNodeContext): CostumeAtlasHost {
    return {
        theme: ctx.theme,
        getNodes: () => ctx.getNodes(),
        transact: (ops) => ctx.transact(ops),
        storeImage: (file, signal) => ctx.images.store(file, signal),
        place: () => ({ x: ctx.node.position.x + ctx.node.width + 96, y: ctx.node.position.y }),
    };
}

export const costumeAtlas: CanvasNodeDefinition = {
    type: "costume-atlas:browser",
    title: "服装模特图鉴",
    icon: <Images size={16} />,
    description: "4200+ 张 AI 服装与模特参考",
    defaultSize: { width: 560, height: 460 },
    defaultMetadata: {},
    hidePanel: true,
    Content: ({ ctx }: CanvasNodeContentProps) => <CostumeAtlasContent host={nodeHost(ctx)} />,
};
