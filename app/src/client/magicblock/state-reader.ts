import type { AccountInfo, Connection } from "@solana/web3.js";
import type { Buffer } from "buffer";
import type {
  ActiveActionState,
  EnergyState,
  GridPoint,
  InventoryState,
  PlayerActionState,
  TileItemState,
} from "../../game/types";
import type { PlayerState } from "../types";

export type AccountSource = "er" | "base";

export type SourcedPlayerActionState = {
  source: AccountSource;
  state: PlayerActionState;
};

export class MagicBlockStateReader {
  constructor(
    private readonly baseConnection: Connection,
    private readonly erConnection: Connection
  ) {}

  async fetchPlayerActionState(player: PlayerState) {
    const [
      [erPositionAccount, erEnergyAccount, erActiveActionAccount],
      [basePositionAccount, baseEnergyAccount, baseActiveActionAccount],
    ] = await Promise.all([
      this.erConnection.getMultipleAccountsInfo([
        player.positionComponentPda,
        player.energyComponentPda,
        player.activeActionComponentPda,
      ]),
      this.baseConnection.getMultipleAccountsInfo([
        player.positionComponentPda,
        player.energyComponentPda,
        player.activeActionComponentPda,
      ]),
    ]);
    const erState = decodePlayerActionStateFromAccounts(
      [erPositionAccount, erEnergyAccount, erActiveActionAccount],
      "er"
    );
    const baseState = decodePlayerActionStateFromAccounts(
      [basePositionAccount, baseEnergyAccount, baseActiveActionAccount],
      "base"
    );
    const selectedState = selectFreshestPlayerActionState(erState, baseState);

    if (!selectedState) {
      throw new Error("Player action state accounts are missing.");
    }

    return selectedState.state;
  }
}

export const decodePlayerActionStateFromAccounts = (
  [positionAccount, energyAccount, activeActionAccount]: [
    AccountInfo<Buffer> | null,
    AccountInfo<Buffer> | null,
    AccountInfo<Buffer> | null
  ],
  source: AccountSource
): SourcedPlayerActionState | null => {
  if (
    !positionAccount ||
    positionAccount.data.byteLength < 24 ||
    !energyAccount ||
    energyAccount.data.byteLength < 24 ||
    !activeActionAccount ||
    activeActionAccount.data.byteLength < 25
  ) {
    return null;
  }

  return {
    source,
    state: {
      position: decodePosition(positionAccount.data),
      energy: decodeEnergy(energyAccount.data),
      activeAction: decodeActiveAction(activeActionAccount.data),
    },
  };
};

export const selectFreshestPlayerActionState = (
  erState: SourcedPlayerActionState | null,
  baseState: SourcedPlayerActionState | null
) => {
  if (!erState) {
    return baseState;
  }

  if (!baseState) {
    return erState;
  }

  return getPlayerActionRevision(baseState.state) >
    getPlayerActionRevision(erState.state)
    ? baseState
    : erState;
};

export const getPlayerActionRevision = (state: PlayerActionState) =>
  Math.max(state.activeAction.startedAt, state.activeAction.endsAt);

export const decodePosition = (data: Uint8Array): GridPoint => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  return {
    x: readI64(view, 8),
    y: readI64(view, 16),
  };
};

export const decodeEnergy = (data: Uint8Array): EnergyState => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  return {
    current: readU64(view, 8),
    max: readU64(view, 16),
  };
};

export const decodeActiveAction = (
  data: Uint8Array,
  nowSeconds = Date.now() / 1000
): ActiveActionState => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const action = view.getUint8(8);
  const startedAt = readI64(view, 9);
  const endsAt = readI64(view, 17);

  return {
    action,
    kind: getActionKind(action, endsAt, nowSeconds),
    startedAt,
    endsAt,
  };
};

export const decodeInventory = (data: Uint8Array): InventoryState => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const itemIds: number[] = [];
  const quantities: number[] = [];

  for (let index = 0; index < 16; index += 1) {
    itemIds.push(view.getUint16(8 + index * 2, true));
    quantities.push(view.getUint16(40 + index * 2, true));
  }

  return {
    slots: itemIds
      .map((itemId, index) => ({
        itemId,
        quantity: quantities[index],
      }))
      .filter((slot) => slot.itemId !== 0 && slot.quantity > 0),
  };
};

export const decodeTileItem = (
  data: Uint8Array,
  fallbackPoint: GridPoint
): TileItemState | null => {
  if (data.byteLength < 28) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const itemId = view.getUint16(24, true);
  const quantity = view.getUint16(26, true);

  if (itemId === 0 || quantity === 0) {
    return null;
  }

  return {
    x: readI64(view, 8) || fallbackPoint.x,
    y: readI64(view, 16) || fallbackPoint.y,
    itemId,
    quantity,
  };
};

export const getActionKind = (
  action: number,
  endsAt: number,
  nowSeconds = Date.now() / 1000
): ActiveActionState["kind"] => {
  if (action === 0 || endsAt <= nowSeconds) {
    return "idle";
  }

  switch (action) {
    case 1:
      return "move";
    case 2:
      return "sleep";
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
    case 9:
      return "farm";
    default:
      return "unknown";
  }
};

export const readI64 = (view: DataView, offset: number) => {
  const low = view.getUint32(offset, true);
  const high = view.getInt32(offset + 4, true);

  return high * 0x100000000 + low;
};

export const readU64 = (view: DataView, offset: number) => {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);

  return high * 0x100000000 + low;
};
