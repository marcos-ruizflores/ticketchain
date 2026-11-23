// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {EuroToken} from "../src/EuroToken.sol";
import {TicketMarket} from "../src/TicketMarket.sol";

contract TicketMarketTest is Test {
    EuroToken euro;
    TicketMarket market;

    address organizer = makeAddr("organizer");
    address scanner = makeAddr("scanner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    uint128 constant PRICE = 50e6; // 50 EURT
    uint64 startsAt;
    uint256 eventId;

    function setUp() public {
        euro = new EuroToken(address(this));
        market = new TicketMarket(euro);
        startsAt = uint64(block.timestamp + 30 days);

        // 3 tickets, max 2 per wallet, resale up to 110%, 5% to the organizer
        vm.prank(organizer);
        eventId = market.createEvent("Rosalia Live", "Palau Sant Jordi", startsAt, PRICE, 3, 2, 11_000, 500);

        address[3] memory fans = [alice, bob, carol];
        for (uint256 i; i < fans.length; ++i) {
            euro.mint(fans[i], 1_000e6);
            vm.prank(fans[i]);
            euro.approve(address(market), type(uint256).max);
        }
    }

    function _buy(address who) internal returns (uint256 tokenId) {
        vm.prank(who);
        tokenId = market.buy(eventId);
    }

    // ---------------------------------------------------------------- createEvent

    function test_CreateEvent_StoresConfig() public view {
        TicketMarket.EventInfo memory ev = market.getEvent(eventId);
        assertEq(ev.organizer, organizer);
        assertEq(ev.price, PRICE);
        assertEq(ev.maxSupply, 3);
        assertEq(ev.resaleCapBps, 11_000);
        assertEq(ev.name, "Rosalia Live");
    }

    function test_CreateEvent_RevertsOnBadConfig() public {
        vm.startPrank(organizer);
        vm.expectRevert(TicketMarket.InvalidEvent.selector); // in the past
        market.createEvent("A", "B", uint64(block.timestamp), PRICE, 10, 1, 11_000, 0);
        vm.expectRevert(TicketMarket.InvalidEvent.selector); // cap below face value
        market.createEvent("A", "B", startsAt, PRICE, 10, 1, 9_000, 0);
        vm.expectRevert(TicketMarket.InvalidEvent.selector); // cap above 2x
        market.createEvent("A", "B", startsAt, PRICE, 10, 1, 25_000, 0);
        vm.expectRevert(TicketMarket.InvalidEvent.selector); // royalty above 20%
        market.createEvent("A", "B", startsAt, PRICE, 10, 1, 11_000, 2_500);
        vm.stopPrank();
    }

    function test_CreateEvent_RejectsUnsafeText() public {
        vm.startPrank(organizer);
        vm.expectRevert(TicketMarket.InvalidText.selector);
        market.createEvent("<script>", "B", startsAt, PRICE, 10, 1, 11_000, 0);
        vm.expectRevert(TicketMarket.InvalidText.selector);
        market.createEvent('Bad "name"', "B", startsAt, PRICE, 10, 1, 11_000, 0);
        vm.expectRevert(TicketMarket.InvalidText.selector);
        market.createEvent("", "B", startsAt, PRICE, 10, 1, 11_000, 0);
        vm.expectRevert(TicketMarket.InvalidText.selector);
        market.createEvent("This name is way too long for a ticket", "B", startsAt, PRICE, 10, 1, 11_000, 0);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- buy

    function test_Buy_PaysOrganizerAndMints() public {
        uint256 tokenId = _buy(alice);

        assertEq(market.ownerOf(tokenId), alice);
        assertEq(euro.balanceOf(organizer), PRICE);
        assertEq(euro.balanceOf(alice), 1_000e6 - PRICE);
        (, uint32 seat,) = market.tickets(tokenId);
        assertEq(seat, 1);
        assertEq(market.ticketsHeld(eventId, alice), 1);
    }

    function test_Buy_SeatsAreSequential() public {
        _buy(alice);
        uint256 second = _buy(bob);
        (, uint32 seat,) = market.tickets(second);
        assertEq(seat, 2);
    }

    function test_Buy_RevertsWhenSoldOut() public {
        _buy(alice);
        _buy(alice);
        _buy(bob);
        vm.prank(carol);
        vm.expectRevert(TicketMarket.SoldOut.selector);
        market.buy(eventId);
    }

    function test_Buy_RevertsOverWalletLimit() public {
        _buy(alice);
        _buy(alice);
        vm.prank(alice);
        vm.expectRevert(TicketMarket.WalletLimitReached.selector);
        market.buy(eventId);
    }

    function test_Buy_RevertsAfterEventStarts() public {
        vm.warp(startsAt);
        vm.prank(alice);
        vm.expectRevert(TicketMarket.EventStarted.selector);
        market.buy(eventId);
    }

    function test_Buy_RevertsForUnknownEvent() public {
        vm.prank(alice);
        vm.expectRevert(TicketMarket.UnknownEvent.selector);
        market.buy(99);
    }

    // ---------------------------------------------------------------- resale

    function test_List_RevertsAboveCap() public {
        uint256 tokenId = _buy(alice);
        uint256 cap = market.maxResalePrice(tokenId); // 55 EURT
        assertEq(cap, 55e6);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TicketMarket.PriceAboveCap.selector, cap));
        market.list(tokenId, 55e6 + 1);
    }

    function test_List_OnlyOwner() public {
        uint256 tokenId = _buy(alice);
        vm.prank(bob);
        vm.expectRevert(TicketMarket.NotTicketOwner.selector);
        market.list(tokenId, PRICE);
    }

    function test_BuyListed_SplitsPaymentAndMovesTicket() public {
        uint256 tokenId = _buy(alice);
        vm.prank(alice);
        market.list(tokenId, 55e6);

        uint256 organizerBefore = euro.balanceOf(organizer);
        uint256 aliceBefore = euro.balanceOf(alice);

        vm.prank(bob);
        market.buyListed(tokenId);

        // 5% of 55 = 2.75 to the organizer, 52.25 to alice
        assertEq(market.ownerOf(tokenId), bob);
        assertEq(euro.balanceOf(organizer) - organizerBefore, 2.75e6);
        assertEq(euro.balanceOf(alice) - aliceBefore, 52.25e6);
        assertEq(euro.balanceOf(bob), 1_000e6 - 55e6);
        assertEq(market.ticketsHeld(eventId, alice), 0);
        assertEq(market.ticketsHeld(eventId, bob), 1);

        (address seller,) = market.listings(tokenId);
        assertEq(seller, address(0));
    }

    function test_BuyListed_RespectsWalletLimit() public {
        _buy(bob);
        _buy(bob);
        uint256 tokenId = _buy(alice);
        vm.prank(alice);
        market.list(tokenId, PRICE);

        vm.prank(bob);
        vm.expectRevert(TicketMarket.WalletLimitReached.selector);
        market.buyListed(tokenId);
    }

    function test_BuyListed_CannotBuyOwnTicket() public {
        uint256 tokenId = _buy(alice);
        vm.startPrank(alice);
        market.list(tokenId, PRICE);
        vm.expectRevert(TicketMarket.CannotBuyOwnTicket.selector);
        market.buyListed(tokenId);
        vm.stopPrank();
    }

    function test_BuyListed_ClosedOnceEventStarts() public {
        uint256 tokenId = _buy(alice);
        vm.prank(alice);
        market.list(tokenId, PRICE);

        vm.warp(startsAt);
        vm.prank(bob);
        vm.expectRevert(TicketMarket.EventStarted.selector);
        market.buyListed(tokenId);
    }

    function test_CancelListing() public {
        uint256 tokenId = _buy(alice);
        vm.startPrank(alice);
        market.list(tokenId, PRICE);
        market.cancelListing(tokenId);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(TicketMarket.NotListed.selector);
        market.buyListed(tokenId);
    }

    function test_DirectTransfersAreBlocked() public {
        uint256 tokenId = _buy(alice);
        vm.prank(alice);
        vm.expectRevert(TicketMarket.TransfersDisabled.selector);
        market.transferFrom(alice, bob, tokenId);
    }

    // ---------------------------------------------------------------- check-in

    function test_CheckIn_ByScanner() public {
        uint256 tokenId = _buy(alice);
        vm.prank(organizer);
        market.setScanner(eventId, scanner, true);

        vm.prank(scanner);
        market.checkIn(tokenId);
        (,, bool used) = market.tickets(tokenId);
        assertTrue(used);
    }

    function test_CheckIn_RevertsForStrangers() public {
        uint256 tokenId = _buy(alice);
        vm.prank(bob);
        vm.expectRevert(TicketMarket.NotScanner.selector);
        market.checkIn(tokenId);
    }

    function test_CheckIn_CannotReuseTicket() public {
        uint256 tokenId = _buy(alice);
        vm.startPrank(organizer);
        market.checkIn(tokenId);
        vm.expectRevert(TicketMarket.TicketAlreadyUsed.selector);
        market.checkIn(tokenId);
        vm.stopPrank();
    }

    function test_CheckIn_RemovesListingAndBlocksResale() public {
        uint256 tokenId = _buy(alice);
        vm.prank(alice);
        market.list(tokenId, PRICE);

        vm.prank(organizer);
        market.checkIn(tokenId);

        (address seller,) = market.listings(tokenId);
        assertEq(seller, address(0));
        vm.prank(alice);
        vm.expectRevert(TicketMarket.TicketAlreadyUsed.selector);
        market.list(tokenId, PRICE);
    }

    // ---------------------------------------------------------------- metadata

    function test_TokenURI_IsOnChainJson() public {
        uint256 tokenId = _buy(alice);
        string memory uri = market.tokenURI(tokenId);
        assertEq(_prefix(uri, 29), "data:application/json;base64,");
    }

    // ---------------------------------------------------------------- fuzz

    /// The seller and the organizer always get exactly what the buyer paid, never more.
    function testFuzz_ResaleSplitAddsUp(uint128 price, uint16 royaltyBps) public {
        royaltyBps = uint16(bound(royaltyBps, 0, market.MAX_ROYALTY_BPS()));
        vm.prank(organizer);
        uint256 id = market.createEvent("Fuzz Fest", "Somewhere", startsAt, PRICE, 10, 5, 20_000, royaltyBps);

        vm.prank(alice);
        uint256 tokenId = market.buy(id);
        price = uint128(bound(price, 1, market.maxResalePrice(tokenId)));
        vm.prank(alice);
        market.list(tokenId, price);

        uint256 totalBefore = euro.balanceOf(alice) + euro.balanceOf(organizer);
        vm.prank(bob);
        market.buyListed(tokenId);

        assertEq(euro.balanceOf(alice) + euro.balanceOf(organizer) - totalBefore, price);
        assertEq(euro.balanceOf(bob), 1_000e6 - price);
    }

    function testFuzz_ListNeverAboveCap(uint128 price) public {
        uint256 tokenId = _buy(alice);
        uint256 cap = market.maxResalePrice(tokenId);
        vm.assume(price > cap);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TicketMarket.PriceAboveCap.selector, cap));
        market.list(tokenId, price);
    }

    function _prefix(string memory s, uint256 len) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(len);
        for (uint256 i; i < len; ++i) out[i] = b[i];
        return string(out);
    }
}
