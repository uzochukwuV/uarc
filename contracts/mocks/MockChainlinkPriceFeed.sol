// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockChainlinkPriceFeed
 * @notice Mock implementation of Chainlink Price Feed for testing
 */
contract MockChainlinkPriceFeed {
    uint8 public constant decimals = 8;
    string public description = "ETH / USD";
    uint256 public constant version = 1;

    struct RoundData {
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    RoundData private _latestRound;

    constructor(int256 initialPrice) {
        _latestRound = RoundData({
            roundId: 1,
            answer: initialPrice,
            startedAt: block.timestamp,
            updatedAt: block.timestamp,
            answeredInRound: 1
        });
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (
            _latestRound.roundId,
            _latestRound.answer,
            _latestRound.startedAt,
            _latestRound.updatedAt,
            _latestRound.answeredInRound
        );
    }

    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        // Simplified: only return latest round
        require(_roundId == _latestRound.roundId, "Round not found");
        return (
            _latestRound.roundId,
            _latestRound.answer,
            _latestRound.startedAt,
            _latestRound.updatedAt,
            _latestRound.answeredInRound
        );
    }

    /**
     * @notice Update the price (for testing)
     */
    function updatePrice(int256 newPrice) external {
        _latestRound.roundId++;
        _latestRound.answer = newPrice;
        _latestRound.startedAt = block.timestamp;
        _latestRound.updatedAt = block.timestamp;
        _latestRound.answeredInRound = _latestRound.roundId;
    }

    /**
     * @notice Set a custom timestamp for testing staleness
     */
    function setUpdatedAt(uint256 timestamp) external {
        _latestRound.updatedAt = timestamp;
    }
}
