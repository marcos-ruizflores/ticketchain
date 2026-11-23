// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title TicketArt
/// @notice Builds the ticket metadata and SVG fully on-chain, so the NFT
/// doesn't depend on any server or IPFS pin staying alive.
library TicketArt {
    using Strings for uint256;

    struct Data {
        uint256 tokenId;
        string eventName;
        string venue;
        uint64 startsAt;
        uint32 seat;
        uint256 price; // 6 decimals
        bool used;
    }

    function tokenURI(Data memory d) internal pure returns (string memory) {
        string memory seat = uint256(d.seat).toString();
        string memory json = string.concat(
            '{"name":"', d.eventName, " #", seat,
            '","description":"Ticket for ', d.eventName, " at ", d.venue,
            '. Resale is capped by the contract.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(_svg(d))),
            '",'
        );
        json = string.concat(
            json,
            '"attributes":[{"trait_type":"Venue","value":"', d.venue,
            '"},{"trait_type":"Date","value":"', _date(d.startsAt),
            '"},{"trait_type":"Seat","value":', seat,
            '},{"trait_type":"Status","value":"', d.used ? "Used" : "Valid", '"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _svg(Data memory d) private pure returns (string memory) {
        string memory left = string.concat(
            '<text x="24" y="50" fill="#f8fafc" font-size="20" font-weight="bold">', d.eventName,
            '</text><text x="24" y="76" fill="#94a3b8" font-size="13">', d.venue,
            '</text><text x="24" y="148" fill="#cbd5e1" font-size="13">', _date(d.startsAt),
            '</text><text x="24" y="172" fill="#cbd5e1" font-size="13">', _price(d.price), " EURT</text>"
        );
        string memory stub = string.concat(
            '<text x="345" y="72" fill="#94a3b8" font-size="12" text-anchor="middle">SEAT</text>',
            '<text x="345" y="112" fill="#f8fafc" font-size="30" text-anchor="middle">', uint256(d.seat).toString(),
            '</text><text x="345" y="160" fill="', d.used ? "#f87171" : "#4ade80",
            '" font-size="14" text-anchor="middle">', d.used ? "USED" : "VALID", "</text>"
        );
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" font-family="monospace">',
            '<rect width="400" height="200" rx="16" fill="#0f172a"/>',
            '<path d="M290 0h94a16 16 0 0 1 16 16v168a16 16 0 0 1-16 16h-94z" fill="#1e293b"/>',
            '<line x1="290" y1="14" x2="290" y2="186" stroke="#475569" stroke-dasharray="6 6"/>',
            left,
            stub,
            "</svg>"
        );
    }

    /// @dev 45_500000 -> "45.50"
    function _price(uint256 amount) private pure returns (string memory) {
        uint256 cents = (amount / 1e4) % 100;
        return string.concat((amount / 1e6).toString(), cents < 10 ? ".0" : ".", cents.toString());
    }

    /// @dev Unix timestamp -> "YYYY-MM-DD" (UTC), Howard Hinnant's days-to-civil algorithm.
    function _date(uint64 timestamp) private pure returns (string memory) {
        int256 z = int256(uint256(timestamp / 86400)) + 719468;
        int256 era = z / 146097;
        int256 doe = z - era * 146097;
        int256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        int256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        int256 mp = (5 * doy + 2) / 153;
        int256 day = doy - (153 * mp + 2) / 5 + 1;
        int256 month = mp < 10 ? mp + 3 : mp - 9;
        int256 year = yoe + era * 400 + (month <= 2 ? int256(1) : int256(0));
        return string.concat(
            uint256(year).toString(), "-", _pad(uint256(month)), "-", _pad(uint256(day))
        );
    }

    function _pad(uint256 n) private pure returns (string memory) {
        return n < 10 ? string.concat("0", n.toString()) : n.toString();
    }
}
