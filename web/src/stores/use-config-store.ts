import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

import i18n from "@/i18n";

export type ApiCallFormat = "openai" | "gemini";
export type ModelCapability = "image" | "video" | "text" | "audio";
export type ReasoningEffort = "auto" | "low" | "medium" | "high" | "xhigh";

export type ChannelModel = {
    name: string;
    capability: ModelCapability;
    script?: string;
};

export type ModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    models: ChannelModel[];
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    channels: ModelChannel[];
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    videoMode: string;
    systemPrompt: string;
    reasoningEffort: ReasoningEffort;
    models: string[];
    quality: string;
    size: string;
    background: string;
    count: string;
    canvasImageCount: string;
    // 批量生图调度方式：并发（默认，快）或串行（慢，但显著降低上游审核/限流误伤）。
    canvasBatchMode: "parallel" | "serial";
    proxyEnabled: boolean;
    proxyUrl: string;
    nodeRegenerateBehavior: "new-node" | "overwrite";
    autoFocusOnSelect: boolean;
};

export type WebdavSyncConfig = {
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};
export type ConfigTabKey = "channels" | "local-proxy" | "preferences" | "prompt-sources" | "webdav" | "local-storage";

export type ChannelCredentialsImportResult = {
    status: "created" | "updated" | "missing-base-url" | "invalid-base-url";
    channelName?: string;
    channelId?: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
const CHANNEL_MODEL_SEPARATOR = "::";
const OPENAI_BASE_URL = "https://api.openai.com";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
// 开箱种子指向的网关：与控制台 server_address 一致，导入时同 baseUrl 原地更新。
const MODPROT_BASE_URL = "https://www.modprot.com";
export const LOCAL_PROXY_PACKAGE = "@basketikun/canvas-proxy";
export const DEFAULT_LOCAL_PROXY_URL = "http://127.0.0.1:23210";

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: MODPROT_BASE_URL,
    apiKey: "",
    apiFormat: "openai",
    // 开箱即用种子：网关渠道 + 40 个模型与能力标注（与线上导出一致，key 除外）。
    // key 永不烘焙：控制台每次以用户自己的令牌导入，同 baseUrl 原地更新 key 与模型。
    channels: [
        {
            id: "modprot",
            name: "modprot.com",
            baseUrl: MODPROT_BASE_URL,
            apiKey: "",
            apiFormat: "openai",
            models: [
                { name: "qwen-image", capability: "image" },
                { name: "seedream-5-lite", capability: "image" },
                { name: "gemini-3-pro-image-preview", capability: "image" },
                { name: "gpt-image-2.6-flare", capability: "image" },
                { name: "kling-image-v3", capability: "image" },
                { name: "gpt-image-2.5-sunburst", capability: "image" },
                { name: "seedream-5.5", capability: "image" },
                { name: "gpt-image-2.6-sunburst", capability: "image" },
                { name: "gpt-image-2.5-flare", capability: "image" },
                { name: "kling-image-o3", capability: "image" },
                { name: "gemini-3.1-flash-image-preview", capability: "image" },
                { name: "seedream-5-pro", capability: "image" },
                { name: "doubao-seedance-2.5-Flash", capability: "video" },
                { name: "minimax-m3", capability: "video" },
                { name: "minimax-h3-prism", capability: "video" },
                { name: "seedance2.0-v3-fast-933-720p", capability: "video" },
                { name: "doubao-seedance-2.0", capability: "video" },
                { name: "minimax-h3", capability: "video" },
                { name: "minimax-m3.1-flash", capability: "video" },
                { name: "seedance2.0-fast-2", capability: "video" },
                { name: "h3-video-flex", capability: "video" },
                { name: "grok-4.7", capability: "text" },
                { name: "deepseek-v4-flash", capability: "text" },
                { name: "deepseek-v4.1-flash-1017-fast-uncensored", capability: "text" },
                { name: "grok-4.6", capability: "text" },
                { name: "claude-sonnet-5-5", capability: "text" },
                { name: "qwen4-max", capability: "text" },
                { name: "claude-opus-5", capability: "text" },
                { name: "kimi-k3", capability: "text" },
                { name: "gpt-6-sol", capability: "text" },
                { name: "gpt-6-astra", capability: "text" },
                { name: "glm-5.3-flash", capability: "text" },
                { name: "gemini-4-neon", capability: "text" },
                { name: "gemini-3.8-flash", capability: "text" },
                { name: "glm-5.3-flash-uncensored", capability: "text" },
                { name: "qwen3.8-flash", capability: "text" },
                { name: "gpt-6.2-sol", capability: "text" },
                { name: "gpt-6.2-astra", capability: "text" },
                { name: "deepseek-v4.1-flash-1017", capability: "text" },
                { name: "gemini-4-argon", capability: "text" },
            ],
        },
    ],
    model: "modprot::qwen-image",
    imageModel: "modprot::gpt-image-2.6-flare",
    videoModel: "modprot::h3-video-flex",
    textModel: "modprot::deepseek-v4.1-flash-1017-fast-uncensored",
    // 网关当前无音频模型：留空，未选音频时就绪检查会拦，不会静默调错。
    audioModel: "",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoMode: "frames",
    systemPrompt: "",
    reasoningEffort: "auto",
    // 与种子渠道一致：merge 重算前首屏即有完整选项，不闪空。
    models: [
        "modprot::qwen-image",
        "modprot::seedream-5-lite",
        "modprot::gemini-3-pro-image-preview",
        "modprot::gpt-image-2.6-flare",
        "modprot::kling-image-v3",
        "modprot::gpt-image-2.5-sunburst",
        "modprot::seedream-5.5",
        "modprot::gpt-image-2.6-sunburst",
        "modprot::gpt-image-2.5-flare",
        "modprot::kling-image-o3",
        "modprot::gemini-3.1-flash-image-preview",
        "modprot::seedream-5-pro",
        "modprot::doubao-seedance-2.5-Flash",
        "modprot::minimax-m3",
        "modprot::minimax-h3-prism",
        "modprot::seedance2.0-v3-fast-933-720p",
        "modprot::doubao-seedance-2.0",
        "modprot::minimax-h3",
        "modprot::minimax-m3.1-flash",
        "modprot::seedance2.0-fast-2",
        "modprot::h3-video-flex",
        "modprot::grok-4.7",
        "modprot::deepseek-v4-flash",
        "modprot::deepseek-v4.1-flash-1017-fast-uncensored",
        "modprot::grok-4.6",
        "modprot::claude-sonnet-5-5",
        "modprot::qwen4-max",
        "modprot::claude-opus-5",
        "modprot::kimi-k3",
        "modprot::gpt-6-sol",
        "modprot::gpt-6-astra",
        "modprot::glm-5.3-flash",
        "modprot::gemini-4-neon",
        "modprot::gemini-3.8-flash",
        "modprot::glm-5.3-flash-uncensored",
        "modprot::qwen3.8-flash",
        "modprot::gpt-6.2-sol",
        "modprot::gpt-6.2-astra",
        "modprot::deepseek-v4.1-flash-1017",
        "modprot::gemini-4-argon",
    ],
    quality: "auto",
    size: "1:1",
    background: "",
    count: "1",
    canvasImageCount: "3",
    canvasBatchMode: "parallel",
    proxyEnabled: false,
    proxyUrl: DEFAULT_LOCAL_PROXY_URL,
    nodeRegenerateBehavior: "new-node",
    autoFocusOnSelect: false,
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    url: "",
    username: "",
    password: "",
    directory: "infinite-canvas",
    lastSyncedAt: "",
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    isConfigOpen: boolean;
    configTab: ConfigTabKey;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    importChannelCredentials: (input: { baseUrl?: string | null; apiKey?: string | null; models?: string | null; keys?: string | null }) => ChannelCredentialsImportResult;
    importedKeys: ImportedKeyOption[];
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean, tab?: ConfigTabKey) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

