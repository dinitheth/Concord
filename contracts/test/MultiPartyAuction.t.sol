// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../src/MultiPartyAuction.sol";
import "./MockTaskManager.sol";

contract MultiPartyAuctionTest is Test {
    MultiPartyAuction public mpa;
    MockTaskManager public mtm;

    address public seller = address(0x1111);
    address public bidder1 = address(0x2222);
    address public bidder2 = address(0x3333);
    address public observer = address(0x4444);

    bytes32 public auctionId = keccak256("test-auction-1");

    function setUp() public {
        mtm = new MockTaskManager();
        
        // Etch MockTaskManager at Fhenix's TASK_MANAGER_ADDRESS
        vm.etch(address(0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9), address(mtm).code);

        mpa = new MultiPartyAuction();
    }

    function testCreateAuctionSuccess() public {
        vm.startPrank(seller);

        InEuint64 memory encFloor = InEuint64({
            ctHash: 80, // represents plaintext floor = 80
            securityZone: 0,
            utype: 5, // EUINT64_TFHE
            signature: ""
        });

        address[] memory recipients = new address[](2);
        recipients[0] = bidder1;
        recipients[1] = bidder2;

        mpa.createAuction(
            auctionId,
            encFloor,
            0, // M&A Deal
            block.timestamp + 3600, // 1 hour deadline
            2, // maxBidders
            recipients
        );

        assertTrue(mpa.auctionExists(auctionId));
        assertEq(mpa.getAuctionCount(), 1);

        (
            address sellerAddress,
            MultiPartyAuction.AuctionStatus status,
            uint256 createdAt,
            uint256 deadline,
            uint8 negotiationType,
            uint8 maxBidders,
            uint8 currentBids,
            bool isResultPublished,
            bool matched,
            uint64 agreedPrice,
            address winner
        ) = mpa.getAuctionInfo(auctionId);

        assertEq(sellerAddress, seller);
        assertEq(uint8(status), uint8(MultiPartyAuction.AuctionStatus.BiddingOpen));
        assertEq(createdAt, block.timestamp);
        assertEq(deadline, block.timestamp + 3600);
        assertEq(negotiationType, 0);
        assertEq(maxBidders, 2);
        assertEq(currentBids, 0);
        assertFalse(isResultPublished);
        assertFalse(matched);
        assertEq(agreedPrice, 0);
        assertEq(winner, address(0));

        vm.stopPrank();
    }

    function testCreateAuctionFailures() public {
        vm.startPrank(seller);

        InEuint64 memory encFloor = InEuint64({
            ctHash: 80,
            securityZone: 0,
            utype: 5,
            signature: ""
        });

        address[] memory recipients = new address[](0);

        // 1. Fail: Deadline in past
        vm.expectRevert("Deadline must be in the future");
        mpa.createAuction(auctionId, encFloor, 0, block.timestamp, 2, recipients);

        // 2. Fail: Max bidders out of bounds (1-10)
        vm.expectRevert("Max bidders must be 1-10");
        mpa.createAuction(auctionId, encFloor, 0, block.timestamp + 10, 11, recipients);

        // 3. Fail: Invalid negotiation type
        vm.expectRevert("Invalid negotiation type");
        mpa.createAuction(auctionId, encFloor, 4, block.timestamp + 10, 5, recipients);

        // Success deploy
        mpa.createAuction(auctionId, encFloor, 0, block.timestamp + 10, 2, recipients);

        // 4. Fail: Already exists
        vm.expectRevert("Auction already exists");
        mpa.createAuction(auctionId, encFloor, 0, block.timestamp + 20, 2, recipients);

        vm.stopPrank();
    }

    function testSubmitBidSuccess() public {
        // Create auction with maxBidders = 2
        vm.startPrank(seller);
        mpa.createAuction(auctionId, InEuint64(80, 0, 5, ""), 0, block.timestamp + 3600, 2, new address[](0));
        vm.stopPrank();

        // Bidder 1 submits bid
        vm.startPrank(bidder1);
        mpa.submitBid(auctionId, InEuint64(83, 0, 5, ""));
        assertEq(mpa.getBidCount(auctionId), 1);
        assertEq(mpa.getBidder(auctionId, 0), bidder1);
        vm.stopPrank();

        // Bidder 2 submits bid
        vm.startPrank(bidder2);
        mpa.submitBid(auctionId, InEuint64(86, 0, 5, ""));
        assertEq(mpa.getBidCount(auctionId), 2);
        assertEq(mpa.getBidder(auctionId, 1), bidder2);
        vm.stopPrank();
    }

    function testSubmitBidFailures() public {
        vm.startPrank(seller);
        mpa.createAuction(auctionId, InEuint64(80, 0, 5, ""), 0, block.timestamp + 3600, 1, new address[](0));
        vm.stopPrank();

        // 1. Fail: Seller bids on own auction
        vm.startPrank(seller);
        vm.expectRevert("Seller cannot bid on own auction");
        mpa.submitBid(auctionId, InEuint64(83, 0, 5, ""));
        vm.stopPrank();

        // Bidder 1 bids successfully
        vm.startPrank(bidder1);
        mpa.submitBid(auctionId, InEuint64(83, 0, 5, ""));

        // 2. Fail: Already submitted a bid
        vm.expectRevert("Already submitted a bid");
        mpa.submitBid(auctionId, InEuint64(85, 0, 5, ""));
        vm.stopPrank();

        // 3. Fail: Max bidders reached (maxBidders is 1)
        vm.startPrank(bidder2);
        vm.expectRevert("Max bidders reached");
        mpa.submitBid(auctionId, InEuint64(86, 0, 5, ""));
        vm.stopPrank();
    }

    function testComputeAuctionBidder2Wins() public {
        // Setup auction
        vm.startPrank(seller);
        mpa.createAuction(auctionId, InEuint64(80, 0, 5, ""), 0, block.timestamp + 3600, 2, new address[](0));
        vm.stopPrank();

        // Bids: Bidder 1 (83), Bidder 2 (86)
        vm.prank(bidder1);
        mpa.submitBid(auctionId, InEuint64(83, 0, 5, ""));
        vm.prank(bidder2);
        mpa.submitBid(auctionId, InEuint64(86, 0, 5, ""));

        // Compute Auction
        mpa.computeAuction(auctionId);

        (, MultiPartyAuction.AuctionStatus status,,,,,,,,, ) = mpa.getAuctionInfo(auctionId);
        assertEq(uint8(status), uint8(MultiPartyAuction.AuctionStatus.Settled));

        // Get encrypted results
        vm.startPrank(seller);
        (euint64 encAgreedPrice, ebool encHasWinner, euint32 encWinnerIndex) = mpa.getEncryptedResult(auctionId);

        uint256 agreedPrice = uint256(euint64.unwrap(encAgreedPrice));
        uint256 hasWinner = uint256(ebool.unwrap(encHasWinner));
        uint256 winnerIndex = uint256(euint32.unwrap(encWinnerIndex));

        assertEq(hasWinner, 1); // True (1)
        assertEq(winnerIndex, 1); // Bidder 2 won (index 1)
        assertEq(agreedPrice, 83); // Midpoint = (80 + 86) / 2 = 83
        vm.stopPrank();
    }

    function testComputeAuctionBidder1Wins() public {
        // Setup auction
        vm.startPrank(seller);
        mpa.createAuction(auctionId, InEuint64(80, 0, 5, ""), 0, block.timestamp + 3600, 2, new address[](0));
        vm.stopPrank();

        // Bids: Bidder 1 (86), Bidder 2 (83)
        vm.prank(bidder1);
        mpa.submitBid(auctionId, InEuint64(86, 0, 5, ""));
        vm.prank(bidder2);
        mpa.submitBid(auctionId, InEuint64(83, 0, 5, ""));

        // Compute Auction
        mpa.computeAuction(auctionId);

        // Get encrypted results
        vm.startPrank(seller);
        (euint64 encAgreedPrice, ebool encHasWinner, euint32 encWinnerIndex) = mpa.getEncryptedResult(auctionId);

        uint256 agreedPrice = uint256(euint64.unwrap(encAgreedPrice));
        uint256 hasWinner = uint256(ebool.unwrap(encHasWinner));
        uint256 winnerIndex = uint256(euint32.unwrap(encWinnerIndex));

        assertEq(hasWinner, 1); // True
        assertEq(winnerIndex, 0); // Bidder 1 won (index 0)
        assertEq(agreedPrice, 83); // Midpoint = (80 + 86) / 2 = 83
        vm.stopPrank();
    }

    function testComputeAuctionNoWinner() public {
        // Setup auction
        vm.startPrank(seller);
        mpa.createAuction(auctionId, InEuint64(90, 0, 5, ""), 0, block.timestamp + 3600, 2, new address[](0));
        vm.stopPrank();

        // Bids: Bidder 1 (86), Bidder 2 (83) -- both below floor (90)
        vm.prank(bidder1);
        mpa.submitBid(auctionId, InEuint64(86, 0, 5, ""));
        vm.prank(bidder2);
        mpa.submitBid(auctionId, InEuint64(83, 0, 5, ""));

        // Compute Auction
        mpa.computeAuction(auctionId);

        // Get encrypted results
        vm.startPrank(seller);
        (euint64 encAgreedPrice, ebool encHasWinner, ) = mpa.getEncryptedResult(auctionId);

        uint256 agreedPrice = uint256(euint64.unwrap(encAgreedPrice));
        uint256 hasWinner = uint256(ebool.unwrap(encHasWinner));

        assertEq(hasWinner, 2); // False (2)
        assertEq(agreedPrice, 0); // Midpoint = 0
        vm.stopPrank();
    }

    function testPublishResult() public {
        vm.startPrank(seller);
        mpa.createAuction(auctionId, InEuint64(80, 0, 5, ""), 0, block.timestamp + 3600, 2, new address[](0));
        vm.stopPrank();

        vm.prank(bidder1);
        mpa.submitBid(auctionId, InEuint64(83, 0, 5, ""));
        vm.prank(bidder2);
        mpa.submitBid(auctionId, InEuint64(86, 0, 5, ""));

        mpa.computeAuction(auctionId);

        // Publish
        vm.startPrank(seller);
        mpa.publishResult(auctionId, true, 83, bidder2);

        (,,,,,,, bool isResultPublished, bool matched, uint64 agreedPrice, address winner) = mpa.getAuctionInfo(auctionId);
        assertTrue(isResultPublished);
        assertTrue(matched);
        assertEq(agreedPrice, 83);
        assertEq(winner, bidder2);

        // Check published helper (for escrow or history view)
        (bool isPub, bool matchRes, uint64 pubPrice, address pubWinner) = mpa.getPublishedResult(auctionId);
        assertTrue(isPub);
        assertTrue(matchRes);
        assertEq(pubPrice, 83);
        assertEq(pubWinner, bidder2);

        // Fail: publish again
        vm.expectRevert("Already published");
        mpa.publishResult(auctionId, true, 83, bidder2);
        vm.stopPrank();
    }
}
