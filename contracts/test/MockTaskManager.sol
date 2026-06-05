// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

contract MockTaskManager is ITaskManager {
    mapping(uint256 => mapping(address => bool)) private allowed;
    mapping(uint256 => bool) private globallyAllowed;

    function createTask(
        uint8 returnType,
        FunctionId funcId,
        uint256[] memory encryptedInputs,
        uint256[] memory extraInputs
    ) external override returns (uint256) {
        if (funcId == FunctionId.trivialEncrypt) {
            if (returnType == 0) { // ebool (Utils.EBOOL_TFHE = 0)
                return extraInputs[0] == 1 ? 1 : 2;
            }
            return extraInputs[0];
        }
        if (funcId == FunctionId.select) {
            uint256 control = encryptedInputs[0];
            uint256 ifTrue = encryptedInputs[1];
            uint256 ifFalse = encryptedInputs[2];
            return control == 1 ? ifTrue : ifFalse;
        }
        if (funcId == FunctionId.gte) {
            uint256 lhs = encryptedInputs[0];
            uint256 rhs = encryptedInputs[1];
            return lhs >= rhs ? 1 : 2;
        }
        if (funcId == FunctionId.add) {
            uint256 lhs = encryptedInputs[0];
            uint256 rhs = encryptedInputs[1];
            return lhs + rhs;
        }
        if (funcId == FunctionId.div) {
            uint256 lhs = encryptedInputs[0];
            uint256 rhs = encryptedInputs[1];
            return lhs / rhs;
        }
        if (funcId == FunctionId.or) {
            uint256 lhs = encryptedInputs[0];
            uint256 rhs = encryptedInputs[1];
            return (lhs == 1 || rhs == 1) ? 1 : 2;
        }
        if (funcId == FunctionId.and) {
            uint256 lhs = encryptedInputs[0];
            uint256 rhs = encryptedInputs[1];
            return (lhs == 1 && rhs == 1) ? 1 : 2;
        }
        if (funcId == FunctionId.not) {
            uint256 val = encryptedInputs[0];
            return val == 1 ? 2 : 1;
        }
        return 0;
    }

    function createRandomTask(
        uint8 returnType,
        uint256 seed,
        int32 securityZone
    ) external override returns (uint256) {
        return uint256(keccak256(abi.encodePacked(seed, securityZone)));
    }

    function createDecryptTask(uint256 ctHash, address requestor) external override {}

    function verifyInput(
        EncryptedInput memory input,
        address sender
    ) external override returns (uint256) {
        return input.ctHash;
    }

    function allow(uint256 ctHash, address account) external override {
        allowed[ctHash][account] = true;
    }

    function isAllowed(uint256 ctHash, address account) external view override returns (bool) {
        return allowed[ctHash][account] || globallyAllowed[ctHash];
    }

    function isPubliclyAllowed(uint256 ctHash) external view override returns (bool) {
        return globallyAllowed[ctHash];
    }

    function allowGlobal(uint256 ctHash) external override {
        globallyAllowed[ctHash] = true;
    }

    function allowTransient(uint256 ctHash, address account) external override {
        allowed[ctHash][account] = true;
    }

    function getDecryptResultSafe(uint256 ctHash) external view override returns (uint256, bool) {
        return (ctHash, true);
    }

    function getDecryptResult(uint256 ctHash) external view override returns (uint256) {
        return ctHash;
    }

    function publishDecryptResult(uint256 ctHash, uint256 result, bytes calldata signature) external override {}

    function publishDecryptResultBatch(
        uint256[] calldata ctHashes,
        uint256[] calldata results,
        bytes[] calldata signatures
    ) external override {}

    function verifyDecryptResult(
        uint256 ctHash,
        uint256 result,
        bytes calldata signature
    ) external view override returns (bool) {
        return true;
    }

    function verifyDecryptResultSafe(
        uint256 ctHash,
        uint256 result,
        bytes calldata signature
    ) external view override returns (bool) {
        return true;
    }

    function verifyDecryptResultBatch(
        uint256[] calldata ctHashes,
        uint256[] calldata results,
        bytes[] calldata signatures
    ) external view override returns (bool) {
        return true;
    }

    function verifyDecryptResultBatchSafe(
        uint256[] calldata ctHashes,
        uint256[] calldata results,
        bytes[] calldata signatures
    ) external view override returns (bool[] memory) {
        bool[] memory res = new bool[](ctHashes.length);
        for (uint256 i = 0; i < ctHashes.length; i++) {
            res[i] = true;
        }
        return res;
    }
}