const VIDEO_KEYWORDS = ["video", "sora", "veo", "kling", "wan", "hailuo", "h3"];

export function boolConfig(value: string, fallback: boolean) {
    return value ? value === "true" : fallback;
}
const AUDIO_KEYWORDS = ["audio", "tts", "speech", "voice", "music", "sound", "chirp"];
const IMAGE_KEYWORDS = ["seedream", "gpt-image", "image", "img", "dall-e", "dalle", "imagen", "flux", "sdxl", "stable-diffusion", "midjourney"];

/** Best-effort default capability for a freshly fetched model name; user can override in the channel editor. */
export function guessCapability(name: string): ModelCapability {
    const value = name.toLowerCase();
    if (VIDEO_KEYWORDS.some((keyword) => value.includes(keyword))) return "video";
    if (AUDIO_KEYWORDS.some((keyword) => value.includes(keyword))) return "audio";
    if (IMAGE_KEYWORDS.some((keyword) => value.includes(keyword))) return "image";
    return "text";
}

function findChannelModel(config: AiConfig, value: string): { channel: ModelChannel; model: ChannelModel } | null {
    const decoded = decodeChannelModel(value);
    const name = decoded?.model || value;
    const channel = decoded ? config.channels.find((item) => item.id === decoded.channelId) : config.channels.find((item) => item.models.some((model) => model.name === name));
    const model = channel?.models.find((item) => item.name === name);
    return channel && model ? { channel, model } : null;
}

