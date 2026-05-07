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
NO_DNA=1 solana program show g9Y3zHKWC9kJ9CYLQuDkZP7qVwhh6yu2swhxrXn7sVn --url "${RPC_URL}"
NO_DNA=1 solana program show HPVrKGMFzX1VSFkEXU5sf9uZZ5bwqJW1jHkrdFgRGFZg --url "${RPC_URL}"
NO_DNA=1 solana program show CbYVrUkZDrFRCBFA6HNNrQtzNgXP111zKqKpMy6KyhYQ --url "${RPC_URL}"
NO_DNA=1 solana program show G6qkktc5oWkPHFmhk8x3UwzZ5WuQLE5En7PGteko6mhK --url "${RPC_URL}"
NO_DNA=1 solana program show 5hCo8uVeWtjqmeFQAovyLFuW1vZ4wS3kKP7ms7SUyyqk --url "${RPC_URL}"
NO_DNA=1 solana program show pVHBNGmKR8BtfokRF1gsS8t766ukFdqn6cV1hY9tMP5 --url "${RPC_URL}"
NO_DNA=1 solana program show AHpcKdhujpiTq8oGbxbCknEfmQQwya6cmvywFL89iZUs --url "${RPC_URL}"
NO_DNA=1 solana program show C4s2BjhFdGsBN5JTQ88FdQQUoqWMuRKWtwYupzSyd5vB --url "${RPC_URL}"
NO_DNA=1 solana program show B9qCeXFe5431no3DTZQdZjexyG1cCep1yHjZrxm5c2AM --url "${RPC_URL}"
NO_DNA=1 solana program show 9HUAZDNqjGrk2jVaQBx95hUFhdkb1vbKq6PDtsoybsLu --url "${RPC_URL}"
NO_DNA=1 solana program show DBfTvysc3GQVoazLgbwLr2yqjs8msjaco9q8fgTaLUTy --url "${RPC_URL}"
NO_DNA=1 solana program show EnjiFX1GJCZXWUAxRFYTbQrDHGdKSi3485EVB5xy2dUa --url "${RPC_URL}"
