# CampusFund

CampusFund is a local Ethereum crowdfunding dApp built with Solidity, Hardhat, Vite, ethers.js, and MetaMask.

## Requirements
- Node.js / npm
- MetaMask browser extension

## Run the project

### 1. Install contract dependencies
From the project root:

```bash
npm install
```

### 2. Start the local Hardhat network
Keep this terminal open:

```bash
npx hardhat node
```

The expected network is:
- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`

### 3. Deploy CampusFund
In a second terminal from the project root:

```bash
npm run deploy:localhost
```

The deployment script automatically writes the newly deployed contract address into `frontend/src/contractConfig.js`.

### 4. Install and run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open the local Vite URL shown in the terminal, connect MetaMask, and select the Hardhat Local network.

## Tests
From the project root:

```bash
npx hardhat compile
npx hardhat test
```

## Submission hygiene
This package intentionally excludes `node_modules`, Hardhat `artifacts`, generated `cache` directories, private keys, seed phrases, and real wallet information.
## Assumptions and deviations
No deviations from the project specification were made. The implementation follows the required Solidity/Hardhat/Vite/ethers.js/MetaMask local-development environment.

## On-chain data privacy
Campaign titles and descriptions/metadata URIs are stored on-chain and are therefore public. Users must not enter passwords, private keys, seed phrases, personal secrets, or other sensitive information in these fields. The frontend displays this warning directly below the description field.

## Code documentation and helper contracts
`CampusFund.sol` uses clear function names and function-level NatSpec/comments for the important campaign operations and security-sensitive Ether transfers. No separate test helper contracts are used; the submission contains the single main contract `contracts/CampusFund.sol`.
