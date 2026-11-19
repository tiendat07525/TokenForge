import { network } from "hardhat";
import { writeFileSync, mkdirSync } from "node:fs";

const SEPOLIA_CHAIN_ID = 11155111n;

// Tham số tokenomics của V2 – đổi tại đây nếu cần
const MAX_SUPPLY = "10000000"; // cap: 10,000,000 TFG
const INITIAL_SUPPLY = "1000000"; // mint cho owner khi deploy: 1,000,000 TFG

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  console.log("Deployer:", deployer.address, "| chainId:", chainId.toString());

  const cap = ethers.parseUnits(MAX_SUPPLY, 18);
  const initialSupply = ethers.parseUnits(INITIAL_SUPPLY, 18);

  const token = await ethers.deployContract("TokenForgeV2", [
    deployer.address, // initialOwner
    cap,
    initialSupply,
  ]);
  await token.waitForDeployment();

  const address = await token.getAddress();
  const tx = token.deploymentTransaction()!;
  const receipt = (await tx.wait())!;
  console.log("TokenForgeV2:", address, "| block:", receipt.blockNumber);
  console.log("cap:", MAX_SUPPLY, "TFG | initialSupply:", INITIAL_SUPPLY, "TFG");

  // Chỉ ghi file khi deploy thật lên Sepolia
  if (chainId === SEPOLIA_CHAIN_ID) {
    mkdirSync("deployments", { recursive: true });
    writeFileSync(
      "deployments/sepolia-v2.json",
      JSON.stringify(
        {
          contract: "TokenForgeV2",
          chainId: Number(chainId),
          address,
          deployBlock: receipt.blockNumber,
          txHash: tx.hash,
          initialOwner: deployer.address,
          cap: cap.toString(),
          initialSupply: initialSupply.toString(),
        },
        null,
        2
      )
    );
    console.log("Saved deployments/sepolia-v2.json");
    console.log(
      `\nVerify:\n  npx hardhat verify --network sepolia ${address} ${deployer.address} ${cap} ${initialSupply}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
