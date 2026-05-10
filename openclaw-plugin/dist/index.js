import { Type } from "@sinclair/typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
const SAMPLE_GAME_STATE = {
    game: "Open Wilds",
    network: "localnet",
    world: {
        id: "uniswap-commons-demo",
        epoch: 42,
        timeOfDay: "morning",
    },
    player: {
        id: "demo-player",
        name: "Static Scout",
        position: { x: 12, y: 8 },
        energy: { current: 76, max: 100 },
        wallet: "Demo111111111111111111111111111111111111111",
    },
    inventory: [
        { itemId: "sungrain", quantity: 6 },
        { itemId: "routeberry", quantity: 3 },
    ],
    nearbyTiles: [
        { x: 12, y: 9, terrain: "grass", object: "sungrain", action: "harvest" },
        { x: 13, y: 8, terrain: "path", object: null, action: "move" },
    ],
};
export default definePluginEntry({
    id: "open-wilds",
    name: "Open Wilds",
    description: "Adds Open Wilds game tools to OpenClaw.",
    register(api) {
        api.registerTool({
            name: "open_wilds_get_game_state",
            label: "Get Open Wilds Game State",
            description: "Return a static sample Open Wilds game state snapshot.",
            parameters: Type.Object({}),
            async execute(_toolCallId, _params, signal) {
                signal?.throwIfAborted();
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(SAMPLE_GAME_STATE, null, 2),
                        },
                    ],
                    details: SAMPLE_GAME_STATE,
                };
            },
        });
    },
});
