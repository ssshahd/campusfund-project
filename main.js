import { ethers } from "ethers";
import {
  CONTRACT_ADDRESS,
  CONTRACT_ABI,
  EXPECTED_CHAIN_ID,
  STATE_LABELS,
} from "./contractConfig.js";

// ---------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------
let provider;
let signer;
let contract; // connected to signer, used for writes
let readContract; // connected to provider, used for reads
let userAddress = null;
let currentCampaignId = null;

// ---------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------
const el = {
  connectBtn: document.getElementById("connectBtn"),
  walletAddress: document.getElementById("walletAddress"),
  networkWarning: document.getElementById("networkWarning"),
  statusBox: document.getElementById("statusBox"),

  createForm: document.getElementById("createForm"),
  cTitle: document.getElementById("cTitle"),
  cDescription: document.getElementById("cDescription"),
  cGoal: document.getElementById("cGoal"),
  cDuration: document.getElementById("cDuration"),

  loadForm: document.getElementById("loadForm"),
  loadId: document.getElementById("loadId"),

  campaignSection: document.getElementById("campaignSection"),
  campaignDetails: document.getElementById("campaignDetails"),

  contributeForm: document.getElementById("contributeForm"),
  contributeAmount: document.getElementById("contributeAmount"),

  cancelBtn: document.getElementById("cancelBtn"),
  finalizeBtn: document.getElementById("finalizeBtn"),
  withdrawBtn: document.getElementById("withdrawBtn"),
  refundBtn: document.getElementById("refundBtn"),
};

// ---------------------------------------------------------------------
// Status / transaction feedback helper
// ---------------------------------------------------------------------
function setStatus(message, type = "info") {
  el.statusBox.textContent = message;
  el.statusBox.className = `status status-${type}`;
  el.statusBox.classList.remove("hidden");
}

function clearStatus() {
  el.statusBox.classList.add("hidden");
}

// ---------------------------------------------------------------------
// Wallet connection
// ---------------------------------------------------------------------
async function connectWallet() {
  if (!window.ethereum) {
    setStatus("MetaMask (or another injected wallet) was not found in this browser.", "error");
    return;
  }

  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    userAddress = accounts[0];
    signer = await provider.getSigner();

    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

    el.walletAddress.textContent = shortenAddress(userAddress);
    el.connectBtn.textContent = "Connected";
    el.connectBtn.disabled = true;

    await checkNetwork();

    window.ethereum.on("accountsChanged", () => window.location.reload());
    window.ethereum.on("chainChanged", () => window.location.reload());

    clearStatus();
  } catch (err) {
    setStatus(`Wallet connection failed: ${extractErrorMessage(err)}`, "error");
  }
}

async function checkNetwork() {
  const network = await provider.getNetwork();
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    el.networkWarning.classList.remove("hidden");
    el.networkWarning.textContent = `Wrong network. Please connect to the local Hardhat network (chainId ${EXPECTED_CHAIN_ID}). Currently connected to chainId ${network.chainId}.`;
  } else {
    el.networkWarning.classList.add("hidden");
  }
}

