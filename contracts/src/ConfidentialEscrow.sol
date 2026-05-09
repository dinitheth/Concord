// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ConfidentialEscrow
 * @notice Wave 4: Trustless financial settlement layer for Concord Protocol.
 *
 * @dev Holds the buyer's maximum capital in USDC before a Concord blind
 *      negotiation begins. Once both parties complete the FHE price discovery
 *      in BlindNegotiation.sol and one party publishes the decrypted result,
 *      either party can call settleEscrow() to trigger automatic settlement.
 *
 * Settlement logic:
 *   - MATCH:    agreedAmount → seller, (deposit - agreedAmount) → buyer
 *   - NO MATCH: full deposit → buyer (zero information leaked)
 *   - TIMEOUT:  48h emergency refund path for buyer if deal goes stale
 *
 * Token:   USDC on Base Sepolia
 *          0x036CbD53842c5426634e7929541eC2318f3dCF7e
 *
 * Pricing: agreedPrice from BlindNegotiation is stored as a raw uint64
 *          representing the deal value in whole units (e.g. 80 = $80M).
 *          This contract treats USDC with 6 decimals, so:
 *          usdcAmount = agreedPrice * 1e6
 *          Adjust the multiplier for your unit convention.
 */
contract ConfidentialEscrow {
    using SafeERC20 for IERC20;

    // ── Immutables ───────────────────────────────────────────────
    IERC20 public immutable usdc;
    IBlindNegotiation public immutable blindNegotiation;

    // ── State ────────────────────────────────────────────────────
    enum EscrowStatus { None, Deposited, Settled, Refunded }

    struct Escrow {
        address buyer;          // Party B — deposits max capital, pays on match
        address seller;         // Party A — receives agreed amount on match
        uint256 depositAmount;  // Buyer's max USDC locked (in USDC units, 6 dec)
        uint256 agreedAmount;   // Midpoint USDC transferred to seller on match
        EscrowStatus status;
        uint256 depositedAt;    // For 48h emergency refund window
    }

    mapping(bytes32 => Escrow) private escrows;

    // ── Events ───────────────────────────────────────────────────
    event EscrowDeposited(
        bytes32 indexed roomId,
        address indexed buyer,
        address indexed seller,
        uint256 amount
    );
    event EscrowSettled(
        bytes32 indexed roomId,
        address indexed seller,
        uint256 agreedAmount,
        uint256 refundAmount
    );
    event EscrowRefunded(
        bytes32 indexed roomId,
        address indexed buyer,
        uint256 amount
    );

    // ── Errors ───────────────────────────────────────────────────
    error EscrowAlreadyExists();
    error EscrowNotDeposited();
    error InvalidAmount();
    error InvalidSeller();
    error ResultNotPublished();
    error AgreedPriceExceedsDeposit(uint256 agreedAmount, uint256 depositAmount);
    error OnlyBuyerCanEmergencyRefund();
    error EmergencyRefundTooEarly(uint256 availableAt);

    // ── Constructor ──────────────────────────────────────────────
    constructor(address _usdc, address _blindNegotiation) {
        usdc = IERC20(_usdc);
        blindNegotiation = IBlindNegotiation(_blindNegotiation);
    }

    // ── Core Functions ───────────────────────────────────────────

    /**
     * @notice Buyer locks their maximum capital before a Concord negotiation.
     * @dev Caller must have approved this contract for `amount` USDC first.
     *      The room must already exist in BlindNegotiation.sol.
     *
     * @param roomId  The Concord room this escrow is linked to (bytes32).
     * @param amount  The buyer's maximum USDC deposit (in USDC units, 6 decimals).
     * @param seller  The seller's wallet address (Party A — room creator).
     */
    function depositEscrow(
        bytes32 roomId,
        uint256 amount,
        address seller
    ) external {
        if (escrows[roomId].status != EscrowStatus.None) revert EscrowAlreadyExists();
        if (amount == 0) revert InvalidAmount();
        if (seller == address(0) || seller == msg.sender) revert InvalidSeller();

        // Transfer USDC from buyer to this contract
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        escrows[roomId] = Escrow({
            buyer: msg.sender,
            seller: seller,
            depositAmount: amount,
            agreedAmount: 0,
            status: EscrowStatus.Deposited,
            depositedAt: block.timestamp
        });

        emit EscrowDeposited(roomId, msg.sender, seller, amount);
    }

    /**
     * @notice Settle the escrow after BlindNegotiation publishes its result.
     * @dev Can be called by EITHER party once publishResult() has been called
     *      on BlindNegotiation.sol. Reads the result trustlessly from the
     *      BlindNegotiation contract — no manual input needed.
     *
     *      On MATCH:    agreedAmount (in USDC) → seller
     *                   remainder              → buyer
     *      On NO MATCH: full deposit           → buyer
     *
     * @param roomId  The Concord room to settle.
     */
    function settleEscrow(bytes32 roomId) external {
        Escrow storage escrow = escrows[roomId];
        if (escrow.status != EscrowStatus.Deposited) revert EscrowNotDeposited();

        // Trustlessly read the published FHE result from BlindNegotiation
        (bool isPublished, bool matched, uint64 agreedPrice) =
            blindNegotiation.getPublishedResult(roomId);

        if (!isPublished) revert ResultNotPublished();

        if (matched && agreedPrice > 0) {
            // Convert raw price units → USDC units (6 decimals)
            // agreedPrice is stored in whole units (e.g. 80 = $80M deal)
            // Multiply by 1e6 to get USDC amount with 6 decimal places
            uint256 agreedUsdc = uint256(agreedPrice) * 1e6;

            if (agreedUsdc > escrow.depositAmount) {
                revert AgreedPriceExceedsDeposit(agreedUsdc, escrow.depositAmount);
            }

            uint256 refundAmount = escrow.depositAmount - agreedUsdc;
            escrow.agreedAmount = agreedUsdc;
            escrow.status = EscrowStatus.Settled;

            // Pay seller the agreed midpoint amount
            usdc.safeTransfer(escrow.seller, agreedUsdc);

            // Refund buyer the difference (deposit - agreed)
            if (refundAmount > 0) {
                usdc.safeTransfer(escrow.buyer, refundAmount);
            }

            emit EscrowSettled(roomId, escrow.seller, agreedUsdc, refundAmount);
        } else {
            // No match — full refund to buyer, zero info leaked
            escrow.status = EscrowStatus.Refunded;
            uint256 refund = escrow.depositAmount;
            usdc.safeTransfer(escrow.buyer, refund);

            emit EscrowRefunded(roomId, escrow.buyer, refund);
        }
    }

    /**
     * @notice Emergency refund for buyer if the deal goes completely stale.
     * @dev Only the buyer can call this. Only available 48 hours after deposit.
     *      This protects buyers if Party A never completes the negotiation.
     *
     * @param roomId  The Concord room to emergency-refund.
     */
    function emergencyRefund(bytes32 roomId) external {
        Escrow storage escrow = escrows[roomId];
        if (escrow.status != EscrowStatus.Deposited) revert EscrowNotDeposited();
        if (msg.sender != escrow.buyer) revert OnlyBuyerCanEmergencyRefund();

        uint256 availableAt = escrow.depositedAt + 48 hours;
        if (block.timestamp < availableAt) revert EmergencyRefundTooEarly(availableAt);

        escrow.status = EscrowStatus.Refunded;
        uint256 refund = escrow.depositAmount;
        usdc.safeTransfer(escrow.buyer, refund);

        emit EscrowRefunded(roomId, escrow.buyer, refund);
    }

    // ── View Functions ───────────────────────────────────────────

    /**
     * @notice Get the full escrow state for a room.
     */
    function getEscrow(bytes32 roomId) external view returns (Escrow memory) {
        return escrows[roomId];
    }

    /**
     * @notice Check if an escrow is active (deposited but not yet settled).
     */
    function hasActiveEscrow(bytes32 roomId) external view returns (bool) {
        return escrows[roomId].status == EscrowStatus.Deposited;
    }
}

// ── Interface ────────────────────────────────────────────────────

/**
 * @dev Minimal interface to read published results from BlindNegotiation.
 *      Keeps ConfidentialEscrow decoupled from the full BlindNegotiation ABI.
 */
interface IBlindNegotiation {
    function getPublishedResult(bytes32 roomId) external view returns (
        bool isPublished,
        bool matched,
        uint64 agreedPrice
    );
}
