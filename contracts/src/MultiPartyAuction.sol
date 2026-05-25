// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title MultiPartyAuction
 * @notice Wave 5: Sealed-bid auction with FHE — multiple encrypted bids against one seller's floor.
 * @dev Extends the Concord protocol to support N buyers bidding against a single seller.
 *      All bids and the floor price remain fully encrypted. The contract uses a pairwise
 *      FHE comparison tournament to find the highest eligible bid, then computes the
 *      midpoint settlement price — all in ciphertext.
 *
 *      FHE Circuit (computeAuction):
 *        1. For each bid: FHE.gte(ceiling, floor) — eligibility check
 *        2. Tournament bracket: pairwise FHE.gte between eligible bids
 *        3. FHE.select to pick the highest eligible bid
 *        4. Midpoint: FHE.div(FHE.add(floor, bestBid), 2)
 *
 *      Max bidders capped at 10 to control gas costs.
 *
 *      Network: Base Sepolia (CoFHE-supported)
 */
contract MultiPartyAuction {

    enum AuctionStatus { Open, BiddingOpen, Computing, Settled, Expired }

    struct Auction {
        address seller;
        euint64 floorPrice;          // Seller's encrypted minimum
        uint8 negotiationType;       // 0=M&A, 1=Salary, 2=RealEstate, 3=Custom
        uint256 createdAt;
        uint256 deadline;
        uint8 maxBidders;            // Cap: 1–10
        AuctionStatus status;
        ebool hasWinner;             // FHE result: did any bid qualify?
        euint64 agreedPrice;         // FHE midpoint with the best bid
        euint32 encWinnerIndex;      // Encrypted index of winning bid
        uint8 winnerIndex;           // Index of winning bid (set after publish)
    }

    struct Bid {
        address bidder;
        euint64 ceilingPrice;        // Bidder's encrypted maximum
        uint256 timestamp;
    }

    // ── Storage ──────────────────────────────────────────────────
    mapping(bytes32 => Auction) private auctions;
    mapping(bytes32 => Bid[]) private bids;
    mapping(bytes32 => bool) public auctionExists;
    bytes32[] public auctionIds;

    // Result publication
    mapping(bytes32 => bool) public resultPublished;
    mapping(bytes32 => bool) public matchResult;
    mapping(bytes32 => uint64) public publishedPrice;
    mapping(bytes32 => address) public publishedWinner;

    // On-chain invite storage (reuse pattern from BlindNegotiation)
    struct Invite {
        bytes32 auctionId;
        address sender;
        uint256 timestamp;
        uint8 negotiationType;
    }
    mapping(address => Invite[]) private receivedInvites;
    mapping(address => Invite[]) private sentInvites;

    // ── Events ───────────────────────────────────────────────────
    event AuctionCreated(bytes32 indexed auctionId, address indexed seller, uint8 nType, uint256 deadline, uint8 maxBidders, uint256 timestamp);
    event BidSubmitted(bytes32 indexed auctionId, address indexed bidder, uint8 bidIndex, uint256 timestamp);
    event AuctionComputed(bytes32 indexed auctionId, uint8 totalBids, uint256 timestamp);
    event AuctionResultPublished(bytes32 indexed auctionId, bool matched, uint64 agreedPrice, address winner, uint256 timestamp);
    event AuctionInviteSent(bytes32 indexed auctionId, address indexed sender, address indexed recipient, uint256 timestamp);

    // ── Modifiers ────────────────────────────────────────────────
    modifier onlyParticipant(bytes32 auctionId) {
        Auction storage a = auctions[auctionId];
        bool isParty = a.seller == msg.sender;
        if (!isParty) {
            Bid[] storage bs = bids[auctionId];
            for (uint256 i = 0; i < bs.length; i++) {
                if (bs[i].bidder == msg.sender) {
                    isParty = true;
                    break;
                }
            }
        }
        require(isParty, "Not a participant");
        _;
    }

    // ── Core Functions ───────────────────────────────────────────

    /**
     * @notice Seller creates a sealed-bid auction with their encrypted floor price.
     * @param auctionId   Unique auction identifier (bytes32)
     * @param encFloor    InEuint64 — encrypted floor price
     * @param nType       Negotiation type (0=M&A, 1=Salary, 2=RealEstate, 3=Custom)
     * @param deadline    Unix timestamp — bidding window closes after this
     * @param maxBidders  Maximum number of bids accepted (2–10)
     */
    function createAuction(
        bytes32 auctionId,
        InEuint64 calldata encFloor,
        uint8 nType,
        uint256 deadline,
        uint8 maxBidders
    ) external {
        require(!auctionExists[auctionId], "Auction already exists");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(nType <= 3, "Invalid negotiation type");
        require(maxBidders >= 1 && maxBidders <= 10, "Max bidders must be 1-10");

        Auction storage auction = auctions[auctionId];
        auction.seller = msg.sender;
        auction.floorPrice = FHE.asEuint64(encFloor);
        auction.negotiationType = nType;
        auction.createdAt = block.timestamp;
        auction.deadline = deadline;
        auction.maxBidders = maxBidders;
        auction.status = AuctionStatus.BiddingOpen;

        // Grant access to seller + contract
        FHE.allowSender(auction.floorPrice);
        FHE.allowThis(auction.floorPrice);

        auctionIds.push(auctionId);
        auctionExists[auctionId] = true;

        emit AuctionCreated(auctionId, msg.sender, nType, deadline, maxBidders, block.timestamp);
    }

    /**
     * @notice Submit an encrypted ceiling bid to an open auction.
     * @param auctionId   The auction to bid on
     * @param encCeiling  InEuint64 — encrypted ceiling price (bidder's maximum)
     */
    function submitBid(
        bytes32 auctionId,
        InEuint64 calldata encCeiling
    ) external {
        require(auctionExists[auctionId], "Auction does not exist");
        Auction storage auction = auctions[auctionId];
        require(auction.status == AuctionStatus.BiddingOpen, "Auction not accepting bids");
        require(block.timestamp <= auction.deadline, "Bidding period has ended");
        require(msg.sender != auction.seller, "Seller cannot bid on own auction");
        require(bids[auctionId].length < auction.maxBidders, "Max bidders reached");

        // Check bidder hasn't already submitted
        Bid[] storage existingBids = bids[auctionId];
        for (uint256 i = 0; i < existingBids.length; i++) {
            require(existingBids[i].bidder != msg.sender, "Already submitted a bid");
        }

        euint64 encPrice = FHE.asEuint64(encCeiling);
        FHE.allowSender(encPrice);
        FHE.allowThis(encPrice);

        bids[auctionId].push(Bid({
            bidder: msg.sender,
            ceilingPrice: encPrice,
            timestamp: block.timestamp
        }));

        uint8 bidIndex = uint8(bids[auctionId].length - 1);
        emit BidSubmitted(auctionId, msg.sender, bidIndex, block.timestamp);
    }

    /**
     * @notice Trigger the FHE computation after bidding closes.
     * @dev Runs the full tournament bracket in ciphertext:
     *      1. Check each bid against the floor (eligibility)
     *      2. Pairwise compare eligible bids (find highest)
     *      3. Compute midpoint between floor and best bid
     *
     *      Gas cost scales ~O(N²) with number of bids.
     *      Only callable after deadline or when maxBidders reached.
     */
    function computeAuction(bytes32 auctionId) external {
        Auction storage auction = auctions[auctionId];
        require(auction.status == AuctionStatus.BiddingOpen, "Not in bidding phase");
        require(
            block.timestamp > auction.deadline || bids[auctionId].length >= auction.maxBidders,
            "Bidding still open"
        );

        Bid[] storage auctionBids = bids[auctionId];
        uint256 numBids = auctionBids.length;
        require(numBids > 0, "No bids submitted");

        auction.status = AuctionStatus.Computing;

        // ── CORE FHE TOURNAMENT ─────────────────────────────────
        //
        // Step 1: Check eligibility — is each bid >= floor?
        // Step 2: Find the best eligible bid via tournament
        // Step 3: Compute midpoint with seller's floor
        //
        // Everything below runs entirely in encrypted space.
        // ─────────────────────────────────────────────────────────

        // Start with bid[0] as the candidate
        euint64 bestBid = auctionBids[0].ceilingPrice;
        ebool bestIsEligible = FHE.gte(auctionBids[0].ceilingPrice, auction.floorPrice);
        euint32 bestIndex = FHE.asEuint32(0);

        // Tournament: compare each subsequent bid
        for (uint256 i = 1; i < numBids; i++) {
            ebool thisEligible = FHE.gte(auctionBids[i].ceilingPrice, auction.floorPrice);

            // Is this bid higher than the current best?
            ebool thisHigher = FHE.gte(auctionBids[i].ceilingPrice, bestBid);

            // This bid wins if it's eligible AND (higher than current best OR current best is not eligible)
            ebool bestNotEligible = FHE.not(bestIsEligible);
            ebool shouldReplace = FHE.or(
                FHE.and(thisEligible, thisHigher),
                FHE.and(thisEligible, bestNotEligible)
            );

            // Update the running best
            bestBid = FHE.select(shouldReplace, auctionBids[i].ceilingPrice, bestBid);
            bestIndex = FHE.select(shouldReplace, FHE.asEuint32(uint32(i)), bestIndex);
            bestIsEligible = FHE.or(bestIsEligible, thisEligible);
        }

        // Compute the midpoint: (floor + bestBid) / 2
        euint64 encSum = FHE.add(auction.floorPrice, bestBid);
        euint64 encMidpoint = FHE.div(encSum, FHE.asEuint64(2));

        // Final result: midpoint only if there's a winner, else 0
        euint64 encAgreed = FHE.select(bestIsEligible, encMidpoint, FHE.asEuint64(0));

        // Store results
        auction.hasWinner = bestIsEligible;
        auction.agreedPrice = encAgreed;
        auction.encWinnerIndex = bestIndex;
        auction.status = AuctionStatus.Settled;

        // Grant decryption access to seller + all bidders
        FHE.allow(auction.hasWinner, auction.seller);
        FHE.allowThis(auction.hasWinner);
        FHE.allow(auction.agreedPrice, auction.seller);
        FHE.allowThis(auction.agreedPrice);
        FHE.allow(auction.encWinnerIndex, auction.seller);
        FHE.allowThis(auction.encWinnerIndex);

        for (uint256 i = 0; i < numBids; i++) {
            FHE.allow(auction.hasWinner, auctionBids[i].bidder);
            FHE.allow(auction.agreedPrice, auctionBids[i].bidder);
            FHE.allow(auction.encWinnerIndex, auctionBids[i].bidder);
        }

        emit AuctionComputed(auctionId, uint8(numBids), block.timestamp);
    }

    /**
     * @notice Publish the decrypted auction result on-chain.
     * @param auctionId     The auction to publish results for
     * @param _matched      Whether any bid met the floor
     * @param _agreedPrice  The decrypted midpoint price
     * @param _winner       Address of the winning bidder (0x0 if no match)
     */
    function publishResult(
        bytes32 auctionId,
        bool _matched,
        uint64 _agreedPrice,
        address _winner
    ) external onlyParticipant(auctionId) {
        require(auctions[auctionId].status == AuctionStatus.Settled, "Not settled");
        require(!resultPublished[auctionId], "Already published");

        resultPublished[auctionId] = true;
        matchResult[auctionId] = _matched;
        publishedPrice[auctionId] = _agreedPrice;
        publishedWinner[auctionId] = _winner;

        emit AuctionResultPublished(auctionId, _matched, _agreedPrice, _winner, block.timestamp);
    }

    // ── On-Chain Invites ─────────────────────────────────────────

    function sendInvite(bytes32 auctionId, address recipient) external {
        require(auctionExists[auctionId], "Auction does not exist");
        require(auctions[auctionId].seller == msg.sender, "Only seller can send invites");
        require(recipient != msg.sender, "Cannot invite yourself");
        require(recipient != address(0), "Invalid recipient");

        Invite memory invite = Invite({
            auctionId: auctionId,
            sender: msg.sender,
            timestamp: block.timestamp,
            negotiationType: auctions[auctionId].negotiationType
        });

        receivedInvites[recipient].push(invite);
        sentInvites[msg.sender].push(invite);

        emit AuctionInviteSent(auctionId, msg.sender, recipient, block.timestamp);
    }

    /**
     * @notice Send invites to multiple bidders in a single transaction.
     * @param auctionId   The auction to invite bidders to
     * @param recipients  Array of bidder wallet addresses
     */
    function sendBatchInvites(bytes32 auctionId, address[] calldata recipients) external {
        require(auctionExists[auctionId], "Auction does not exist");
        require(auctions[auctionId].seller == msg.sender, "Only seller can send invites");
        require(recipients.length > 0, "No recipients provided");
        require(recipients.length <= 10, "Too many recipients");

        Invite memory invite = Invite({
            auctionId: auctionId,
            sender: msg.sender,
            timestamp: block.timestamp,
            negotiationType: auctions[auctionId].negotiationType
        });

        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != msg.sender, "Cannot invite yourself");
            require(recipients[i] != address(0), "Invalid recipient");

            receivedInvites[recipients[i]].push(invite);
            sentInvites[msg.sender].push(invite);

            emit AuctionInviteSent(auctionId, msg.sender, recipients[i], block.timestamp);
        }
    }

    // ── View Functions ───────────────────────────────────────────

    function getAuctionInfo(bytes32 auctionId) external view returns (
        address seller,
        AuctionStatus status,
        uint256 createdAt,
        uint256 deadline,
        uint8 negotiationType,
        uint8 maxBidders,
        uint8 currentBids,
        bool isResultPublished,
        bool matched,
        uint64 agreedPrice,
        address winner
    ) {
        Auction storage a = auctions[auctionId];
        return (
            a.seller,
            a.status,
            a.createdAt,
            a.deadline,
            a.negotiationType,
            a.maxBidders,
            uint8(bids[auctionId].length),
            resultPublished[auctionId],
            matchResult[auctionId],
            publishedPrice[auctionId],
            publishedWinner[auctionId]
        );
    }

    function getBidCount(bytes32 auctionId) external view returns (uint256) {
        return bids[auctionId].length;
    }

    function getBidder(bytes32 auctionId, uint256 index) external view returns (address) {
        require(index < bids[auctionId].length, "Index out of bounds");
        return bids[auctionId][index].bidder;
    }

    function getEncryptedResult(bytes32 auctionId) external view onlyParticipant(auctionId) returns (
        euint64 encAgreedPrice,
        ebool encHasWinner,
        euint32 encWinnerIndex
    ) {
        Auction storage a = auctions[auctionId];
        require(a.status == AuctionStatus.Settled, "Not settled");
        return (a.agreedPrice, a.hasWinner, a.encWinnerIndex);
    }

    function getPublishedResult(bytes32 auctionId) external view returns (
        bool isPublished,
        bool matched,
        uint64 agreedPrice,
        address winner
    ) {
        return (
            resultPublished[auctionId],
            matchResult[auctionId],
            publishedPrice[auctionId],
            publishedWinner[auctionId]
        );
    }

    function getAuctionCount() external view returns (uint256) {
        return auctionIds.length;
    }

    function getReceivedInvites(address recipient) external view returns (Invite[] memory) {
        return receivedInvites[recipient];
    }

    function getSentInvites(address sender) external view returns (Invite[] memory) {
        return sentInvites[sender];
    }
}
