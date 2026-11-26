import { appDatabase } from "@workbench/utils/indexed-db";
import { network } from "@workbench/services/network/runtime";
import { openStore } from "../storage/memory-driver";
import { fetchChannelModels } from "@infinite-canvas/model-runtime/channels";

import type { ChannelAdapter } from "./runtime";
import type { ModelChannel } from "@infinite-canvas/shared/channels";

export function createBrowserChannels(): ChannelAdapter {
    const store = openStore(appDatabase, "channels");
    return {
        load: () => store.getItem<ModelChannel[]>("channels"),
        async save(channels) {
            await store.setItem("channels", channels);
            return channels;
        },
        listModels: (channel, group, format, signal) => fetchChannelModels(channel.baseUrl, group.apiKey, format, network.url, signal),
    };
}
