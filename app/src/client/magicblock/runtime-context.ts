import {
  Connection,
  Keypair,
  sendAndConfirmRawTransaction,
  Transaction,
} from "@solana/web3.js";
import { EPHEMERAL_ROLLUP_RPC_URL, LOCALNET_RPC_URL } from "../config";
import { installAnchorProvider } from "../sdk";
import type { BoltResult } from "../types";
import { BrowserAnchorWallet, readBurnerWallet } from "../wallet";

export class MagicBlockRuntimeContext {
  readonly baseConnection = new Connection(LOCALNET_RPC_URL, "confirmed");
  readonly erConnection = new Connection(EPHEMERAL_ROLLUP_RPC_URL, "confirmed");
  wallet = readBurnerWallet();

  async sendBoltResult(
    result: BoltResult,
    connection = this.baseConnection,
    options: { skipPreflight?: boolean } = {}
  ) {
    const transaction =
      result.transaction ??
      (result.instruction
        ? new Transaction().add(result.instruction)
        : undefined);

    if (!transaction) {
      throw new Error("Bolt SDK did not return a transaction.");
    }

    transaction.feePayer ??= this.wallet.publicKey;

    if (!transaction.recentBlockhash) {
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
    }

    transaction.partialSign(this.wallet);

    return sendAndConfirmRawTransaction(connection, transaction.serialize(), {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
      skipPreflight: options.skipPreflight,
    });
  }

  async sendSignedTransaction(
    transaction: Transaction,
    connection = this.baseConnection,
    signers: Keypair[] = []
  ) {
    transaction.feePayer ??= this.wallet.publicKey;

    if (!transaction.recentBlockhash) {
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
    }

    transaction.partialSign(this.wallet, ...signers);

    return sendAndConfirmRawTransaction(connection, transaction.serialize(), {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
  }

  async installAnchorProvider(connection: Connection) {
    await installAnchorProvider(
      connection,
      new BrowserAnchorWallet(this.wallet)
    );
  }
}