function shortenAddress(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ---------------------------------------------------------------------
// Error decoding helper
// ---------------------------------------------------------------------
function extractErrorMessage(err) {
  if (err?.reason) return err.reason;
  if (err?.shortMessage) return err.shortMessage;
  if (err?.data?.message) return err.data.message;
  if (err?.message) return err.message;
  return "Unknown error";
}

function requireWallet() {
  if (!contract || !signer) {
    setStatus("Please connect your wallet first.", "error");
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------
// Generic transaction runner with full lifecycle status messages
// ---------------------------------------------------------------------
async function runTx(txPromiseFactory, pendingLabel, successLabel) {
  try {
    setStatus(`${pendingLabel} — waiting for wallet approval...`, "info");
    const tx = await txPromiseFactory();
    setStatus(`Transaction submitted (${tx.hash.slice(0, 10)}...). Waiting for confirmation...`, "info");
    const receipt = await tx.wait();
    if (receipt.status === 1) {
      setStatus(`${successLabel} confirmed in block ${receipt.blockNumber}.`, "success");
    } else {
      setStatus(`Transaction reverted on-chain.`, "error");
    }
    return receipt;
  } catch (err) {
    if (err?.code === "ACTION_REJECTED" || err?.code === 4001) {
      setStatus("Transaction rejected in wallet.", "error");
    } else {
      setStatus(`Transaction failed: ${extractErrorMessage(err)}`, "error");
    }
    return null;
  }
}

// ---------------------------------------------------------------------
// Campaign creation
// ---------------------------------------------------------------------
async function handleCreateCampaign(evt) {
  evt.preventDefault();
  if (!requireWallet()) return;

  const title = el.cTitle.value.trim();
  const description = el.cDescription.value.trim();
  const goalEth = el.cGoal.value.trim();
  const durationHours = el.cDuration.value.trim();

  if (!title || !goalEth || !durationHours) {
    setStatus("Please fill in title, goal, and duration.", "error");
    return;
  }

  const goalWei = ethers.parseEther(goalEth);
  const durationSeconds = Math.floor(Number(durationHours) * 3600);

  const receipt = await runTx(
    () => contract.createCampaign(title, description, goalWei, durationSeconds),
    "Creating campaign",
    "Campaign creation"
  );

  if (receipt) {
    el.createForm.reset();
    // Best-effort: load the newly created campaign using the current count
    const count = await readContract.campaignCount();
    el.loadId.value = count.toString();
    await loadCampaign(count);
  }
}

// ---------------------------------------------------------------------
// Loading / displaying a campaign
// ---------------------------------------------------------------------
async function handleLoadCampaign(evt) {
  evt.preventDefault();
  const id = el.loadId.value.trim();
  if (!id) return;
  await loadCampaign(id);
}

async function loadCampaign(id) {
  if (!readContract) {
    setStatus("Please connect your wallet first to read contract data.", "error");
    return;
  }

  try {
    const c = await readContract.getCampaign(id);
    currentCampaignId = id;
    renderCampaign(c);
    el.campaignSection.classList.remove("hidden");
    clearStatus();
  } catch (err) {
    el.campaignSection.classList.add("hidden");
    setStatus(`Could not load campaign #${id}: ${extractErrorMessage(err)}`, "error");
  }
}

async function renderCampaign(c) {
  const goalEth = ethers.formatEther(c.goal);
  const pledgedEth = ethers.formatEther(c.totalPledged);
  const remainingEth = ethers.formatEther(c.remainingBalance);
  const pct = c.goal > 0n ? Number((c.totalPledged * 10000n) / c.goal) / 100 : 0;
  const deadlineDate = new Date(Number(c.deadline) * 1000);
  const stateLabel = STATE_LABELS[Number(c.state)];

  let myContribution = "0";
  if (userAddress) {
    const amount = await readContract.getContribution(c.id, userAddress);
    myContribution = ethers.formatEther(amount);
  }

  el.campaignDetails.innerHTML = `
    <h3>#${c.id} — ${escapeHtml(c.title)}</h3>
    <p class="description">${escapeHtml(c.description)}</p>
    <dl class="details-grid">
      <dt>Creator</dt><dd>${shortenAddress(c.creator)}</dd>
      <dt>State</dt><dd><span class="badge badge-${stateLabel.toLowerCase()}">${stateLabel}</span></dd>
      <dt>Goal</dt><dd>${goalEth} ETH</dd>
      <dt>Pledged</dt><dd>${pledgedEth} ETH (${pct}%)</dd>
      <dt>Remaining balance</dt><dd>${remainingEth} ETH</dd>
      <dt>Deadline</dt><dd>${deadlineDate.toLocaleString()}</dd>
      <dt>Withdrawn</dt><dd>${c.withdrawn ? "Yes" : "No"}</dd>
      <dt>Your contribution</dt><dd>${myContribution} ETH</dd>
    </dl>
  `;

  // Toggle action availability based on state / role — the contract is the
  // final authority; this only improves UX by hiding irrelevant buttons.
  const isCreator = userAddress && userAddress.toLowerCase() === c.creator.toLowerCase();
  const isActive = stateLabel === "Active";
    const latestBlock = await provider.getBlock("latest");
    const isPastDeadline = Number(latestBlock.timestamp) >= Number(c.deadline);

  el.contributeForm.classList.toggle("hidden", !isActive || isPastDeadline);
  el.cancelBtn.classList.toggle("hidden", !(isCreator && isActive && !isPastDeadline));
  el.finalizeBtn.classList.toggle("hidden", !(isActive && isPastDeadline));
  el.withdrawBtn.classList.toggle("hidden", !(isCreator && stateLabel === "Successful" && !c.withdrawn));
  const hasRefundableContribution = Number(myContribution) > 0;

el.refundBtn.classList.toggle(
  "hidden",
  !((stateLabel === "Failed" || stateLabel === "Cancelled") && hasRefundableContribution)
);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Contribute
// ---------------------------------------------------------------------
async function handleContribute(evt) {
  evt.preventDefault();
  if (!requireWallet() || !currentCampaignId) return;

  const amount = el.contributeAmount.value.trim();
  if (!amount) {
    setStatus("Please enter an amount to contribute.", "error");
    return;
  }

  const value = ethers.parseEther(amount);
  const receipt = await runTx(
    () => contract.contribute(currentCampaignId, { value }),
    "Contributing",
    "Contribution"
  );

  if (receipt) {
    el.contributeAmount.value = "";
    await loadCampaign(currentCampaignId);
  }
}

// ---------------------------------------------------------------------
// Cancel / finalize / withdraw / refund
// ---------------------------------------------------------------------
async function handleCancel() {
  if (!requireWallet() || !currentCampaignId) return;
  const receipt = await runTx(
    () => contract.cancelCampaign(currentCampaignId),
    "Cancelling campaign",
    "Cancellation"
  );
  if (receipt) await loadCampaign(currentCampaignId);
}

async function handleFinalize() {
  if (!requireWallet() || !currentCampaignId) return;
  const receipt = await runTx(
    () => contract.finalizeCampaign(currentCampaignId),
    "Finalizing campaign",
    "Finalization"
  );
  if (receipt) await loadCampaign(currentCampaignId);
}

async function handleWithdraw() {
  if (!requireWallet() || !currentCampaignId) return;
  const receipt = await runTx(
    () => contract.withdrawFunds(currentCampaignId),
    "Withdrawing funds",
    "Withdrawal"
  );
  if (receipt) await loadCampaign(currentCampaignId);
}

async function handleRefund() {
  if (!requireWallet() || !currentCampaignId) return;
  const receipt = await runTx(
    () => contract.claimRefund(currentCampaignId),
    "Claiming refund",
    "Refund"
  );
  if (receipt) await loadCampaign(currentCampaignId);
}

// ---------------------------------------------------------------------
// Wire up event listeners
// ---------------------------------------------------------------------
el.connectBtn.addEventListener("click", connectWallet);
el.createForm.addEventListener("submit", handleCreateCampaign);
el.loadForm.addEventListener("submit", handleLoadCampaign);
el.contributeForm.addEventListener("submit", handleContribute);
el.cancelBtn.addEventListener("click", handleCancel);
el.finalizeBtn.addEventListener("click", handleFinalize);
el.withdrawBtn.addEventListener("click", handleWithdraw);
el.refundBtn.addEventListener("click", handleRefund);
