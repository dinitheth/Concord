#!/bin/bash
export PATH="$HOME/.foundry/bin:$PATH"
cd /mnt/g/Concord/Concord/contracts

echo "=== PWD ==="
pwd

echo "=== SRC ==="
ls -la src/

echo "=== LIB ==="
ls lib/

echo "=== FOUNDRY.TOML ==="
cat foundry.toml

echo "=== REMAPPINGS ==="
cat remappings.txt

echo "=== BUILDING ==="
forge build --force 2>&1
BUILD_EXIT=$?
echo "BUILD_EXIT_CODE: $BUILD_EXIT"

echo "=== OUT DIR ==="
ls -la out/ 2>&1

echo "=== DONE ==="
