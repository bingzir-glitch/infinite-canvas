// 把 nvzhuang 三库 data.js 转成统一 JSON，并拼入 ref-lib 中文关键词（仅文本，不碰图片）。
// 用法：node scripts/build-data.mjs /path/to/vendor
//   vendor 下需有 nvzhuang/（git clone paipiange/nvzhuang）与 ref-lib/（git clone sleepy-zone/ai-ref-library-cn）。
// 输出到本插件 data/（构建时打进包）；图片镜像另行拷贝 vendor/nvzhuang/assets/* 到部署站 /nvzhuang/ 下。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SRC = process.argv[2] || "/tmp/atlas-inspect";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../data");

function extractBalanced(text, from) {
    const open = text[from];
    const pairs = { "{": "}", "[": "]" };
    const close = pairs[open];
    if (!close) throw new Error("不支持的起始字符");
    let depth = 0, inStr = false, esc = false;
    for (let i = from; i < text.length; i += 1) {
        const ch = text[i];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === "\\") esc = true;
            else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === open) depth += 1;
        else if (ch === close) {
            depth -= 1;
            if (depth === 0) return text.slice(from, i + 1);
        }
    }
    throw new Error("括号不配对");
}

function parseConstJs(path, name) {
    const text = readFileSync(path, "utf8");
    const marker = `const ${name}`;
    const start = text.indexOf(marker);
    if (start < 0) throw new Error(`${path}: 找不到 ${name}`);
    const eq = text.indexOf("=", start + marker.length);
    if (eq < 0) throw new Error(`${path}: ${name} 后无 =`);
    let pos = eq + 1;
    while (pos < text.length && /\s/.test(text[pos])) pos += 1;
    return JSON.parse(extractBalanced(text, pos));
}

function parseWindowJs(path, key) {
    const text = readFileSync(path, "utf8");
    const marker = `window.${key}=`;
    const start = text.indexOf(marker);
    if (start < 0) throw new Error(`${path}: 找不到 ${key}`);
    let rest = text.slice(start + marker.length).trimEnd();
    if (rest.endsWith(";")) rest = rest.slice(0, -1);
    return JSON.parse(rest);
}

// ref-lib 服装库中文关键词：id 与 nvzhuang 写实库一一对应（已验证 1407/1407）。
const costume = parseWindowJs(`${SRC}/ref-lib/data/costume.js`, "LIB_COSTUME");
const zhById = new Map(costume.data.items.map((item) => [item.id, item.zh || []]));
console.log(`zh 词条: ${zhById.size}`);

function unify(items, mapRecord) {
    return items.map(mapRecord);
}

const real = parseConstJs(`${SRC}/nvzhuang/data.js`, "D");
const realMeta = parseConstJs(`${SRC}/nvzhuang/data.js`, "META");
const anime = parseConstJs(`${SRC}/nvzhuang/data-anime.js`, "D_ANIME");
const portrait = parseConstJs(`${SRC}/nvzhuang/data-portrait.js`, "D_PORTRAIT");

const outReal = unify(real, (r) => ({
    id: r.id, cat: r["カテゴリ"],
    kw: (r["キーワード"] || "").split(" ").filter(Boolean),
    zh: zhById.get(r.id) || [],
    thumb: r["サムネ"], full: r["画像"],
    hires: r["原寸"] && r["原寸"].startsWith("http") ? r["原寸"] : null,
}));
const outAnime = unify(anime, (r) => ({
    id: r.id, cat: r["カテゴリ"],
    kw: (r["キーワード"] || "").split(" ").filter(Boolean),
    zh: [],
    thumb: r["サムネ"], full: r["画像"],
    hires: r["原寸"] && r["原寸"].startsWith("http") ? r["原寸"] : null,
}));
const outPortrait = unify(portrait, (r) => ({
    id: r.id, cat: r["カテゴリ"],
    kw: (r["キーワード"] || "").split(" ").filter(Boolean),
    zh: [],
    thumb: r["サムネ"], full: r["画像"],
    hires: r["原寸"] && r["原寸"].startsWith("http") ? r["原寸"] : null,
}));

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/real.json`, JSON.stringify({ total: realMeta.total, cats: realMeta.cats, items: outReal }));
writeFileSync(`${OUT}/anime.json`, JSON.stringify({ total: outAnime.length, items: outAnime }));
writeFileSync(`${OUT}/portrait.json`, JSON.stringify({ total: outPortrait.length, items: outPortrait }));
const withZh = outReal.filter((r) => r.zh.length).length;
console.log(`real: ${outReal.length} (有中文词 ${withZh}), anime: ${outAnime.length}, portrait: ${outPortrait.length}`);
