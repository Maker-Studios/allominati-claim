// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IERC721Minimal {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * Dual-claim redemption for the soulbound AlloPatronNFT.
 *
 * The NFT cannot be transferred or burned, so redemption is tracked here:
 * each tokenId can be redeemed exactly once by its current owner, for an
 * owner-seeded value. Redeemed value is either refunded to the holder or
 * routed to admin-registered projects.
 *
 * The contract never holds funds. Claims are paid in `token` (WETH) pulled
 * straight from the treasury Safe via an ERC-20 allowance the Safe grants
 * this contract: approving `totalSeeded` is the go-live switch, the
 * allowance caps exposure at exactly what was approved, and revoking it
 * after the window closes takes the place of sweeping leftovers.
 * Claims are open until `closesAt`, which the owner can only ever extend,
 * never shorten.
 */
contract AlloDualClaim is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Project {
        string name;
        string tag;
        string description;
        address payout;
        uint256 raised;
        bool active;
    }

    IERC721Minimal public immutable nft;
    /// Redemption asset (WETH) — every claim is paid in this token.
    IERC20 public immutable token;
    /// Safe that claims pull from; must hold and approve the token.
    address public treasury;

    /// Claims revert at/after this timestamp.
    uint256 public closesAt;

    // projectId is 1-based (index + 1); destination 0 means refund.
    Project[] internal _projects;

    mapping(uint256 tokenId => uint256) public tokenValue;
    mapping(uint256 tokenId => bool) public redeemed;

    /// Sum of seeded values of not-yet-redeemed tokens.
    uint256 public totalSeeded;
    /// Sum of token paid out by claims.
    uint256 public totalClaimed;

    event ProjectRegistered(uint256 indexed projectId, string name, address payout);
    event ProjectUpdated(uint256 indexed projectId, string name, address payout);
    event ProjectActiveSet(uint256 indexed projectId, bool active);
    event TokenValueSet(uint256 indexed tokenId, uint256 value);
    event TokenRedeemed(uint256 indexed tokenId, address indexed claimer, uint256 indexed destination, uint256 value);
    event ProjectFunded(uint256 indexed projectId, address indexed claimer, address payout, uint256 amount);
    event ClaimExecuted(address indexed claimer, uint256 tokenCount, uint256 refundTotal, uint256 investedTotal);
    event TreasurySet(address indexed treasury);
    event WindowExtended(uint256 closesAt);

    error LengthMismatch();
    error EmptyClaim();
    error NotTokenOwner(uint256 tokenId);
    error AlreadyRedeemed(uint256 tokenId);
    error TokenNotSeeded(uint256 tokenId);
    error InvalidProject(uint256 destination);
    error InvalidPayout();
    error InvalidTreasury();
    error InvalidWindow(uint256 closesAt);
    error WindowClosed();

    constructor(address nft_, address token_, address treasury_, address owner_, uint256 closesAt_) Ownable(owner_) {
        if (closesAt_ <= block.timestamp) revert InvalidWindow(closesAt_);
        if (treasury_ == address(0)) revert InvalidTreasury();
        nft = IERC721Minimal(nft_);
        token = IERC20(token_);
        treasury = treasury_;
        closesAt = closesAt_;
        emit TreasurySet(treasury_);
    }

    // ---------------------------------------------------------------- admin

    function registerProject(
        string calldata name,
        string calldata tag,
        string calldata description,
        address payout
    ) external onlyOwner returns (uint256 projectId) {
        if (payout == address(0)) revert InvalidPayout();
        _projects.push(
            Project({ name: name, tag: tag, description: description, payout: payout, raised: 0, active: true })
        );
        projectId = _projects.length;
        emit ProjectRegistered(projectId, name, payout);
    }

    function updateProject(
        uint256 projectId,
        string calldata name,
        string calldata tag,
        string calldata description,
        address payout
    ) external onlyOwner {
        Project storage p = _project(projectId);
        if (payout == address(0)) revert InvalidPayout();
        p.name = name;
        p.tag = tag;
        p.description = description;
        p.payout = payout;
        emit ProjectUpdated(projectId, name, payout);
    }

    function setProjectActive(uint256 projectId, bool active) external onlyOwner {
        _project(projectId).active = active;
        emit ProjectActiveSet(projectId, active);
    }

    /**
     * Seed (or correct) redeemable values. Values are derived off-chain by
     * replaying the NFT's bonding curve (pro-rated to the funded pool);
     * admin-minted tokens paid nothing and stay at 0 (unclaimable) unless
     * explicitly overridden here.
     */
    function setTokenValues(uint256[] calldata tokenIds, uint256[] calldata values) external onlyOwner {
        uint256 n = tokenIds.length;
        if (n != values.length) revert LengthMismatch();
        for (uint256 i = 0; i < n; i++) {
            uint256 id = tokenIds[i];
            if (redeemed[id]) revert AlreadyRedeemed(id);
            totalSeeded = totalSeeded - tokenValue[id] + values[i];
            tokenValue[id] = values[i];
            emit TokenValueSet(id, values[i]);
        }
    }

    /// Point claims at a new funding Safe (the new Safe must re-approve).
    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert InvalidTreasury();
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    /// The window is a promise to holders: it can be extended, never shortened.
    function extendWindow(uint256 newClosesAt) external onlyOwner {
        if (newClosesAt <= closesAt) revert InvalidWindow(newClosesAt);
        closesAt = newClosesAt;
        emit WindowExtended(newClosesAt);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ----------------------------------------------------------------- user

    /**
     * Redeem a set of owned tokens in one transaction.
     * @param tokenIds tokens to redeem (each exactly once, ever)
     * @param dests    parallel destinations: 0 = refund to caller,
     *                 otherwise a 1-based id of an active project
     */
    function claim(uint256[] calldata tokenIds, uint256[] calldata dests) external nonReentrant whenNotPaused {
        if (block.timestamp >= closesAt) revert WindowClosed();
        uint256 n = tokenIds.length;
        if (n == 0) revert EmptyClaim();
        if (n != dests.length) revert LengthMismatch();

        uint256 projectCount_ = _projects.length;
        uint256[] memory investByProject = new uint256[](projectCount_ + 1);
        uint256 refundTotal;
        uint256 investedTotal;

        // Effects: mark everything redeemed and tally before any token moves.
        for (uint256 i = 0; i < n; i++) {
            uint256 id = tokenIds[i];
            uint256 dest = dests[i];

            if (nft.ownerOf(id) != msg.sender) revert NotTokenOwner(id);
            if (redeemed[id]) revert AlreadyRedeemed(id); // also catches duplicates within tokenIds
            uint256 value = tokenValue[id];
            if (value == 0) revert TokenNotSeeded(id);

            redeemed[id] = true;
            totalSeeded -= value;

            if (dest == 0) {
                refundTotal += value;
            } else {
                if (dest > projectCount_ || !_projects[dest - 1].active) revert InvalidProject(dest);
                investByProject[dest] += value;
                investedTotal += value;
            }
            emit TokenRedeemed(id, msg.sender, dest, value);
        }

        for (uint256 pid = 1; pid <= projectCount_; pid++) {
            uint256 amount = investByProject[pid];
            if (amount > 0) _projects[pid - 1].raised += amount;
        }
        totalClaimed += refundTotal + investedTotal;

        // Interactions: pull each recipient's share straight from the Safe.
        if (refundTotal > 0) _send(msg.sender, refundTotal);
        for (uint256 pid = 1; pid <= projectCount_; pid++) {
            uint256 amount = investByProject[pid];
            if (amount > 0) {
                address payout = _projects[pid - 1].payout;
                _send(payout, amount);
                emit ProjectFunded(pid, msg.sender, payout, amount);
            }
        }

        emit ClaimExecuted(msg.sender, n, refundTotal, investedTotal);
    }

    // ---------------------------------------------------------------- views

    function projectCount() external view returns (uint256) {
        return _projects.length;
    }

    function getProjects() external view returns (Project[] memory) {
        return _projects;
    }

    function getProject(uint256 projectId) external view returns (Project memory) {
        return _project(projectId);
    }

    function valuesOf(uint256[] calldata tokenIds)
        external
        view
        returns (uint256[] memory values, bool[] memory redeemedFlags)
    {
        uint256 n = tokenIds.length;
        values = new uint256[](n);
        redeemedFlags = new bool[](n);
        for (uint256 i = 0; i < n; i++) {
            values[i] = tokenValue[tokenIds[i]];
            redeemedFlags[i] = redeemed[tokenIds[i]];
        }
    }

    /// Remaining token owed if every seeded, unredeemed token claimed.
    function outstandingLiability() external view returns (uint256) {
        return totalSeeded;
    }

    /// What claims can actually draw right now: Safe balance ∩ allowance.
    function available() external view returns (uint256) {
        uint256 balance = token.balanceOf(treasury);
        uint256 allowance = token.allowance(treasury, address(this));
        return balance < allowance ? balance : allowance;
    }

    // ------------------------------------------------------------- internal

    function _project(uint256 projectId) internal view returns (Project storage) {
        if (projectId == 0 || projectId > _projects.length) revert InvalidProject(projectId);
        return _projects[projectId - 1];
    }

    function _send(address to, uint256 amount) internal {
        token.safeTransferFrom(treasury, to, amount);
    }
}
