import { contribute, definePlugin } from "@infinite-canvas/plugin-sdk";
import { canvasSideTabs, nodes } from "@infinite-canvas/plugin-sdk/builtin";
import { costumeAtlas } from "./nodes/browser";
import { costumeAtlasTab } from "./side-tab";

export default definePlugin({
    contributions: [contribute(nodes, { id: costumeAtlas.type, value: costumeAtlas }), contribute(canvasSideTabs, costumeAtlasTab)],
});
