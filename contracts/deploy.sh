#!/bin/bash
export PATH="$HOME/.foundry/bin:$PATH"
cd /mnt/g/Concord/Concord/contracts

echo "=== DEPLOYING TO BASE SEPOLIA ==="
forge script script/Deploy.s.sol \
  --rpc-url https://sepolia.base.org \
  --private-key 0x02dfb78d6c331a4287c902592ead879aa27de6a559879af670e7bffa29ce96a9 \
  --broadcast \
  --chain-id 84532 \
  2>&1

echo "DEPLOY_EXIT_CODE: $?"
echo "=== DONE ==="
