// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ReverseDutchAuctionSwap is ReentrancyGuard {
    struct Auction {
        address seller;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 startPrice;
        uint256 endPrice;
        uint256 startTime;
        uint256 endTime;
        bool finalized;
    }

    mapping(uint256 => Auction) public auctions;
    uint256 public auctionCounter;

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 startPrice,
        uint256 endPrice,
        uint256 startTime,
        uint256 endTime
    );

    event AuctionFinalized(
        uint256 indexed auctionId,
        address indexed buyer,
        uint256 finalPrice,
        uint256 amountIn
    );

    function createAuction(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _startPrice,
        uint256 _endPrice,
        uint256 _duration
    ) external returns (uint256) {
        require(_tokenIn != address(0), "Invalid token in");
        require(_tokenOut != address(0), "Invalid token out");
        require(_amountIn > 0, "Amount must be > 0");
        require(_startPrice > _endPrice, "Start price must be > end price");
        require(_duration > 0, "Duration must be > 0");

        IERC20(_tokenIn).transferFrom(msg.sender, address(this), _amountIn);

        uint256 auctionId = auctionCounter++;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + _duration;

        auctions[auctionId] = Auction({
            seller: msg.sender,
            tokenIn: _tokenIn,
            tokenOut: _tokenOut,
            amountIn: _amountIn,
            startPrice: _startPrice,
            endPrice: _endPrice,
            startTime: startTime,
            endTime: endTime,
            finalized: false
        });

        emit AuctionCreated(
            auctionId,
            msg.sender,
            _tokenIn,
            _tokenOut,
            _amountIn,
            _startPrice,
            _endPrice,
            startTime,
            endTime
        );

        return auctionId;
    }

    function getCurrentPrice(uint256 _auctionId) public view returns (uint256) {
        Auction storage auction = auctions[_auctionId];
        require(!auction.finalized, "Auction already finalized");

        if (block.timestamp >= auction.endTime) {
            return auction.endPrice;
        }

        uint256 elapsed = block.timestamp - auction.startTime;
        uint256 duration = auction.endTime - auction.startTime;
        uint256 priceDiff = auction.startPrice - auction.endPrice;

        return
            auction.startPrice -
            ((priceDiff * elapsed * 1e18) / duration) /
            1e18;
    }

    function executeSwap(uint256 _auctionId) external nonReentrant {
        Auction storage auction = auctions[_auctionId];
        require(!auction.finalized, "Auction already finalized");
        require(block.timestamp <= auction.endTime, "Auction ended");

        uint256 currentPrice = getCurrentPrice(_auctionId);
        // Calculate exactly as in the test
        uint256 paymentAmount = (currentPrice * auction.amountIn) / 1e18;

        IERC20(auction.tokenOut).transferFrom(
            msg.sender,
            auction.seller,
            paymentAmount
        );
        IERC20(auction.tokenIn).transfer(msg.sender, auction.amountIn);

        auction.finalized = true;

        emit AuctionFinalized(
            _auctionId,
            msg.sender,
            currentPrice,
            auction.amountIn
        );
    }

    function cancelAuction(uint256 _auctionId) external {
        Auction storage auction = auctions[_auctionId];
        require(msg.sender == auction.seller, "Not seller");
        require(!auction.finalized, "Already finalized");

        auction.finalized = true;
        IERC20(auction.tokenIn).transfer(auction.seller, auction.amountIn);
    }
}
