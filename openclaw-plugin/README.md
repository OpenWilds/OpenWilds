# Open Wilds OpenClaw Plugin

OpenClaw plugin for delegated Open Wilds agents. The plugin loads an agent
keypair, discovers active `PlayerSession` accounts granted to that key, reads
Open Wilds state, and sends gameplay transactions to the MagicBlock ER.

## Tools

- `open_wilds_agent_setup`: create or load the local agent keypair and return
  the public key to paste into the game UI.
- `open_wilds_agent_status`: check keypair, manifest, RPC config, and granted
  sessions.
- `open_wilds_list_players`: list delegated players for the agent wallet.
- `open_wilds_get_player_state`: read player position, energy, action state,
  inventory, nearby tiles, and session scopes.
- `open_wilds_move`: move the delegated player.
- `open_wilds_sleep`: recover player energy.
- `open_wilds_farm_action`: run `till`, `water`, `plant`, `harvest`, or `chop`.
- `open_wilds_inventory_action`: `grab` or `drop` tile items.
- `open_wilds_trade_or_spend`: reports trade/spend readiness. The gameplay
  systems are delegate-ready; trade finalization still needs delegate signer
  support in the Open Wilds trade instructions.
- `open_wilds_play_turn`: simple autonomous turn: sleeps when low energy,
  otherwise moves one tile east.

## Config

Set plugin config under `plugins.entries.open-wilds.config`:

```json
{
  "agentKeypairPath": "/Users/you/.config/open-wilds/openclaw-agent.json",
  "baseRpcUrl": "http://127.0.0.1:8899",
  "erRpcUrl": "http://127.0.0.1:7799",
  "worldManifestPathOrUrl": "/Users/you/Projects/solana/open-wilds/app/public/game-world.localnet.json",
  "defaultPlayerMint": "optional-player-mint"
}
```

After configuring the path, ask OpenClaw to run:

```text
Use open_wilds_agent_setup with createIfMissing=true.
```

The tool creates the keypair with `0600` file permissions and returns only the
public key. Paste that public key into the in-game Agent Mode panel and grant
`Full control`.

## Local Install

From the Open Wilds repo root:

```bash
cd openclaw-plugin
npm install
npm run build
cd ..
openclaw plugins install ./openclaw-plugin
openclaw plugins enable open-wilds
openclaw gateway restart
openclaw plugins inspect open-wilds --runtime --json
```

## Demo Checklist

```bash
pnpm localnet:validator
pnpm localnet:deploy
pnpm localnet:provision-world
pnpm dev
```

Then mint/select a player, grant Agent Mode to the OpenClaw key, and ask
OpenClaw to run:

```text
Use open_wilds_agent_setup, then open_wilds_agent_status, then open_wilds_list_players, then open_wilds_get_player_state, then open_wilds_play_turn.
```

## Notes

- The plugin signs with the agent keypair, not the player wallet.
- `open_wilds_agent_setup` never returns the secret key. It writes the secret
  key to the configured local file path only.
- Transactions are routed to the configured ER RPC with `skipPreflight: true`.
- The `PlayerSession` account must be visible to the ER for delegate checks to
  pass there. For dev demos, make sure session/permission sync is included in
  the deployment flow before relying on ER-only execution.
