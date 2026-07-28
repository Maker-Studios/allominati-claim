// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { AlloDualClaim } from "../src/AlloDualClaim.sol";

/**
 * Mainnet deployment — one broadcast does the whole ceremony:
 * deploy (deployer as interim owner), seed all token values from
 * data/token-values.json in a single transaction, then hand ownership
 * to CLAIM_OWNER. The cold owner key never signs a seeding tx.
 *
 *   cd contracts && CLAIM_OWNER=0x... CLAIM_CLOSES_AT=<unix ts> \
 *     forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url $ETH_RPC_URL --broadcast --private-key $DEPLOYER_KEY --verify
 *
 * The contract never holds funds: claims pull WETH straight from the
 * treasury Safe. Go-live is the Safe wrapping enough ETH and approving the
 * deployed address for exactly totalSeeded() WETH. No module, no Zodiac —
 * the allowance caps exposure, and revoking it shuts claims down.
 */
contract Deploy is Script {
    address constant NFT = 0xcCf223a3Bb40173E1AB9262ad0d04C5bf3Ea32f5;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant SAFE = 0x82105Ebf24D92A5F4879789B11116f64D941F719;

    function run() external {
        address finalOwner = vm.envAddress("CLAIM_OWNER");
        uint256 closesAt = vm.envUint("CLAIM_CLOSES_AT");

        // Load the pro-rated values (skip unseeded admin mints).
        string memory json = vm.readFile("data/token-values.json");
        string[] memory keys = vm.parseJsonKeys(json, "$");
        uint256[] memory ids = new uint256[](keys.length);
        uint256[] memory values = new uint256[](keys.length);
        uint256 n;
        uint256 sum;
        for (uint256 i = 0; i < keys.length; i++) {
            uint256 value = vm.parseUint(vm.parseJsonString(json, string.concat(".", keys[i])));
            if (value == 0) continue;
            ids[n] = vm.parseUint(keys[i]);
            values[n] = value;
            sum += value;
            n++;
        }
        assembly {
            mstore(ids, n)
            mstore(values, n)
        }

        vm.startBroadcast();
        (, address deployer, ) = vm.readCallers();
        AlloDualClaim claim = new AlloDualClaim(NFT, WETH, SAFE, deployer, closesAt);
        claim.setTokenValues(ids, values);
        claim.transferOwnership(finalOwner);
        vm.stopBroadcast();

        require(claim.totalSeeded() == sum, "seeded total mismatch");
        require(claim.owner() == finalOwner, "ownership not transferred");

        console.log("AlloDualClaim deployed at", address(claim));
        console.log("  seeded tokens:", n);
        console.log("  totalSeeded (wei):", sum);
        console.log("  owner:", finalOwner);
        console.log("  treasury Safe:", SAFE);
        console.log("  window closes at:", closesAt);
        console.log("Next: go live from the Safe - wrap totalSeeded wei into WETH (deposit),");
        console.log("then approve the deployed address for exactly totalSeeded WETH.");
    }
}
