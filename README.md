# Reverse Dutch Auction Swap

## Overview

ReverseDutchAuctionSwap is a smart contract that facilitates reverse Dutch auctions for token swaps on Ethereum. In this mechanism, the price of a token **starts high** and **gradually decreases** over time until a buyer accepts the price and executes the swap.

## Features

- Sellers create an auction by specifying:
  - Token to sell (`tokenIn`)
  - Token to receive (`tokenOut`)
  - Amount of `tokenIn` for sale
  - Starting price
  - Ending price
  - Auction duration
- The contract automatically calculates the **current price** based on elapsed time.
- Buyers can execute a swap at the **current price** before the auction ends.
- Sellers can **cancel** an auction before it is finalized.
- Uses **ReentrancyGuard** for security against reentrancy attacks.

## How It Works

1. **Seller Creates an Auction**
   - Calls `createAuction()` with token details and price parameters.
   - Transfers `tokenIn` to the contract.
   - Emits an `AuctionCreated` event.
2. **Price Decreases Over Time**
   - Buyers can call `getCurrentPrice()` to check the current auction price.
3. **Buyer Executes the Swap**
   - Calls `executeSwap()` before the auction ends.
   - Pays the current price in `tokenOut`.
   - Receives `tokenIn` from the contract.
   - Emits an `AuctionFinalized` event.
4. **Seller Can Cancel**
   - Calls `cancelAuction()` before finalization.
   - Receives back the `tokenIn`.

## Security Considerations

- **Reentrancy Protection:** Uses `ReentrancyGuard` to prevent reentrancy attacks.
- **Token Approvals Required:** Buyers and sellers must approve the contract for token transfers.
- **Auction Finalization:** Ensures an auction cannot be finalized more than once.

## Scripts
<img width="960" alt="auction_script" src="https://github.com/user-attachments/assets/07d22888-797c-4d43-a932-625d33f2fdde" />

## Tests
<img width="960" alt="auction_test" src="https://github.com/user-attachments/assets/7df9b2d0-0280-4b64-9034-14214c98f47f" />
