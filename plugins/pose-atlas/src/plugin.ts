import { contribute, definePlugin } from "@infinite-canvas/plugin-sdk";
import { nodes } from "@infinite-canvas/plugin-sdk/builtin";
import { poseAtlas } from "./nodes/browser";

export default definePlugin({
    contributions: [contribute(nodes, { id: poseAtlas.type, value: poseAtlas })],
});
