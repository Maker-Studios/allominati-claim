// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * Dev-fork only — never deployed to mainnet.
 *
 * Impersonated accounts have no private key, so they can't produce an EOA
 * signature for the send-off flow. `scripts/setup-anvil.ts` etches this
 * contract's runtime code onto each impersonation account instead: the app
 * signs with anvil's well-known dev key, and ERC-1271 verification against
 * the fork accepts it — the backend verifies impersonated messages through
 * the exact same code path as real wallets.
 */
contract DevSigner1271 {
    /// anvil dev account 0 — its key is public knowledge.
    address internal constant DEV_SIGNER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    bytes4 internal constant MAGIC = 0x1626ba7e; // ERC-1271 isValidSignature selector

    function isValidSignature(bytes32 hash, bytes calldata signature) external pure returns (bytes4) {
        if (signature.length != 65) return 0xffffffff;
        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        return ecrecover(hash, v, r, s) == DEV_SIGNER ? MAGIC : bytes4(0xffffffff);
    }
}
