// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { AlloDualClaim } from "../src/AlloDualClaim.sol";

interface INft {
    function ownerOf(uint256 tokenId) external view returns (address);
    function counter() external view returns (uint256);
}

contract AlloDualClaimTest is Test {
    address constant NFT = 0xcCf223a3Bb40173E1AB9262ad0d04C5bf3Ea32f5;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    uint256 constant WINDOW = 30 days;

    AlloDualClaim claim;
    IERC20 weth = IERC20(WETH);
    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address payoutA = makeAddr("payoutA");
    address payoutB = makeAddr("payoutB");

    // Real holder (EOA) discovered on the fork, with >= 3 seeded tokens.
    address holder;
    uint256[] holderTokens;

    function setUp() public {
        vm.createSelectFork(vm.envOr("ETH_RPC_URL", string("https://ethereum-rpc.publicnode.com")));

        claim = new AlloDualClaim(NFT, WETH, treasury, owner, block.timestamp + WINDOW);

        // Find an EOA that owns at least 3 tokens among the first minted ones,
        // and seed simple values for every token we touch.
        uint256 total = INft(NFT).counter();
        for (uint256 id = 1; id <= total && holderTokens.length < 3; id++) {
            address o = INft(NFT).ownerOf(id);
            if (o.code.length != 0) continue;
            if (holder == address(0)) {
                // count this owner's tokens first
                uint256 count;
                for (uint256 j = id; j <= total && count < 3; j++) {
                    if (INft(NFT).ownerOf(j) == o) count++;
                }
                if (count < 3) continue;
                holder = o;
            }
            if (o == holder) holderTokens.push(id);
        }
        require(holder != address(0) && holderTokens.length == 3, "no suitable holder on fork");
        vm.deal(holder, 1 ether);

        uint256[] memory values = new uint256[](3);
        values[0] = 0.1 ether;
        values[1] = 0.2 ether;
        values[2] = 0.3 ether;
        vm.prank(owner);
        claim.setTokenValues(holderTokens, values);

        vm.startPrank(owner);
        claim.registerProject("Project A", "DeFi", "First test project", payoutA);
        claim.registerProject("Project B", "Climate", "Second test project", payoutB);
        vm.stopPrank();

        // Fund the pool: the Safe holds WETH and approves the contract for
        // exactly the seeded total. The contract itself never holds anything.
        deal(WETH, treasury, 0.6 ether);
        vm.prank(treasury);
        weth.approve(address(claim), 0.6 ether);
    }

    function _dests(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory d) {
        d = new uint256[](3);
        d[0] = a;
        d[1] = b;
        d[2] = c;
    }

    // ------------------------------------------------------- funding & pool

    function test_PoolFunded() public view {
        assertEq(weth.balanceOf(address(claim)), 0, "contract holds nothing");
        assertEq(weth.allowance(treasury, address(claim)), 0.6 ether);
        assertEq(claim.available(), 0.6 ether);
        assertEq(claim.outstandingLiability(), 0.6 ether);
    }

    function test_Available_IsMinOfBalanceAndAllowance() public {
        // allowance 0.6, balance dropped to 0.4 -> balance binds
        deal(WETH, treasury, 0.4 ether);
        assertEq(claim.available(), 0.4 ether);

        // balance back up, allowance cut to 0.2 -> allowance binds
        deal(WETH, treasury, 1 ether);
        vm.prank(treasury);
        weth.approve(address(claim), 0.2 ether);
        assertEq(claim.available(), 0.2 ether);
    }

    function test_Constructor_RevertPastDeadline() public {
        vm.expectRevert(abi.encodeWithSelector(AlloDualClaim.InvalidWindow.selector, block.timestamp));
        new AlloDualClaim(NFT, WETH, treasury, owner, block.timestamp);
    }

    function test_Constructor_RevertZeroTreasury() public {
        vm.expectRevert(AlloDualClaim.InvalidTreasury.selector);
        new AlloDualClaim(NFT, WETH, address(0), owner, block.timestamp + WINDOW);
    }

    // ---------------------------------------------------------------- claim

    function test_Claim_MixedRefundAndTwoProjects() public {
        uint256 treasuryBefore = weth.balanceOf(treasury);
        uint256 holderBefore = weth.balanceOf(holder);

        vm.prank(holder);
        claim.claim(holderTokens, _dests(0, 1, 2));

        assertEq(weth.balanceOf(holder), holderBefore + 0.1 ether, "refund received");
        assertEq(weth.balanceOf(payoutA), 0.2 ether, "project A funded");
        assertEq(weth.balanceOf(payoutB), 0.3 ether, "project B funded");
        assertEq(weth.balanceOf(treasury), treasuryBefore - 0.6 ether, "Safe debited exactly");
        assertEq(weth.allowance(treasury, address(claim)), 0, "allowance consumed exactly");
        assertEq(weth.balanceOf(address(claim)), 0, "contract never holds funds");

        assertTrue(claim.redeemed(holderTokens[0]));
        assertTrue(claim.redeemed(holderTokens[1]));
        assertTrue(claim.redeemed(holderTokens[2]));
        assertEq(claim.getProject(1).raised, 0.2 ether);
        assertEq(claim.getProject(2).raised, 0.3 ether);
        assertEq(claim.totalClaimed(), 0.6 ether);
        assertEq(claim.outstandingLiability(), 0);
    }

    function test_Claim_EmitsEvents() public {
        vm.expectEmit(true, true, true, true);
        emit AlloDualClaim.TokenRedeemed(holderTokens[0], holder, 0, 0.1 ether);
        vm.expectEmit(true, true, true, true);
        emit AlloDualClaim.TokenRedeemed(holderTokens[1], holder, 1, 0.2 ether);
        vm.expectEmit(true, true, true, true);
        emit AlloDualClaim.TokenRedeemed(holderTokens[2], holder, 2, 0.3 ether);
        vm.expectEmit(true, true, true, true);
        emit AlloDualClaim.ProjectFunded(1, holder, payoutA, 0.2 ether);
        vm.expectEmit(true, true, true, true);
        emit AlloDualClaim.ProjectFunded(2, holder, payoutB, 0.3 ether);
        vm.expectEmit(true, true, true, true);
        emit AlloDualClaim.ClaimExecuted(holder, 3, 0.1 ether, 0.5 ether);

        vm.prank(holder);
        claim.claim(holderTokens, _dests(0, 1, 2));
    }

    function test_Claim_RevertDoubleClaim() public {
        vm.startPrank(holder);
        claim.claim(holderTokens, _dests(0, 1, 2));
        vm.expectRevert(abi.encodeWithSelector(AlloDualClaim.AlreadyRedeemed.selector, holderTokens[0]));
        claim.claim(holderTokens, _dests(0, 1, 2));
        vm.stopPrank();
    }

    function test_Claim_RevertDuplicateIdsInOneCall() public {
        uint256[] memory ids = new uint256[](2);
        ids[0] = holderTokens[0];
        ids[1] = holderTokens[0];
        uint256[] memory dests = new uint256[](2);

        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(AlloDualClaim.AlreadyRedeemed.selector, holderTokens[0]));
        claim.claim(ids, dests);
    }

    function test_Claim_RevertNotTokenOwner() public {
        address stranger = makeAddr("stranger");
        uint256[] memory ids = new uint256[](1);
        ids[0] = holderTokens[0];
        uint256[] memory dests = new uint256[](1);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AlloDualClaim.NotTokenOwner.selector, holderTokens[0]));
        claim.claim(ids, dests);
    }

    function test_Claim_RevertUnseededToken() public {
        // Find another token of the same holder beyond the three seeded ones.
        uint256 total = INft(NFT).counter();
        uint256 unseeded;
        for (uint256 id = 1; id <= total; id++) {
            if (INft(NFT).ownerOf(id) == holder && claim.tokenValue(id) == 0) {
                unseeded = id;
                break;
            }
        }
        vm.skip(unseeded == 0); // holder owns exactly 3 tokens on this fork

        uint256[] memory ids = new uint256[](1);
        ids[0] = unseeded;
        uint256[] memory dests = new uint256[](1);

        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(AlloDualClaim.TokenNotSeeded.selector, unseeded));
        claim.claim(ids, dests);
    }

    function test_Claim_RevertInactiveProject() public {
        vm.prank(owner);
        claim.setProjectActive(1, false);

        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(AlloDualClaim.InvalidProject.selector, 1));
        claim.claim(holderTokens, _dests(0, 1, 2));
    }

    function test_Claim_RevertOutOfRangeProject() public {
        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(AlloDualClaim.InvalidProject.selector, 99));
        claim.claim(holderTokens, _dests(0, 99, 2));
    }

    function test_Claim_RevertEmptyAndMismatched() public {
        vm.startPrank(holder);
        vm.expectRevert(AlloDualClaim.EmptyClaim.selector);
        claim.claim(new uint256[](0), new uint256[](0));
        vm.expectRevert(AlloDualClaim.LengthMismatch.selector);
        claim.claim(holderTokens, new uint256[](1));
        vm.stopPrank();
    }

    function test_Claim_RevertWhenPaused_UnpauseResumes() public {
        vm.prank(owner);
        claim.pause();

        vm.prank(holder);
        vm.expectRevert();
        claim.claim(holderTokens, _dests(0, 0, 0));

        vm.prank(owner);
        claim.unpause();

        vm.prank(holder);
        claim.claim(holderTokens, _dests(0, 0, 0));
        assertTrue(claim.redeemed(holderTokens[0]));
    }

    function test_Claim_RevertWhenAllowanceTooLow() public {
        vm.prank(treasury);
        weth.approve(address(claim), 0.1 ether); // no longer covers the 0.6 WETH claim

        vm.prank(holder);
        vm.expectRevert(); // WETH reverts inside transferFrom
        claim.claim(holderTokens, _dests(0, 1, 2));
    }

    function test_Claim_RevertWhenSafeBalanceTooLow() public {
        deal(WETH, treasury, 0.1 ether); // allowance stands but the Safe can't cover it

        vm.prank(holder);
        vm.expectRevert();
        claim.claim(holderTokens, _dests(0, 1, 2));
    }

    // --------------------------------------------------------------- window

    function test_Claim_RevertAfterWindowCloses() public {
        vm.warp(claim.closesAt());
        vm.prank(holder);
        vm.expectRevert(AlloDualClaim.WindowClosed.selector);
        claim.claim(holderTokens, _dests(0, 1, 2));
    }

    function test_ExtendWindow_ReopensClaims() public {
        uint256 oldClose = claim.closesAt();
        vm.warp(oldClose);

        vm.expectEmit(true, true, true, true);
        emit AlloDualClaim.WindowExtended(oldClose + 30 days);
        vm.prank(owner);
        claim.extendWindow(oldClose + 30 days);

        vm.prank(holder);
        claim.claim(holderTokens, _dests(0, 0, 0));
        assertTrue(claim.redeemed(holderTokens[0]));
    }

    function test_ExtendWindow_RevertShorten() public {
        uint256 oldClose = claim.closesAt();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AlloDualClaim.InvalidWindow.selector, oldClose - 1));
        claim.extendWindow(oldClose - 1);
    }

    function test_ExtendWindow_OnlyOwner() public {
        vm.prank(holder);
        vm.expectRevert();
        claim.extendWindow(block.timestamp + 365 days);
    }

    // ------------------------------------------------------------- treasury

    function test_SetTreasury_ClaimsPullFromNewSafe() public {
        address treasury2 = makeAddr("treasury2");
        deal(WETH, treasury2, 1 ether);
        vm.prank(treasury2);
        weth.approve(address(claim), 1 ether);

        vm.expectEmit(true, true, true, true);
        emit AlloDualClaim.TreasurySet(treasury2);
        vm.prank(owner);
        claim.setTreasury(treasury2);

        uint256 holderBefore = weth.balanceOf(holder);
        vm.prank(holder);
        claim.claim(holderTokens, _dests(0, 0, 0));
        assertEq(weth.balanceOf(holder), holderBefore + 0.6 ether);
        assertEq(weth.balanceOf(treasury2), 0.4 ether, "new Safe debited");
        assertEq(weth.balanceOf(treasury), 0.6 ether, "old Safe untouched");
    }

    function test_SetTreasury_OnlyOwner() public {
        vm.prank(holder);
        vm.expectRevert();
        claim.setTreasury(holder);
    }

    function test_SetTreasury_RevertZero() public {
        vm.prank(owner);
        vm.expectRevert(AlloDualClaim.InvalidTreasury.selector);
        claim.setTreasury(address(0));
    }

    // ---------------------------------------------------------------- admin

    function test_SetTokenValues_OnlyOwner() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = holderTokens[0];
        uint256[] memory values = new uint256[](1);
        values[0] = 1 ether;

        vm.prank(holder);
        vm.expectRevert();
        claim.setTokenValues(ids, values);
    }

    function test_SetTokenValues_RevertLengthMismatch() public {
        vm.prank(owner);
        vm.expectRevert(AlloDualClaim.LengthMismatch.selector);
        claim.setTokenValues(new uint256[](2), new uint256[](1));
    }

    function test_SetTokenValues_RevertOnRedeemedToken() public {
        vm.prank(holder);
        claim.claim(holderTokens, _dests(0, 0, 0));

        uint256[] memory ids = new uint256[](1);
        ids[0] = holderTokens[0];
        uint256[] memory values = new uint256[](1);
        values[0] = 1 ether;

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AlloDualClaim.AlreadyRedeemed.selector, holderTokens[0]));
        claim.setTokenValues(ids, values);
    }

    function test_SetTokenValues_SeededAccounting() public {
        assertEq(claim.totalSeeded(), 0.6 ether);

        // Re-seed token 0 from 0.1 to 0.5 ether (and raise funding to match).
        uint256[] memory ids = new uint256[](1);
        ids[0] = holderTokens[0];
        uint256[] memory values = new uint256[](1);
        values[0] = 0.5 ether;
        vm.prank(owner);
        claim.setTokenValues(ids, values);
        assertEq(claim.totalSeeded(), 1 ether);
        assertEq(claim.tokenValue(holderTokens[0]), 0.5 ether);
        deal(WETH, treasury, 1 ether);
        vm.prank(treasury);
        weth.approve(address(claim), 1 ether);

        vm.prank(holder);
        claim.claim(holderTokens, _dests(0, 0, 0));
        assertEq(claim.totalSeeded(), 0);
        assertEq(claim.totalClaimed(), 1 ether);
    }

    function test_Projects_RegisterUpdateDeactivate() public {
        assertEq(claim.projectCount(), 2);
        AlloDualClaim.Project[] memory ps = claim.getProjects();
        assertEq(ps.length, 2);
        assertEq(ps[0].name, "Project A");
        assertEq(ps[0].payout, payoutA);
        assertTrue(ps[0].active);

        vm.prank(owner);
        claim.updateProject(1, "Project A2", "Energy", "Updated", payoutB);
        AlloDualClaim.Project memory p = claim.getProject(1);
        assertEq(p.name, "Project A2");
        assertEq(p.payout, payoutB);

        vm.prank(owner);
        claim.setProjectActive(1, false);
        assertFalse(claim.getProject(1).active);

        vm.prank(holder);
        vm.expectRevert();
        claim.registerProject("Nope", "x", "not owner", payoutA);
    }

    function test_ValuesOfView() public view {
        (uint256[] memory values, bool[] memory flags) = claim.valuesOf(holderTokens);
        assertEq(values[0], 0.1 ether);
        assertEq(values[1], 0.2 ether);
        assertEq(values[2], 0.3 ether);
        assertFalse(flags[0]);
    }
}
