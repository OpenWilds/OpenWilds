import {
  Keypair,
  Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import { BURNER_STORAGE_KEY } from "./config";

type BurnerSignedTransaction = Transaction | VersionedTransaction;

export class BrowserAnchorWallet {
  readonly publicKey;

  constructor(private readonly keypair: Keypair) {
    this.publicKey = keypair.publicKey;
  }

  async signTransaction<T extends BurnerSignedTransaction>(
    transaction: T
  ): Promise<T> {
    if (transaction instanceof Transaction) {
      transaction.partialSign(this.keypair);
    } else {
      transaction.sign([this.keypair]);
    }

    return transaction;
  }

  async signAllTransactions<T extends BurnerSignedTransaction>(
    transactions: T[]
  ): Promise<T[]> {
    return Promise.all(
      transactions.map((transaction) => this.signTransaction(transaction))
    );
  }
}

export const readBurnerWallet = () => {
  const storedSecret = window.localStorage.getItem(BURNER_STORAGE_KEY);

  if (!storedSecret) {
    const wallet = Keypair.generate();
    window.localStorage.setItem(
      BURNER_STORAGE_KEY,
      JSON.stringify(Array.from(wallet.secretKey))
    );
    return wallet;
  }

  try {
    const secretKey = Uint8Array.from(JSON.parse(storedSecret));
    return Keypair.fromSecretKey(secretKey);
  } catch {
    resetBurnerWallet();
    return readBurnerWallet();
  }
};

export const resetBurnerWallet = () => {
  window.localStorage.removeItem(BURNER_STORAGE_KEY);
};