export function modelCapabilityOf(config: AiConfig, value: string): ModelCapability | undefined {
    return findChannelModel(config, value)?.model.capability;
}

export function modelMatchesCapability(config: AiConfig, value: string, capability?: ModelCapability) {
    if (!capability) return true;
    return modelCapabilityOf(config, value) === capability;
}

export function resolveModelForCapability(config: AiConfig, currentModel: string | undefined, capability: ModelCapability) {
    const defaultModel = capability === "image" ? config.imageModel : capability === "video" ? config.videoModel : capability === "audio" ? config.audioModel : config.textModel;
    const fallbackModel = capability === "image" ? defaultConfig.imageModel : capability === "video" ? defaultConfig.videoModel : capability === "audio" ? defaultConfig.audioModel : defaultConfig.textModel;
    for (const model of [currentModel, defaultModel]) {
        if (!model) continue;
        const configuredCapability = modelCapabilityOf(config, model);
        // Keep unavailable selections visible so the readiness check blocks the
        // request. Only a known capability switch may choose another model.
        if (!configuredCapability || configuredCapability === capability) return model;
    }
    return fallbackModel;
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config.channels.flatMap((channel) => channel.models.filter((model) => model.capability === capability).map((model) => encodeChannelModel(channel.id, model.name)));
}

/** The user script (if any) attached to a model; empty string means use the system default call. */
export function resolveModelScript(config: AiConfig, value: string) {
    return findChannelModel(config, value)?.model.script?.trim() || "";
}

function isAiConfigReady(config: AiConfig, model: string) {
    const match = findChannelModel(config, model);
    return Boolean(match && match.channel.baseUrl.trim() && match.channel.apiKey.trim());
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            isConfigOpen: false,
            configTab: "channels",
            shouldPromptContinue: false,
            // 控制台带来的令牌列表：只放内存，不进 persist（partialize 仅存 config/webdav），
            // 避免 key 落盘残留，也避免旧 key 覆盖用户后来的修改。
            importedKeys: [],
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            importChannelCredentials: (input) => {
                const currentConfig = get().config;
                const result = upsertChannelCredentials(currentConfig, input);
                const importedKeys = parseImportedKeys(input.keys);
                if (result.config !== currentConfig) set({ config: result.config });
                // 每次带参打开都刷新令牌列表：控制台是真相源，旧列表不保留。
                if (input.keys !== undefined) set({ importedKeys });
                return { status: result.status, channelName: result.channelName, channelId: result.channelId };
            },
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false, configTab = "channels") => set({ isConfigOpen: true, shouldPromptContinue, configTab }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                // 无持久化渠道（首次打开）沿用种子渠道；有则尊重用户数据。
                if (!Array.isArray(persistedConfig.channels)) config.channels = defaultConfig.channels;
                const channels = normalizeChannels(config);
                const models = modelOptionsFromChannels(channels);
                return {
                    ...current,
                    webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
                    config: {
                        ...config,
                        channelMode: "local",
                        apiFormat: normalizeApiFormat(config.apiFormat),
                        channels,
                        models,
                        imageModel: normalizeModelOptionValue(config.imageModel || config.model, channels),
                        videoModel: normalizeModelOptionValue(config.videoModel, channels),
                        textModel: normalizeModelOptionValue(config.textModel || config.model, channels),
                        audioModel: normalizeModelOptionValue(config.audioModel || defaultConfig.audioModel, channels),
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        audioInstructions: config.audioInstructions || "",
                        reasoningEffort: config.reasoningEffort || "auto",
                        videoSeconds: config.videoSeconds || "6",
                        vquality: config.vquality || "720",
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        videoMode: config.videoMode === "reference" ? "reference" : "frames",
                        canvasImageCount: config.canvasImageCount || "3",
                        canvasBatchMode: config.canvasBatchMode === "serial" ? "serial" : "parallel",
                        proxyEnabled: Boolean(config.proxyEnabled),
                        proxyUrl: config.proxyUrl || DEFAULT_LOCAL_PROXY_URL,
                        nodeRegenerateBehavior: config.nodeRegenerateBehavior === "overwrite" ? "overwrite" : "new-node",
                        autoFocusOnSelect: Boolean(config.autoFocusOnSelect),
                    },
                };
            },
        },
    ),
);

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    return useMemo(() => ({ ...config, channelMode: "local" as const }), [config]);
}

