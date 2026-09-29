// Replace this with the address printed by `npm run deploy:localhost`
// in the root Hardhat project after deploying CampusFund.sol
export const CONTRACT_ADDRESS ="0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

// Local Hardhat network (chainId 31337)
export const EXPECTED_CHAIN_ID = 31337n;
export const EXPECTED_CHAIN_ID_HEX = "0x7a69";

export const CONTRACT_ABI = [
  "function campaignCount() view returns (uint256)",
  "function createCampaign(string _title, string _description, uint256 _goal, uint256 _duration) returns (uint256)",
  "function contribute(uint256 _campaignId) payable",
  "function cancelCampaign(uint256 _campaignId)",
  "function finalizeCampaign(uint256 _campaignId)",
  "function withdrawFunds(uint256 _campaignId)",
  "function claimRefund(uint256 _campaignId)",
  "function getCampaign(uint256 _campaignId) view returns (uint256 id, address creator, string title, string description, uint256 goal, uint256 totalPledged, uint256 remainingBalance, uint256 deadline, uint8 state, bool withdrawn)",
  "function getContribution(uint256 _campaignId, address _contributor) view returns (uint256)",

  "event CampaignCreated(uint256 indexed campaignId, address indexed creator, string title, uint256 goal, uint256 deadline)",
  "event ContributionMade(uint256 indexed campaignId, address indexed contributor, uint256 amount, uint256 totalPledged)",
  "event CampaignCancelled(uint256 indexed campaignId, address indexed creator)",
  "event CampaignFinalized(uint256 indexed campaignId, uint8 newState, uint256 totalPledged)",
  "event FundsWithdrawn(uint256 indexed campaignId, address indexed creator, uint256 amount)",
  "event RefundClaimed(uint256 indexed campaignId, address indexed contributor, uint256 amount)",

  "error InvalidCampaign()",
  "error InvalidAmount()",
  "error InvalidDuration()",
  "error EmptyTitle()",
  "error UnauthorizedCaller()",
  "error InvalidState()",
  "error DeadlineNotReached()",
  "error DeadlinePassed()",
  "error NoFundsAvailable()",
  "error TransferFailed()",
  "error AlreadyWithdrawn()",
  "error DirectPaymentNotAllowed()",
  "error ReentrantCall()",
];

export const STATE_LABELS = ["Active", "Successful", "Failed", "Cancelled"];
