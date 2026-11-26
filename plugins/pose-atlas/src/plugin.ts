import { contribute, definePlugin } from "@infinite-canvas/plugin-sdk";
import { canvasSideTabs, nodes } from "@infinite-canvas/plugin-sdk/builtin";
import { poseAtlas } from "./nodes/browser";
import { poseAtlasTab } from "./side-tab";

export default definePlugin({
    contributions: [contribute(nodes, { id: poseAtlas.type, value: poseAtlas }), contribute(canvasSideTabs, poseAtlasTab)],
});