/** Normalize a mixed list of raw model names or model objects into deduped ChannelModel entries. */
export function normalizeChannelModels(models: Array<string | ChannelModel> | undefined): ChannelModel[] {
    const seen = new Set<string>();
    const result: ChannelModel[] = [];
    for (const item of models || []) {
        const name = (typeof item === "string" ? item : item?.name || "").trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const capability = typeof item === "string" ? guessCapability(name) : item.capability || guessCapability(name);
        const script = typeof item === "string" ? undefined : item.script?.trim() || undefined;
        result.push({ name, capability, script });
    }
    return result;
}

export function createModelChannel(channel?: Partial<ModelChannel>): ModelChannel {
    const apiFormat = normalizeApiFormat(channel?.apiFormat);
    return {
        id: channel?.id?.trim() || nanoid(),
        name: channel?.name?.trim() || i18n.t("config.channels.newName"),
        baseUrl: channel?.baseUrl?.trim() || defaultBaseUrlForApiFormat(apiFormat),
        apiKey: channel?.apiKey || "",
        apiFormat,
        models: normalizeChannelModels(channel?.models),
    };
}

export type ImportedKeyOption = { name: string; key: string };

export const MAX_IMPORTED_KEYS = 10;

/** 控制台 keys 参数：base64url(JSON[{n: name, k: key}])，内存态不落盘，非法输入一律置空。 */
export function parseImportedKeys(raw: string | null | undefined): ImportedKeyOption[] {
    if (!raw) return [];
    try {
        const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
        const binary = atob(normalized);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (!Array.isArray(parsed)) return [];
        const options: ImportedKeyOption[] = [];
        for (const entry of parsed) {
            if (options.length >= MAX_IMPORTED_KEYS) break;
            if (typeof entry !== "object" || entry === null) continue;
            const record = entry as Record<string, unknown>;
            const name = typeof record.n === "string" ? record.n.trim() : "";
            const key = typeof record.k === "string" ? record.k.trim() : "";
            if (!key) continue;
            if (options.some((item) => item.key === key)) continue;
            options.push({ name: name || `Token ${options.length + 1}`, key });
        }
        return options;
    } catch {
        return [];
    }
}

