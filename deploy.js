const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying CampusFund with account:", deployer.address);

  const CampusFund = await hre.ethers.getContractFactory("CampusFund");
  const campusFund = await CampusFund.deploy();
  await campusFund.waitForDeployment();

  const address = await campusFund.getAddress();
  console.log("CampusFund deployed to:", address);

  // Keep the frontend synchronized with the contract deployed on the
  // current local Hardhat node. This avoids stale addresses after a restart.
  const configPath = path.resolve(__dirname, "../frontend/src/contractConfig.js");
  const config = fs.readFileSync(configPath, "utf8");
  const updatedConfig = config.replace(
    /export const CONTRACT_ADDRESS\s*=\s*"0x[a-fA-F0-9]{40}";/,
    `export const CONTRACT_ADDRESS = "${address}";`
  );

  if (updatedConfig === config) {
    throw new Error("Could not update CONTRACT_ADDRESS in frontend/src/contractConfig.js");
  }

  fs.writeFileSync(configPath, updatedConfig, "utf8");
  console.log("Frontend contract address updated automatically:", configPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
