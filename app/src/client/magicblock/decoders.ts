/**
 * MagicBlock pure decoder exports.
 *
 * Keep account byte decoding and freshest-state selection separate from RPC,
 * transactions, and UI state. Tests should import decoder helpers from here
 * when they do not need a live MagicBlock runtime.
 */
export {
  decodeActiveAction,
  decodeEnergy,
  decodeInventory,
  decodePlayerActionStateFromAccounts,
  decodePosition,
  decodeTileItem,
  getActionKind,
  getPlayerActionRevision,
  readI64,
  readU64,
  selectFreshestPlayerActionState,
} from "./state-reader";

export type { AccountSource, SourcedPlayerActionState } from "./state-reader";