export function upsertChannelCredentials(
    config: AiConfig,
    input: { baseUrl?: string | null; apiKey?: string | null; models?: string | null },
): ChannelCredentialsImportResult & { config: AiConfig } {
    const rawBaseUrl = input.baseUrl?.trim() || "";
    if (!rawBaseUrl) return { status: "missing-base-url", config };
    if (!isHttpBaseUrl(rawBaseUrl)) return { status: "invalid-base-url", config };

    const baseUrl = normalizeImportedBaseUrl(rawBaseUrl);
    const apiKey = input.apiKey?.trim() || "";
    const presetModels = parsePresetChannelModels(input.models);
    const matchingIndex = config.channels.findIndex((channel) => normalizedBaseUrlKey(channel.baseUrl) === normalizedBaseUrlKey(baseUrl));

    if (matchingIndex >= 0) {
        const existing = config.channels[matchingIndex];
        const models = presetModels.length ? mergePresetChannelModels(existing.models, presetModels) : existing.models;
        if (existing.baseUrl === baseUrl && (!apiKey || existing.apiKey === apiKey) && models === existing.models) {
            return { status: "updated", channelName: existing.name, channelId: existing.id, config };
        }
        const updated = { ...existing, baseUrl, ...(apiKey ? { apiKey } : {}), models };
        const channels = config.channels.map((channel, index) => (index === matchingIndex ? updated : channel));
        return { status: "updated", channelName: existing.name, channelId: existing.id, config: applyPresetModelSelection({ ...config, channels }, updated) };
    }

    const channel = createModelChannel({
        name: importedChannelName(baseUrl),
        baseUrl,
        apiKey,
        apiFormat: "openai",
        models: presetModels,
    });
    const channels = [...config.channels, channel];
    return { status: "created", channelName: channel.name, channelId: channel.id, config: applyPresetModelSelection({ ...config, channels }, channel) };
}

/**
 * Parse the `models` URL preset from the console: `image:m1,m2;video:m3;text:m4;audio:m5`.
 * Unknown capabilities fall back to guessCapability so a typo degrades to a usable model, not a crash.
 */
export function parsePresetChannelModels(value: string | null | undefined): ChannelModel[] {
    const models: ChannelModel[] = [];
    for (const group of (value || "").split(";")) {
        const trimmedGroup = group.trim();
        if (!trimmedGroup) continue;
        const separatorIndex = trimmedGroup.indexOf(":");
        const capability = separatorIndex >= 0 ? (trimmedGroup.slice(0, separatorIndex).trim().toLowerCase() as ModelCapability) : null;
        const names = (separatorIndex >= 0 ? trimmedGroup.slice(separatorIndex + 1) : trimmedGroup).split(",");
        for (const name of names) {
            const modelName = name.trim();
            if (!modelName) continue;
            models.push({ name: modelName, capability: isPresetCapability(capability) ? capability : guessCapability(modelName) });
        }
    }
    return normalizeChannelModels(models);
}

function isPresetCapability(value: string | null): value is ModelCapability {
    return value === "image" || value === "video" || value === "text" || value === "audio";
}

/** Preset models win on name conflicts because the console knows the real upstream mapping; keep user scripts on untouched models. */
function mergePresetChannelModels(existing: ChannelModel[], preset: ChannelModel[]): ChannelModel[] {
    const presetNames = new Set(preset.map((model) => model.name));
    const merged = [...existing.filter((model) => !presetNames.has(model.name)), ...preset];
    const changed = merged.length !== existing.length || merged.some((model, index) => model.name !== existing[index]?.name || model.capability !== existing[index]?.capability);
    return changed ? normalizeChannelModels(merged) : existing;
}

/** Point per-capability defaults at the imported channel so the first paint is usable without opening the config dialog. */
function applyPresetModelSelection(config: AiConfig, channel: ModelChannel): AiConfig {
    if (!channel.models.length) return config;
    const models = modelOptionsFromChannels(config.channels);
    const pick = (capability: ModelCapability, current: string) => {
        if (findChannelModel(config, current)?.channel.id === channel.id) return current;
        const first = channel.models.find((model) => model.capability === capability);
        return first ? encodeChannelModel(channel.id, first.name) : current;
    };
    const next: AiConfig = {
        ...config,
        models,
        imageModel: pick("image", config.imageModel || config.model),
        videoModel: pick("video", config.videoModel),
        textModel: pick("text", config.textModel || config.model),
        audioModel: pick("audio", config.audioModel),
    };
    next.model = next.imageModel || config.model;
    next.baseUrl = config.channels[0]?.baseUrl || config.baseUrl;
    next.apiKey = config.channels[0]?.apiKey || config.apiKey;
    next.apiFormat = config.channels[0]?.apiFormat || config.apiFormat;
    return next;
}

function isHttpBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
    } catch {
        return false;
    }
}

