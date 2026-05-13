/**
 * MagicBlock account-reader boundary.
 *
 * This module names the infrastructure role that reads raw Solana account state
 * from base layer and ER connections. It currently extends the extracted
 * `MagicBlockStateReader`; future account fetching can move here without
 * changing decoder tests or read adapters.
 */
import type { Connection } from "@solana/web3.js";
import { MagicBlockStateReader } from "./state-reader";

/** Reads MagicBlock account state from base and ephemeral-rollup RPCs. */
export class MagicBlockAccountReader extends MagicBlockStateReader {
  /** Keeps the base/ER connection pair explicit at construction. */
  constructor(baseConnection: Connection, erConnection: Connection) {
    super(baseConnection, erConnection);
  }
}
