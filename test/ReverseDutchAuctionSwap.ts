import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { parseUnits } from "ethers";
import hre from "hardhat";

describe("ReverseDutchAuctionSwap", () => {
  const deployAuctionFixture = async () => {
    const [owner, seller, buyer] = await hre.ethers.getSigners();

    const AuctionToken = await hre.ethers.getContractFactory("AuctionToken");
    const tokenIn = await AuctionToken.deploy(owner);
    const tokenOut = await AuctionToken.deploy(owner);

    const ReverseDutchAuctionSwap = await hre.ethers.getContractFactory(
      "ReverseDutchAuctionSwap"
    );
    const auction = await ReverseDutchAuctionSwap.deploy();

    const INITIAL_BALANCE = parseUnits("1000", 18);
    await tokenIn.mint(seller.address, INITIAL_BALANCE);
    await tokenOut.mint(buyer.address, INITIAL_BALANCE);

    return {
      auction,
      tokenIn,
      tokenOut,
      owner,
      seller,
      buyer,
      INITIAL_BALANCE,
    };
  };

  describe("Auction Creation", () => {
    it("Should create an auction with valid parameters", async () => {
      const { auction, tokenIn, tokenOut, seller } = await loadFixture(
        deployAuctionFixture
      );

      const amountIn = parseUnits("100", 18);
      const startPrice = parseUnits("2", 18);
      const endPrice = parseUnits("1", 18);
      const duration = 3600; // 1 hour

      // Approve tokens
      await tokenIn.connect(seller).approve(auction.getAddress(), amountIn);

      const tx = await auction
        .connect(seller)
        .createAuction(
          await tokenIn.getAddress(),
          await tokenOut.getAddress(),
          amountIn,
          startPrice,
          endPrice,
          duration
        );

      const auctionId = 0;
      const auctionData = await auction.auctions(auctionId);

      expect(auctionData.seller).to.equal(seller.address);
      expect(auctionData.tokenIn).to.equal(await tokenIn.getAddress());
      expect(auctionData.tokenOut).to.equal(await tokenOut.getAddress());
      expect(auctionData.amountIn).to.equal(amountIn);
      expect(auctionData.startPrice).to.equal(startPrice);
      expect(auctionData.endPrice).to.equal(endPrice);
      expect(auctionData.finalized).to.be.false;

      await expect(tx)
        .to.emit(auction, "AuctionCreated")
        .withArgs(
          auctionId,
          seller.address,
          await tokenIn.getAddress(),
          await tokenOut.getAddress(),
          amountIn,
          startPrice,
          endPrice,
          auctionData.startTime,
          auctionData.endTime
        );
    });

    it("Should revert with invalid parameters", async () => {
      const { auction, tokenIn, tokenOut, seller } = await loadFixture(
        deployAuctionFixture
      );

      const amountIn = parseUnits("100", 18);
      const startPrice = parseUnits("2", 18);
      const endPrice = parseUnits("1", 18);
      const duration = 3600;

      await tokenIn.connect(seller).approve(auction.getAddress(), amountIn);

      await expect(
        auction
          .connect(seller)
          .createAuction(
            hre.ethers.ZeroAddress,
            await tokenOut.getAddress(),
            amountIn,
            startPrice,
            endPrice,
            duration
          )
      ).to.be.revertedWith("Invalid token in");

      await expect(
        auction
          .connect(seller)
          .createAuction(
            await tokenIn.getAddress(),
            await tokenOut.getAddress(),
            0,
            startPrice,
            endPrice,
            duration
          )
      ).to.be.revertedWith("Amount must be > 0");

      // Test invalid prices
      await expect(
        auction
          .connect(seller)
          .createAuction(
            await tokenIn.getAddress(),
            await tokenOut.getAddress(),
            amountIn,
            endPrice,
            startPrice,
            duration
          )
      ).to.be.revertedWith("Start price must be > end price");
    });
  });

  describe("Price Calculation", () => {
    it("Should calculate correct current price", async () => {
      const { auction, tokenIn, tokenOut, seller } = await loadFixture(
        deployAuctionFixture
      );

      const amountIn = parseUnits("100", 18);
      const startPrice = parseUnits("2", 18);
      const endPrice = parseUnits("1", 18);
      const duration = 3600;

      await tokenIn.connect(seller).approve(auction.getAddress(), amountIn);
      await auction
        .connect(seller)
        .createAuction(
          await tokenIn.getAddress(),
          await tokenOut.getAddress(),
          amountIn,
          startPrice,
          endPrice,
          duration
        );

      // Check price at start
      expect(await auction.getCurrentPrice(0)).to.equal(startPrice);

      // Check price at middle
      await time.increase(duration / 2);
      const midPrice = startPrice - (startPrice - endPrice) / 2n;
      expect(await auction.getCurrentPrice(0)).to.be.closeTo(
        midPrice,
        parseUnits("0.1", 18)
      );

      // Check price at end
      await time.increase(duration / 2);
      expect(await auction.getCurrentPrice(0)).to.equal(endPrice);
    });
  });

  describe("Swap Execution", () => {
    it("Should execute swap successfully", async () => {
      const { auction, tokenIn, tokenOut, seller, buyer } = await loadFixture(
        deployAuctionFixture
      );

      const amountIn = parseUnits("100", 18);
      const startPrice = parseUnits("2", 18);
      const endPrice = parseUnits("1", 18);
      const duration = 3600;

      await tokenIn.connect(seller).approve(auction.getAddress(), amountIn);
      await auction
        .connect(seller)
        .createAuction(
          await tokenIn.getAddress(),
          await tokenOut.getAddress(),
          amountIn,
          startPrice,
          endPrice,
          duration
        );

      const currentPrice = await auction.getCurrentPrice(0);
      const paymentAmount =
        (currentPrice * amountIn + parseUnits("0.5", 18)) / parseUnits("1", 18);

      await tokenOut
        .connect(buyer)
        .approve(auction.getAddress(), paymentAmount);

      const swapTx = await auction.connect(buyer).executeSwap(0);

      expect(await tokenIn.balanceOf(buyer.address)).to.equal(amountIn);
      expect(await tokenOut.balanceOf(seller.address)).to.be.closeTo(
        paymentAmount,
        parseUnits("0.0001", 18)
      );

      const auctionData = await auction.auctions(0);
      expect(auctionData.finalized).to.be.true;

      await expect(swapTx)
        .to.emit(auction, "AuctionFinalized")
        .withArgs(0, buyer.address, currentPrice, amountIn);
    });

    it("Should not allow execution after end time", async () => {
      const { auction, tokenIn, tokenOut, seller, buyer } = await loadFixture(
        deployAuctionFixture
      );

      const amountIn = parseUnits("100", 18);
      const startPrice = parseUnits("2", 18);
      const endPrice = parseUnits("1", 18);
      const duration = 3600;

      // Create auction
      await tokenIn.connect(seller).approve(auction.getAddress(), amountIn);
      await auction
        .connect(seller)
        .createAuction(
          await tokenIn.getAddress(),
          await tokenOut.getAddress(),
          amountIn,
          startPrice,
          endPrice,
          duration
        );

      // Move time past end
      await time.increase(duration + 1);

      // Try to execute swap
      await expect(auction.connect(buyer).executeSwap(0)).to.be.revertedWith(
        "Auction ended"
      );
    });
  });

  describe("Auction Cancellation", () => {
    it("Should allow seller to cancel auction", async () => {
      const { auction, tokenIn, tokenOut, seller } = await loadFixture(
        deployAuctionFixture
      );

      const amountIn = parseUnits("100", 18);
      const startPrice = parseUnits("2", 18);
      const endPrice = parseUnits("1", 18);
      const duration = (await time.latest()) + 3600;

      // Create auction
      await tokenIn.connect(seller).approve(auction.getAddress(), amountIn);
      await auction
        .connect(seller)
        .createAuction(
          await tokenIn.getAddress(),
          await tokenOut.getAddress(),
          amountIn,
          startPrice,
          endPrice,
          duration
        );

      const initialBalance = await tokenIn.balanceOf(seller.address);

      // Cancel auction
      await auction.connect(seller).cancelAuction(0);

      // Check tokens returned
      expect(await tokenIn.balanceOf(seller.address)).to.equal(
        initialBalance + amountIn
      );

      // Check auction status
      const auctionData = await auction.auctions(0);
      expect(auctionData.finalized).to.be.true;
    });

    it("Should not allow non-seller to cancel auction", async () => {
      const { auction, tokenIn, tokenOut, seller, buyer } = await loadFixture(
        deployAuctionFixture
      );

      const amountIn = parseUnits("100", 18);
      const startPrice = parseUnits("2", 18);
      const endPrice = parseUnits("1", 18);
      const duration = 3600;

      // Create auction
      await tokenIn.connect(seller).approve(auction.getAddress(), amountIn);
      await auction
        .connect(seller)
        .createAuction(
          await tokenIn.getAddress(),
          await tokenOut.getAddress(),
          amountIn,
          startPrice,
          endPrice,
          duration
        );

      // Try to cancel as non-seller
      await expect(auction.connect(buyer).cancelAuction(0)).to.be.revertedWith(
        "Not seller"
      );
    });
  });
});