function normalizedBaseUrlKey(baseUrl: string) {
    try {
        return stripTrailingApiVersion(normalizeImportedBaseUrl(baseUrl));
    } catch {
        return stripTrailingApiVersion(baseUrl.trim().replace(/\/+$/, ""));
    }
}

function normalizeImportedBaseUrl(baseUrl: string) {
    const url = new URL(baseUrl.trim());
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
}

function stripTrailingApiVersion(baseUrl: string) {
    return baseUrl.replace(/\/v1$/i, "");
}

function importedChannelName(baseUrl: string) {
    const hostname = new URL(baseUrl).hostname;
    return hostname.replace(/^(?:www|api)\./i, "") || i18n.t("config.channels.newName");
}

export function encodeChannelModel(channelId: string, model: string) {
    return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

export function isChannelModelValue(value: string) {
    return value.includes(CHANNEL_MODEL_SEPARATOR);
}

export function decodeChannelModel(value: string) {
    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);
    if (index < 0) return null;
    return { channelId: value.slice(0, index), model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length) };
}

export function modelOptionName(value: string) {
    return decodeChannelModel(value)?.model || value;
}

export function modelOptionLabel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    if (!decoded) return value;
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    return channel ? `${decoded.model}（${channel.name}）` : decoded.model;
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueModelOptions(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model.name))));
}

export function normalizeModelOptionValue(value: string | undefined, channels: ModelChannel[]) {
    const model = (value || "").trim();
    if (!model) return "";
    const decoded = decodeChannelModel(model);
    if (decoded) {
        const channel = channels.find((item) => item.id === decoded.channelId);
        return channel && channel.models.some((item) => item.name === decoded.model) ? model : "";
    }
    const channel = channels.find((item) => item.models.some((entry) => entry.name === model)) || channels[0];
    return channel && channel.models.some((item) => item.name === model) ? encodeChannelModel(channel.id, model) : model;
}

export function resolveModelChannel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const model = decoded?.model || value;
    const matched = decoded ? config.channels.find((channel) => channel.id === decoded.channelId) : config.channels.find((channel) => channel.models.some((item) => item.name === model));
    return matched || config.channels[0] || createModelChannel({ id: "default", name: i18n.t("config.channels.defaultName"), baseUrl: config.baseUrl, apiKey: config.apiKey, apiFormat: config.apiFormat, models: config.models.map(modelOptionName).map((name) => ({ name, capability: guessCapability(name) })) });
}

export function resolveModelRequestConfig(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    return {
        ...config,
        model: modelOptionName(value || config.model),
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        apiFormat: channel.apiFormat,
    };
}

function normalizeChannels(config: AiConfig) {
    const persistedChannels = Array.isArray(config.channels) ? config.channels : [];
    // 渠道为空即保持为空，不再复活默认渠道：新用户只会看到控制台导入的网关渠道。
    // 已持久化的渠道原样保留，不动用户数据。
    return persistedChannels.map((channel, index) =>
        createModelChannel({
            ...channel,
            id: channel.id || (index === 0 ? "default" : `channel-${index + 1}`),
            name: channel.name || (index === 0 ? i18n.t("config.channels.defaultName") : i18n.t("config.channels.indexedName", { index: index + 1 })),
            models: normalizeChannelModels(channel.models),
        }),
    );
}

export function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
    if (apiFormat === "gemini") return GEMINI_BASE_URL;
    return OPENAI_BASE_URL;
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
    return apiFormat === "gemini" ? apiFormat : "openai";
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function buildApiUrl(baseUrl: string, path: string) {
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return withLocalProxy(`${apiBaseUrl}${path}`);
}

export function normalizeLocalProxyUrl(value: string) {
    const trimmed = value.trim().replace(/\/+$/, "");
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

/** Prefix an outgoing request with the local forwarding proxy so the browser is not blocked by CORS. */
export function withLocalProxy(url: string) {
    const { proxyEnabled, proxyUrl } = useConfigStore.getState().config;
    if (!proxyEnabled || !/^https?:\/\//i.test(url)) return url;
    const base = normalizeLocalProxyUrl(proxyUrl);
    if (!base || url.startsWith(`${base}/`)) return url;
    return `${base}/${url}`;
}
