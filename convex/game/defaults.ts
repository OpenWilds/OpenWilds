export const defaultPlayerActionState = {
  position: { x: 0, y: 0 },
  energy: { current: 10, max: 10 },
  activeAction: {
    action: 0,
    kind: "idle" as const,
    startedAt: 0,
    endsAt: 0,
  },
};

export const defaultPlayerAppearance = {
  color: "#f4a7b9",
  fill: 0xf4a7b9,
  spriteAssetId: "player",
  stroke: 0x1f2933,
};

export const emptyReadModel = () => ({
  playerActionState: defaultPlayerActionState,
  playerAppearance: defaultPlayerAppearance,
  visiblePlayers: [],
  inventory: { slots: [] },
  goldBalance: { amount: 0n },
  tradeOffers: [],
  farmTiles: [],
  tileItems: [],
});
