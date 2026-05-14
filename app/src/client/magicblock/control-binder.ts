/**
 * MagicBlock DOM control binder.
 *
 * This is the only active MagicBlock module that attaches DOM event listeners.
 * It translates HUD controls into service/runtime commands so the runtime and
 * adapters can focus on backend work.
 */
import { PublicKey } from "@solana/web3.js";
import type { HudController } from "../hud";
import type { MagicBlockAgentSessionService } from "./agent-session-service";
import type { MagicBlockNativeClientCore } from "./native-client-core";

const AGENT_DELEGATE_STORAGE_KEY = "open-wilds-agent-delegate";

type DomEventName = keyof HTMLElementEventMap;

/** Binds HUD DOM controls to MagicBlock commands and owns listener cleanup. */
export class MagicBlockControlBinder {
  private readonly disposers: Array<() => void> = [];

  constructor(
    private readonly hud: HudController,
    private readonly core: MagicBlockNativeClientCore,
    private readonly agentSession: MagicBlockAgentSessionService
  ) {}

  /** Attaches all supported MagicBlock control listeners. */
  bind() {
    this.on(this.hud.elements.airdropButton, "click", () => {
      void this.core.airdrop();
    });

    this.on(this.hud.elements.sleepButton, "click", () => {
      void this.core.sleepPlayer();
    });

    this.on(this.hud.elements.commitButton, "click", () => {
      void this.core.commitPlayerState();
    });

    for (const toggle of this.agentModeToggles()) {
      this.on(toggle, "change", (event) => {
        const enabled = (event.target as HTMLInputElement).checked;
        void (enabled
          ? this.agentSession.grant(
              this.currentAgentDelegateValue(),
              this.currentAgentSessionTransactionValue()
            )
          : this.agentSession.revoke(this.currentAgentDelegateValue()));
      });
    }

    for (const input of this.agentDelegateInputs()) {
      this.on(input, "input", () => {
        this.syncAgentDelegateInputs(input.value);
        const value = input.value.trim();
        if (value) {
          window.localStorage.setItem(AGENT_DELEGATE_STORAGE_KEY, value);
        } else {
          window.localStorage.removeItem(AGENT_DELEGATE_STORAGE_KEY);
        }
        void this.agentSession.refreshStatus(value);
      });
    }

    for (const input of this.agentSessionTransactionInputs()) {
      this.on(input, "input", () => {
        this.syncAgentSessionTransactionInputs(input.value);
      });
    }

    for (const button of this.agentRevokeButtons()) {
      this.on(button, "click", () => {
        void this.agentSession.revoke(this.currentAgentDelegateValue());
      });
    }

    for (const button of [
      this.hud.elements.mintPlayerButton,
      this.hud.elements.gateMintPlayerButton,
    ]) {
      this.on(button, "click", () => {
        void this.core.mintPlayerNft();
      });
    }

    for (const select of [
      this.hud.elements.playerNftSelect,
      this.hud.elements.gatePlayerNftSelect,
    ]) {
      this.on(select, "change", (event) => {
        const mint = (event.target as HTMLSelectElement).value;
        if (mint) {
          void this.core.selectPlayerNft(new PublicKey(mint));
        }
      });
    }

    this.on(this.hud.elements.resetButton, "click", () => {
      void this.core.resetSession();
    });
  }

  /** Removes every listener installed by `bind`. */
  dispose() {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
  }

  private on<TElement extends HTMLElement>(
    element: TElement | null,
    type: DomEventName,
    listener: (event: Event) => void
  ) {
    if (!element) {
      return;
    }

    element.addEventListener(type, listener);
    this.disposers.push(() => element.removeEventListener(type, listener));
  }

  private agentModeToggles() {
    return [
      this.hud.elements.agentModeToggle,
      this.hud.elements.gateAgentModeToggle,
    ].filter((input): input is HTMLInputElement => Boolean(input));
  }

  private agentDelegateInputs() {
    return [
      this.hud.elements.agentDelegateInput,
      this.hud.elements.gateAgentDelegateInput,
    ].filter((input): input is HTMLInputElement => Boolean(input));
  }

  private agentSessionTransactionInputs() {
    return [
      this.hud.elements.agentSessionTransactionInput,
      this.hud.elements.gateAgentSessionTransactionInput,
    ].filter((input): input is HTMLTextAreaElement => Boolean(input));
  }

  private agentRevokeButtons() {
    return [
      this.hud.elements.agentRevokeButton,
      this.hud.elements.gateAgentRevokeButton,
    ].filter((button): button is HTMLButtonElement => Boolean(button));
  }

  private syncAgentDelegateInputs(value: string) {
    for (const input of this.agentDelegateInputs()) {
      input.value = value;
    }
  }

  private syncAgentSessionTransactionInputs(value: string) {
    for (const input of this.agentSessionTransactionInputs()) {
      input.value = value;
    }
  }

  private currentAgentDelegateValue() {
    return (
      this.hud.elements.agentDelegateInput?.value.trim() ||
      this.hud.elements.gateAgentDelegateInput?.value.trim() ||
      ""
    );
  }

  private currentAgentSessionTransactionValue() {
    return (
      this.hud.elements.agentSessionTransactionInput?.value.trim() ||
      this.hud.elements.gateAgentSessionTransactionInput?.value.trim() ||
      ""
    );
  }
}
