#!/usr/bin/env sh
set -eu

RPC_URL="${RPC_URL:-http://127.0.0.1:8899}"
AIRDROP_SOL="${AIRDROP_SOL:-20}"

echo "Using localnet RPC: ${RPC_URL}"
echo "Using deployer: $(solana address)"

NO_DNA=1 solana cluster-version --url "${RPC_URL}"
NO_DNA=1 solana airdrop "${AIRDROP_SOL}" --url "${RPC_URL}"
NO_DNA=1 anchor build
NO_DNA=1 anchor deploy --provider.cluster "${RPC_URL}"

echo "Deployed programs:"
NO_DNA=1 solana program show Dv88ch6oXorTqWcZxw5C8VPH5jiWagDJgWd8fvBmXzc6 --url "${RPC_URL}"
NO_DNA=1 solana program show 7ebGfNj5knjG33XBSUdfYAYtXsner8rQzLYSFuURSicZ --url "${RPC_URL}"
NO_DNA=1 solana program show EXfYuzbCqe3VoUrG37gvkhxMmCMBKfvj5DRodsjmG6Pg --url "${RPC_URL}"
NO_DNA=1 solana program show pVHBNGmKR8BtfokRF1gsS8t766ukFdqn6cV1hY9tMP5 --url "${RPC_URL}"
