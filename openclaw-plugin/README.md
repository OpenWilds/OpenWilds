# Open Wilds OpenClaw Plugin

Minimal native OpenClaw plugin for Open Wilds.

This first version registers one read-only tool:

- `open_wilds_get_game_state`: returns static sample game state JSON.

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

## GitHub Install

For the hackathon path, push the Open Wilds repo to GitHub with this
`openclaw-plugin` folder and the repo-root `marketplace.json`.

Then users can install from the GitHub marketplace source:

```bash
openclaw plugins install open-wilds --marketplace <owner>/<repo>
openclaw plugins enable open-wilds
openclaw gateway restart
openclaw plugins inspect open-wilds --runtime --json
```

## Development

```bash
cd openclaw-plugin
npm install
npm run build
npm run typecheck
```

The next wiring step is to replace the static sample state with a real Open Wilds game-state adapter.
