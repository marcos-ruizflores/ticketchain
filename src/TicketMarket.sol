// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TicketArt} from "./TicketArt.sol";

/// @title TicketMarket
/// @notice Concert tickets as NFTs. Organizers create events, fans buy tickets with
/// EURT and can only resell them here, never above the cap the organizer set.
/// The organizer gets a cut of every resale.
contract TicketMarket is ERC721, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_RESALE_CAP_BPS = 20_000; // nobody can allow more than 2x
    uint16 public constant MAX_ROYALTY_BPS = 2_000; // 20%
    uint16 private constant BPS = 10_000;

    struct EventInfo {
        address organizer;
        uint64 startsAt;
        uint32 maxSupply;
        uint32 sold;
        uint16 maxPerWallet;
        uint16 resaleCapBps; // 11_000 = resale up to 110% of face value
        uint16 royaltyBps;
        uint128 price;
        string name;
        string venue;
    }

    struct Ticket {
        uint256 eventId;
        uint32 seat;
        bool used;
    }

    struct Listing {
        address seller;
        uint128 price;
    }

    IERC20 public immutable euro;

    uint256 public eventCount;
    uint256 public ticketCount;

    mapping(uint256 eventId => EventInfo) private _events;
    mapping(uint256 tokenId => Ticket) public tickets;
    mapping(uint256 tokenId => Listing) public listings;
    mapping(uint256 eventId => mapping(address wallet => uint256)) public ticketsHeld;
    mapping(uint256 eventId => mapping(address wallet => bool)) public isScanner;

    // Only flipped on while the market itself moves a ticket.
    bool private _marketTransfer;

    event EventCreated(uint256 indexed eventId, address indexed organizer, string name, uint64 startsAt, uint128 price);
    event ScannerUpdated(uint256 indexed eventId, address indexed scanner, bool allowed);
    event TicketBought(uint256 indexed eventId, uint256 indexed tokenId, address indexed buyer, uint32 seat);
    event TicketListed(uint256 indexed tokenId, address indexed seller, uint128 price);
    event ListingCancelled(uint256 indexed tokenId);
    event TicketResold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint128 price, uint256 royalty);
    event TicketCheckedIn(uint256 indexed tokenId, address indexed scanner);

    error InvalidEvent();
    error InvalidText();
    error UnknownEvent();
    error NotOrganizer();
    error NotScanner();
    error EventStarted();
    error SoldOut();
    error WalletLimitReached();
    error NotTicketOwner();
    error TicketAlreadyUsed();
    error PriceAboveCap(uint256 cap);
    error NotListed();
    error CannotBuyOwnTicket();
    error TransfersDisabled();

    constructor(IERC20 euro_) ERC721("TicketChain", "TIX") {
        euro = euro_;
    }

    // ---------------------------------------------------------------- organizers

    function createEvent(
        string calldata name,
        string calldata venue,
        uint64 startsAt,
        uint128 price,
        uint32 maxSupply,
        uint16 maxPerWallet,
        uint16 resaleCapBps,
        uint16 royaltyBps
    ) external returns (uint256 eventId) {
        if (
            startsAt <= block.timestamp || price == 0 || maxSupply == 0 || maxPerWallet == 0
                || resaleCapBps < BPS || resaleCapBps > MAX_RESALE_CAP_BPS || royaltyBps > MAX_ROYALTY_BPS
        ) revert InvalidEvent();
        _checkText(name, 32);
        _checkText(venue, 40);

        eventId = ++eventCount;
        _events[eventId] = EventInfo({
            organizer: msg.sender,
            startsAt: startsAt,
            maxSupply: maxSupply,
            sold: 0,
            maxPerWallet: maxPerWallet,
            resaleCapBps: resaleCapBps,
            royaltyBps: royaltyBps,
            price: price,
            name: name,
            venue: venue
        });
        emit EventCreated(eventId, msg.sender, name, startsAt, price);
    }

    function setScanner(uint256 eventId, address scanner, bool allowed) external {
        if (_event(eventId).organizer != msg.sender) revert NotOrganizer();
        isScanner[eventId][scanner] = allowed;
        emit ScannerUpdated(eventId, scanner, allowed);
    }

    // ---------------------------------------------------------------- primary sale

    function buy(uint256 eventId) external nonReentrant returns (uint256 tokenId) {
        EventInfo storage ev = _event(eventId);
        if (block.timestamp >= ev.startsAt) revert EventStarted();
        if (ev.sold == ev.maxSupply) revert SoldOut();
        if (ticketsHeld[eventId][msg.sender] >= ev.maxPerWallet) revert WalletLimitReached();

        uint32 seat = ++ev.sold;
        tokenId = ++ticketCount;
        tickets[tokenId] = Ticket({eventId: eventId, seat: seat, used: false});

        euro.safeTransferFrom(msg.sender, ev.organizer, ev.price);
        _safeMint(msg.sender, tokenId);
        emit TicketBought(eventId, tokenId, msg.sender, seat);
    }

    // ---------------------------------------------------------------- resale

    function list(uint256 tokenId, uint128 price) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTicketOwner();
        Ticket storage t = tickets[tokenId];
        if (t.used) revert TicketAlreadyUsed();
        if (block.timestamp >= _events[t.eventId].startsAt) revert EventStarted();
        uint256 cap = maxResalePrice(tokenId);
        if (price == 0 || price > cap) revert PriceAboveCap(cap);

        listings[tokenId] = Listing({seller: msg.sender, price: price});
        emit TicketListed(tokenId, msg.sender, price);
    }

    function cancelListing(uint256 tokenId) external {
        if (listings[tokenId].seller != msg.sender) revert NotListed();
        delete listings[tokenId];
        emit ListingCancelled(tokenId);
    }

    function buyListed(uint256 tokenId) external nonReentrant {
        Listing memory listing = listings[tokenId];
        if (listing.seller == address(0)) revert NotListed();
        if (listing.seller == msg.sender) revert CannotBuyOwnTicket();

        Ticket storage t = tickets[tokenId];
        EventInfo storage ev = _events[t.eventId];
        if (block.timestamp >= ev.startsAt) revert EventStarted();
        if (ticketsHeld[t.eventId][msg.sender] >= ev.maxPerWallet) revert WalletLimitReached();

        delete listings[tokenId];
        uint256 royalty = uint256(listing.price) * ev.royaltyBps / BPS;

        if (royalty > 0) euro.safeTransferFrom(msg.sender, ev.organizer, royalty);
        euro.safeTransferFrom(msg.sender, listing.seller, listing.price - royalty);

        _marketTransfer = true;
        _safeTransfer(listing.seller, msg.sender, tokenId);
        _marketTransfer = false;

        emit TicketResold(tokenId, listing.seller, msg.sender, listing.price, royalty);
    }

    // ---------------------------------------------------------------- door

    function checkIn(uint256 tokenId) external {
        Ticket storage t = tickets[tokenId];
        _requireOwned(tokenId);
        if (_events[t.eventId].organizer != msg.sender && !isScanner[t.eventId][msg.sender]) revert NotScanner();
        if (t.used) revert TicketAlreadyUsed();

        t.used = true;
        delete listings[tokenId];
        emit TicketCheckedIn(tokenId, msg.sender);
    }

    // ---------------------------------------------------------------- views

    function getEvent(uint256 eventId) external view returns (EventInfo memory) {
        return _event(eventId);
    }

    function maxResalePrice(uint256 tokenId) public view returns (uint256) {
        EventInfo storage ev = _events[tickets[tokenId].eventId];
        return uint256(ev.price) * ev.resaleCapBps / BPS;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Ticket storage t = tickets[tokenId];
        EventInfo storage ev = _events[t.eventId];
        return TicketArt.tokenURI(
            TicketArt.Data({
                tokenId: tokenId,
                eventName: ev.name,
                venue: ev.venue,
                startsAt: ev.startsAt,
                seat: t.seat,
                price: ev.price,
                used: t.used
            })
        );
    }

    // ---------------------------------------------------------------- internals

    /// @dev Tickets only move through buy/buyListed. A plain transfer would let people
    /// sell off-market and dodge the price cap.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && !_marketTransfer) revert TransfersDisabled();

        uint256 eventId = tickets[tokenId].eventId;
        if (from != address(0)) ticketsHeld[eventId][from]--;
        if (to != address(0)) ticketsHeld[eventId][to]++;

        return super._update(to, tokenId, auth);
    }

    function _event(uint256 eventId) private view returns (EventInfo storage ev) {
        ev = _events[eventId];
        if (ev.organizer == address(0)) revert UnknownEvent();
    }

    /// @dev Names end up inside JSON and SVG, so keep them to plain printable ASCII.
    function _checkText(string calldata text, uint256 maxLength) private pure {
        bytes calldata b = bytes(text);
        if (b.length == 0 || b.length > maxLength) revert InvalidText();
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            if (c < 0x20 || c > 0x7e || c == '"' || c == "\\" || c == "<" || c == ">" || c == "&") {
                revert InvalidText();
            }
        }
    }
}
