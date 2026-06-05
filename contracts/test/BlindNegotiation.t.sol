// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../src/BlindNegotiation.sol";
import "./MockTaskManager.sol";

contract BlindNegotiationTest is Test {
    BlindNegotiation public bn;
    MockTaskManager public mtm;

    address public partyA = address(0x1111);
    address public partyB = address(0x2222);

    bytes32 public roomId = keccak256("test-room-1");

    function setUp() public {
        mtm = new MockTaskManager();
        
        // Etch MockTaskManager at Fhenix's TASK_MANAGER_ADDRESS
        vm.etch(address(0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9), address(mtm).code);

        bn = new BlindNegotiation();
    }

    function testCreateRoomSuccess() public {
        vm.startPrank(partyA);

        InEuint64 memory encFloor = InEuint64({
            ctHash: 80, // represents plaintext floor = 80
            securityZone: 0,
            utype: 5, // EUINT64_TFHE
            signature: ""
        });

        bn.createRoom(
            roomId,
            encFloor,
            0, // M&A Deal
            block.timestamp + 3600, // 1 hour deadline
            "M&A deal metadata"
        );

        assertTrue(bn.roomExists(roomId));
        assertEq(bn.getRoomCount(), 1);
        assertEq(bn.getRoomIdAt(0), roomId);

        (
            address partyAAddress,
            address partyBAddress,
            BlindNegotiation.RoomStatus status,
            uint256 createdAt,
            uint256 deadline,
            uint8 negotiationType,
            bool isResultPublished,
            bool matched,
            uint64 agreedPrice
        ) = bn.getRoomInfo(roomId);

        assertEq(partyAAddress, partyA);
        assertEq(partyBAddress, address(0));
        assertEq(uint8(status), uint8(BlindNegotiation.RoomStatus.PendingB));
        assertEq(createdAt, block.timestamp);
        assertEq(deadline, block.timestamp + 3600);
        assertEq(negotiationType, 0);
        assertFalse(isResultPublished);
        assertFalse(matched);
        assertEq(agreedPrice, 0);

        vm.stopPrank();
    }

    function testCreateRoomFailures() public {
        vm.startPrank(partyA);

        InEuint64 memory encFloor = InEuint64({
            ctHash: 80,
            securityZone: 0,
            utype: 5,
            signature: ""
        });

        // 1. Fail: Deadline in past
        vm.expectRevert("Deadline must be in the future");
        bn.createRoom(roomId, encFloor, 0, block.timestamp, "metadata");

        // 2. Fail: Invalid negotiation type
        vm.expectRevert("Invalid negotiation type");
        bn.createRoom(roomId, encFloor, 4, block.timestamp + 10, "metadata");

        // Success deploy
        bn.createRoom(roomId, encFloor, 0, block.timestamp + 10, "metadata");

        // 3. Fail: Room already exists
        vm.expectRevert("Room already exists");
        bn.createRoom(roomId, encFloor, 0, block.timestamp + 20, "metadata");

        vm.stopPrank();
    }

    function testSendInviteSuccess() public {
        vm.startPrank(partyA);

        InEuint64 memory encFloor = InEuint64({
            ctHash: 80,
            securityZone: 0,
            utype: 5,
            signature: ""
        });

        bn.createRoom(roomId, encFloor, 0, block.timestamp + 3600, "metadata");

        // Send invite to Party B
        bn.sendInvite(roomId, partyB);

        assertEq(bn.getSentInviteCount(partyA), 1);
        assertEq(bn.getReceivedInviteCount(partyB), 1);

        BlindNegotiation.Invite[] memory received = bn.getReceivedInvites(partyB);
        assertEq(received[0].roomId, roomId);
        assertEq(received[0].sender, partyA);
        assertEq(received[0].negotiationType, 0);

        BlindNegotiation.Invite[] memory sent = bn.getSentInvites(partyA);
        assertEq(sent[0].roomId, roomId);
        assertEq(sent[0].sender, partyA);

        vm.stopPrank();
    }

    function testSendInviteFailures() public {
        vm.startPrank(partyA);

        InEuint64 memory encFloor = InEuint64({
            ctHash: 80,
            securityZone: 0,
            utype: 5,
            signature: ""
        });

        bn.createRoom(roomId, encFloor, 0, block.timestamp + 3600, "metadata");

        // Fail: invite yourself
        vm.expectRevert("Cannot invite yourself");
        bn.sendInvite(roomId, partyA);

        // Fail: invite invalid recipient
        vm.expectRevert("Invalid recipient");
        bn.sendInvite(roomId, address(0));

        // Fail: invite for non-existent room
        vm.expectRevert("Room does not exist");
        bn.sendInvite(keccak256("other-room"), partyB);

        vm.stopPrank();

        // Fail: not the owner sending invite
        vm.startPrank(partyB);
        vm.expectRevert("Only room creator can send invites");
        bn.sendInvite(roomId, address(0x3333));
        vm.stopPrank();
    }

    function testJoinAndComputeMatch() public {
        // Party A creates room with floor = 80
        vm.startPrank(partyA);
        InEuint64 memory encFloor = InEuint64({
            ctHash: 80,
            securityZone: 0,
            utype: 5,
            signature: ""
        });
        bn.createRoom(roomId, encFloor, 0, block.timestamp + 3600, "metadata");
        vm.stopPrank();

        // Party B joins with ceiling = 96
        vm.startPrank(partyB);
        InEuint64 memory encCeiling = InEuint64({
            ctHash: 96,
            securityZone: 0,
            utype: 5,
            signature: ""
        });
        bn.joinAndCompute(roomId, encCeiling);

        (,, BlindNegotiation.RoomStatus status,,,,,,) = bn.getRoomInfo(roomId);
        assertEq(uint8(status), uint8(BlindNegotiation.RoomStatus.Settled));

        // Retrieve encrypted results and decode them
        (euint64 encAgreedPrice, ebool encMatched) = bn.getEncryptedResult(roomId);

        // Our MockTaskManager returns the exact values as handles
        uint256 agreedPrice = uint256(euint64.unwrap(encAgreedPrice));
        uint256 matched = uint256(ebool.unwrap(encMatched));

        assertEq(matched, 1); // matched = true (1)
        assertEq(agreedPrice, 88); // midpoint = (80 + 96) / 2 = 88
        vm.stopPrank();
    }

    function testJoinAndComputeNoMatch() public {
        // Party A creates room with floor = 100
        vm.startPrank(partyA);
        InEuint64 memory encFloor = InEuint64({
            ctHash: 100,
            securityZone: 0,
            utype: 5,
            signature: ""
        });
        bn.createRoom(roomId, encFloor, 0, block.timestamp + 3600, "metadata");
        vm.stopPrank();

        // Party B joins with ceiling = 90
        vm.startPrank(partyB);
        InEuint64 memory encCeiling = InEuint64({
            ctHash: 90,
            securityZone: 0,
            utype: 5,
            signature: ""
        });
        bn.joinAndCompute(roomId, encCeiling);

        (euint64 encAgreedPrice, ebool encMatched) = bn.getEncryptedResult(roomId);

        uint256 agreedPrice = uint256(euint64.unwrap(encAgreedPrice));
        uint256 matched = uint256(ebool.unwrap(encMatched));

        assertEq(matched, 2); // matched = false (2)
        assertEq(agreedPrice, 0); // midpoint = 0 when not matched
        vm.stopPrank();
    }

    function testJoinAndComputeFailures() public {
        // Party A creates room
        vm.startPrank(partyA);
        InEuint64 memory encFloor = InEuint64({
            ctHash: 80,
            securityZone: 0,
            utype: 5,
            signature: ""
        });
        bn.createRoom(roomId, encFloor, 0, block.timestamp + 3600, "metadata");
        
        // Fail: join own room
        InEuint64 memory encCeiling = InEuint64({
            ctHash: 90,
            securityZone: 0,
            utype: 5,
            signature: ""
        });
        vm.expectRevert("Cannot join your own room");
        bn.joinAndCompute(roomId, encCeiling);
        vm.stopPrank();

        // Join room successfully from Party B
        vm.startPrank(partyB);
        bn.joinAndCompute(roomId, encCeiling);

        // Fail: join already settled room
        vm.expectRevert("Room not accepting joins");
        bn.joinAndCompute(roomId, encCeiling);
        vm.stopPrank();

        // Expired room test
        bytes32 expiredRoomId = keccak256("expired-room");
        vm.startPrank(partyA);
        bn.createRoom(expiredRoomId, encFloor, 0, block.timestamp + 10, "metadata");
        vm.stopPrank();

        skip(20); // forward time past deadline

        vm.startPrank(partyB);
        vm.expectRevert("Room has expired");
        bn.joinAndCompute(expiredRoomId, encCeiling);
        vm.stopPrank();
    }

    function testPublishResult() public {
        // Setup room and settle it
        vm.startPrank(partyA);
        bn.createRoom(roomId, InEuint64(80, 0, 5, ""), 0, block.timestamp + 3600, "metadata");
        vm.stopPrank();

        vm.startPrank(partyB);
        bn.joinAndCompute(roomId, InEuint64(90, 0, 5, ""));
        vm.stopPrank();

        // Publish result from Party A
        vm.startPrank(partyA);
        bn.publishResult(roomId, true, 85);

        (,,,,,, bool isPublished, bool matched, uint64 agreedPrice) = bn.getRoomInfo(roomId);
        assertTrue(isPublished);
        assertTrue(matched);
        assertEq(agreedPrice, 85);

        // Check published result helper (used by escrow)
        (bool isPub, bool matchRes, uint64 pubPrice) = bn.getPublishedResult(roomId);
        assertTrue(isPub);
        assertTrue(matchRes);
        assertEq(pubPrice, 85);

        // Fail: publish again
        vm.expectRevert("Already published");
        bn.publishResult(roomId, true, 85);
        vm.stopPrank();

        // Fail: publish by non-party
        vm.startPrank(address(0x3333));
        vm.expectRevert("Not a party");
        bn.publishResult(roomId, true, 85);
        vm.stopPrank();
    }
}
