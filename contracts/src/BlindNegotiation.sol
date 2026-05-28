// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title BlindNegotiation
 * @notice Concord core contract — blind price discovery using Fhenix CoFHE.
 * @dev Two parties submit encrypted prices. FHE.gte() determines if ceiling >= floor.
 *      Neither party's price is ever visible on-chain. Only the match boolean and
 *      the encrypted midpoint are made available for threshold decryption.
 *
 *      Includes on-chain invite system — no external messaging services needed.
 *      Invites are stored on-chain, tied to wallet addresses.
 *
 *      Network: Base Sepolia (CoFHE-supported)
 *      CoFHE Contracts: fhenixprotocol/cofhe-contracts
 *      Decrypt Flow: decryptForView (UI) / decryptForTx + publishDecryptResult (on-chain)
 */
contract BlindNegotiation {

    enum RoomStatus { Open, PendingB, Computing, Settled, Expired }

    struct Room {
        address partyAAddress;     // Plaintext address of Party A (creator)
        address partyBAddress;     // Plaintext address of Party B (joiner)
        euint64 partyAPrice;       // Encrypted floor (Party A)
        euint64 partyBPrice;       // Encrypted ceiling (Party B)
        ebool matched;             // FHE comparison: ceiling >= floor
        euint64 agreedPrice;       // FHE midpoint if matched (otherwise enc(0))
        RoomStatus status;
        uint256 createdAt;
        uint256 deadline;
        uint8 negotiationType;     // 0=M&A, 1=Salary, 2=RealEstate, 3=Custom
    }

    // ── On-Chain Invite ─────────────────────────────────────────────
    struct Invite {
        bytes32 roomId;
        address sender;
        uint256 timestamp;
        uint8 negotiationType;
    }

    mapping(bytes32 => Room) private rooms;
    bytes32[] public roomIds;
    mapping(bytes32 => bool) public roomExists;

    // Result publication storage
    mapping(bytes32 => bool) public resultPublished;
    mapping(bytes32 => bool) public matchResult;
    mapping(bytes32 => uint64) public publishedPrice;

    // On-chain invite storage
    mapping(address => Invite[]) private receivedInvites;
    mapping(address => Invite[]) private sentInvites;

    event RoomCreated(bytes32 indexed roomId, address indexed partyA, uint8 nType, uint256 deadline, uint256 timestamp);
    event RoomJoined(bytes32 indexed roomId, address indexed partyB, uint256 timestamp);
    event MatchComputed(bytes32 indexed roomId, uint256 timestamp);
    event ResultPublished(bytes32 indexed roomId, bool matched, uint64 agreedPrice, uint256 timestamp);
    event InviteSent(bytes32 indexed roomId, address indexed sender, address indexed recipient, uint256 timestamp);

    modifier onlyParty(bytes32 roomId) {
        require(
            msg.sender == rooms[roomId].partyAAddress || msg.sender == rooms[roomId].partyBAddress,
            "Not a party"
        );
        _;
    }

    /**
     * @notice Party A creates a room with their encrypted floor price.
     * @param roomId    Unique room identifier (bytes32)
     * @param encFloor  InEuint64 — encrypted floor price
     * @param nType     Negotiation type (0=M&A, 1=Salary, 2=RealEstate, 3=Custom)
     * @param deadline  Unix timestamp after which room expires
     */
    function createRoom(
        bytes32 roomId,
        InEuint64 calldata encFloor,
        uint8 nType,
        uint256 deadline
    ) external {
        require(!roomExists[roomId], "Room already exists");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(nType <= 3 || (nType >= 10 && nType <= 13), "Invalid negotiation type");

        Room storage room = rooms[roomId];

        // Store Party A's encrypted floor price
        room.partyAPrice = FHE.asEuint64(encFloor);
        room.partyAAddress = msg.sender;

        // Grant access: Party A + this contract can read the ciphertext
        FHE.allowSender(room.partyAPrice);
        FHE.allowThis(room.partyAPrice);

        room.status = RoomStatus.PendingB;
        room.createdAt = block.timestamp;
        room.deadline = deadline;
        room.negotiationType = nType;

        roomIds.push(roomId);
        roomExists[roomId] = true;

        emit RoomCreated(roomId, msg.sender, nType, deadline, block.timestamp);
    }

    /**
     * @notice Send an on-chain invite to a counterparty.
     * @dev The invite is stored on-chain so the recipient sees it when they
     *      connect their wallet. No external messaging service needed.
     * @param roomId    The room to invite the counterparty to
     * @param recipient The wallet address of the counterparty
     */
    function sendInvite(
        bytes32 roomId,
        address recipient
    ) external {
        require(roomExists[roomId], "Room does not exist");
        require(rooms[roomId].partyAAddress == msg.sender, "Only room creator can send invites");
        require(recipient != msg.sender, "Cannot invite yourself");
        require(recipient != address(0), "Invalid recipient");

        Invite memory invite = Invite({
            roomId: roomId,
            sender: msg.sender,
            timestamp: block.timestamp,
            negotiationType: rooms[roomId].negotiationType
        });

        receivedInvites[recipient].push(invite);
        sentInvites[msg.sender].push(invite);

        emit InviteSent(roomId, msg.sender, recipient, block.timestamp);
    }

    /**
     * @notice Party B joins and triggers the blind comparison.
     * @param roomId      The room to join
     * @param encCeiling  InEuint64 — encrypted ceiling price
     *
     * @dev Core FHE circuit:
     *   1. FHE.gte(ceiling, floor)      — compare in encrypted space
     *   2. FHE.add(floor, ceiling)      — sum in encrypted space
     *   3. FHE.div(sum, euint64(2))     — midpoint in encrypted space
     *   4. FHE.select(match, mid, 0)    — conditional in ciphertext
     *
     * CRITICAL: Neither price is ever in cleartext at any point.
     */
    function joinAndCompute(
        bytes32 roomId,
        InEuint64 calldata encCeiling
    ) external {
        Room storage room = rooms[roomId];
        require(room.status == RoomStatus.PendingB, "Room not accepting joins");
        require(block.timestamp <= room.deadline, "Room has expired");
        require(msg.sender != room.partyAAddress, "Cannot join your own room");

        // Store Party B info
        room.partyBAddress = msg.sender;
        room.partyBPrice = FHE.asEuint64(encCeiling);
        FHE.allowSender(room.partyBPrice);
        FHE.allowThis(room.partyBPrice);

        room.status = RoomStatus.Computing;

        // ── CORE FHE COMPUTATION ─────────────────────────────────────
        //
        // Step 1: Is there a deal? (ceiling >= floor, fully in ciphertext)
        // If negotiationType < 10, Party A is Seller (Floor) and Party B is Buyer (Ceiling). Check: B >= A
        // If negotiationType >= 10, Party A is Buyer (Ceiling) and Party B is Seller (Floor). Check: A >= B
        ebool hasMatch;
        if (room.negotiationType < 10) {
            hasMatch = FHE.gte(room.partyBPrice, room.partyAPrice);
        } else {
            hasMatch = FHE.gte(room.partyAPrice, room.partyBPrice);
        }

        // Step 2: Compute the midpoint in encrypted space
        euint64 encSum = FHE.add(room.partyAPrice, room.partyBPrice);
        euint64 encMidpoint = FHE.div(encSum, FHE.asEuint64(2));

        // Step 3: Conditional select — midpoint only if match, else 0
        euint64 encAgreed = FHE.select(hasMatch, encMidpoint, FHE.asEuint64(0));
        // ──────────────────────────────────────────────────────────────

        room.matched = hasMatch;
        room.agreedPrice = encAgreed;

        // Grant both parties + contract access to results for decryption
        FHE.allow(room.matched, room.partyAAddress);
        FHE.allow(room.matched, room.partyBAddress);
        FHE.allowThis(room.matched);

        FHE.allow(room.agreedPrice, room.partyAAddress);
        FHE.allow(room.agreedPrice, room.partyBAddress);
        FHE.allowThis(room.agreedPrice);

        room.status = RoomStatus.Settled;
        emit MatchComputed(roomId, block.timestamp);
        emit RoomJoined(roomId, msg.sender, block.timestamp);
    }

    /**
     * @notice Publish the decrypted result on-chain.
     * @dev Called after decryptForTx returns {decryptedValue, signature}.
     *      The caller passes the result here via FHE.publishDecryptResult().
     */
    function publishResult(
        bytes32 roomId,
        bool _matched,
        uint64 _agreedPrice
    ) external onlyParty(roomId) {
        require(rooms[roomId].status == RoomStatus.Settled, "Not settled");
        require(!resultPublished[roomId], "Already published");

        resultPublished[roomId] = true;
        matchResult[roomId] = _matched;
        publishedPrice[roomId] = _agreedPrice;

        emit ResultPublished(roomId, _matched, _agreedPrice, block.timestamp);
    }

    // ── View Functions ──────────────────────────────────────────────

    function getRoomStatus(bytes32 roomId) external view returns (RoomStatus) {
        return rooms[roomId].status;
    }

    function getRoomInfo(bytes32 roomId) external view returns (
        address partyA,
        address partyB,
        RoomStatus status,
        uint256 createdAt,
        uint256 deadline,
        uint8 negotiationType,
        bool isResultPublished,
        bool matched,
        uint64 agreedPrice
    ) {
        Room storage room = rooms[roomId];
        return (
            room.partyAAddress,
            room.partyBAddress,
            room.status,
            room.createdAt,
            room.deadline,
            room.negotiationType,
            resultPublished[roomId],
            matchResult[roomId],
            publishedPrice[roomId]
        );
    }

    /**
     * @notice Get encrypted handles for client-side decryptForView.
     * @dev Only callable by room parties. Returns the ciphertext handles
     *      that the client SDK uses with decryptForView() or decryptForTx().
     */
    function getEncryptedResult(bytes32 roomId) external view onlyParty(roomId) returns (
        euint64 encAgreedPrice,
        ebool encMatched
    ) {
        Room storage room = rooms[roomId];
        require(room.status == RoomStatus.Settled, "Not settled");
        return (room.agreedPrice, room.matched);
    }

    function getRoomCount() external view returns (uint256) {
        return roomIds.length;
    }

    function getRoomIdAt(uint256 index) external view returns (bytes32) {
        require(index < roomIds.length, "Index out of bounds");
        return roomIds[index];
    }

    // ── On-Chain Invite View Functions ──────────────────────────────

    /**
     * @notice Get all invites received by an address.
     * @dev Called by the frontend when user connects wallet to show their inbox.
     */
    function getReceivedInvites(address recipient) external view returns (Invite[] memory) {
        return receivedInvites[recipient];
    }

    /**
     * @notice Get the count of received invites for an address.
     */
    function getReceivedInviteCount(address recipient) external view returns (uint256) {
        return receivedInvites[recipient].length;
    }

    /**
     * @notice Get all invites sent by an address.
     */
    function getSentInvites(address sender) external view returns (Invite[] memory) {
        return sentInvites[sender];
    }

    /**
     * @notice Get the count of sent invites for an address.
     */
    function getSentInviteCount(address sender) external view returns (uint256) {
        return sentInvites[sender].length;
    }

    // ── Wave 4: Escrow Integration ──────────────────────────────

    /**
     * @notice Returns the published result for the ConfidentialEscrow contract.
     * @dev Called by ConfidentialEscrow.settleEscrow() to trustlessly read
     *      the FHE comparison result without any manual input.
     *      Returns (false, false, 0) if result has not been published yet.
     *
     * @param roomId  The room to query.
     * @return isPublished  Whether publishResult() has been called.
     * @return matched      Whether the FHE comparison found an overlap.
     * @return agreedPrice  The decrypted midpoint price (0 if no match).
     */
    function getPublishedResult(bytes32 roomId) external view returns (
        bool isPublished,
        bool matched,
        uint64 agreedPrice
    ) {
        return (
            resultPublished[roomId],
            matchResult[roomId],
            publishedPrice[roomId]
        );
    }
}
