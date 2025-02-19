import { formatEther, parseEther } from "ethers";
import { ethers, network } from "hardhat";

async function main() {
  const [owner] = await ethers.getSigners();
  console.log("Deploying contracts with account:", owner.address);

  // Deploy tokens
  const AuctionToken = await ethers.getContractFactory("AuctionToken");

  console.log("\n Deploying Token In...");
  const tokenIn = await AuctionToken.deploy(owner.address);
  await tokenIn.waitForDeployment();

  console.log("\n Deploying Token Out...");
  const tokenOut = await AuctionToken.deploy(owner.address);
  await tokenOut.waitForDeployment();

  const tokenInAddr = await tokenIn.getAddress();
  const tokenOutAddr = await tokenOut.getAddress();

  console.log("Token In deployed to:", tokenInAddr);
  console.log("Token Out deployed to:", tokenOutAddr);

  // Deploy auction contract
  console.log("\n Deploying Auction Contract...");
  const ReverseDutchAuctionSwap = await ethers.getContractFactory(
    "ReverseDutchAuctionSwap"
  );
  const auction = await ReverseDutchAuctionSwap.deploy();
  await auction.waitForDeployment();
  const auctionAddr = await auction.getAddress();

  console.log("\n ReverseDutchAuctionSwap deployed to:", auctionAddr);

  // Setup auction parameters
  const amountIn = parseEther("1000");
  const startPrice = parseEther("2");
  const endPrice = parseEther("1");
  const duration = 3600;

  // Check initial balances
  const initialBalance = await tokenIn.balanceOf(owner.address);
  console.log("\n Initial token balance:", formatEther(initialBalance));

  // Mint additional tokens if needed
  if (initialBalance < amountIn) {
    console.log("\n Minting additional tokens...");
    const mintTx = await tokenIn.mint(owner.address, parseEther("10000"));
    await mintTx.wait();
    const newBalance = await tokenIn.balanceOf(owner.address);
    console.log("\nNew token balance:", formatEther(newBalance));
  }

  // Approve tokens
  console.log("\nApproving tokens...");
  const approveTx = await tokenIn.connect(owner).approve(auctionAddr, amountIn);
  await approveTx.wait();

  // Verify approval
  const allowance = await tokenIn.allowance(owner.address, auctionAddr);
  console.log("\n Allowance granted ✅:", formatEther(allowance));

  try {
    // Create auction
    console.log("\n Creating auction...");
    const createTx = await auction.createAuction(
      tokenInAddr,
      tokenOutAddr,
      amountIn,
      startPrice,
      endPrice,
      duration
    );

    console.log("\n Waiting for transaction confirmation...");
    const receipt = await createTx.wait();

    console.log("\n Auction created successfully ✅ : ", receipt?.hash);
  } catch (error: any) {
    console.error("Detailed error:");
    console.error(error);

    // Try to decode the error if possible
    if (error.data) {
      console.error("Error data:", error.data);
    }

    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
