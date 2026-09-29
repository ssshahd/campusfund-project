// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CampusFund
 * @notice Decentralized crowdfunding contract that manages multiple campaigns,
 *         contributions, cancellation, finalization, withdrawals and refunds.
 * @dev All state changes follow checks-effects-interactions and are protected
 *      against reentrancy on every function that transfers Ether.
 */
contract CampusFund {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum State {
        Active,
        Successful,
        Failed,
        Cancelled
    }

    struct Campaign {
        uint256 id;
        address payable creator;
        string title;
        string description; // short description or off-chain metadata URI
        uint256 goal; // wei
        uint256 totalPledged; // wei
        uint256 remainingBalance; // wei still held by the contract for this campaign
        uint256 deadline; // absolute block timestamp
        State state;
        bool withdrawn;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    uint256 public campaignCount;

    /// campaignId => Campaign
    mapping(uint256 => Campaign) private campaigns;

    /// campaignId => contributor => amount contributed (refundable amount)
    mapping(uint256 => mapping(address => uint256)) private contributions;

    uint256 public constant MIN_DURATION = 1 hours;
    uint256 public constant MAX_DURATION = 30 days;

    bool private locked; // reentrancy lock

    // ---------------------------------------------------------------------
    // Custom errors
    // ---------------------------------------------------------------------

    error InvalidCampaign();
    error InvalidAmount();
    error InvalidDuration();
    error EmptyTitle();
    error UnauthorizedCaller();
    error InvalidState();
    error DeadlineNotReached();
    error DeadlinePassed();
    error NoFundsAvailable();
    error TransferFailed();
    error AlreadyWithdrawn();
    error DirectPaymentNotAllowed();
    error ReentrantCall();

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        string title,
        uint256 goal,
        uint256 deadline
    );

    event ContributionMade(
        uint256 indexed campaignId,
        address indexed contributor,
        uint256 amount,
        uint256 totalPledged
    );

    event CampaignCancelled(uint256 indexed campaignId, address indexed creator);

    event CampaignFinalized(uint256 indexed campaignId, State newState, uint256 totalPledged);

    event FundsWithdrawn(uint256 indexed campaignId, address indexed creator, uint256 amount);

    event RefundClaimed(uint256 indexed campaignId, address indexed contributor, uint256 amount);

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier nonReentrant() {
        if (locked) revert ReentrantCall();
        locked = true;
        _;
        locked = false;
    }

    modifier campaignExists(uint256 _campaignId) {
        if (_campaignId == 0 || _campaignId > campaignCount) revert InvalidCampaign();
        _;
    }

    // ---------------------------------------------------------------------
    // Campaign creation
    // ---------------------------------------------------------------------

    /**
     * @notice Creates a new crowdfunding campaign. Accepts no Ether.
     * @param _title Non-empty campaign title.
     * @param _description Short description or a metadata URI (no sensitive data on-chain).
     * @param _goal Positive funding goal, in wei.
     * @param _duration Campaign duration in seconds (1 hour <= duration <= 30 days).
     */
    function createCampaign(
        string calldata _title,
        string calldata _description,
        uint256 _goal,
        uint256 _duration
    ) external returns (uint256 campaignId) {
        if (bytes(_title).length == 0) revert EmptyTitle();
        if (_goal == 0) revert InvalidAmount();
        if (_duration < MIN_DURATION || _duration > MAX_DURATION) revert InvalidDuration();

        campaignCount += 1;
        campaignId = campaignCount;
        uint256 deadline = block.timestamp + _duration;

        Campaign storage c = campaigns[campaignId];
        c.id = campaignId;
        c.creator = payable(msg.sender);
        c.title = _title;
        c.description = _description;
        c.goal = _goal;
        c.deadline = deadline;
        c.state = State.Active;
        // totalPledged, remainingBalance, withdrawn default to 0/false

        emit CampaignCreated(campaignId, msg.sender, _title, _goal, deadline);
    }

    // ---------------------------------------------------------------------
    // Contributing
    // ---------------------------------------------------------------------

    /**
     * @notice Contribute Ether to an active campaign before its deadline.
     */
    function contribute(uint256 _campaignId) external payable campaignExists(_campaignId) {
        Campaign storage c = campaigns[_campaignId];

        if (c.state != State.Active) revert InvalidState();
        if (block.timestamp >= c.deadline) revert DeadlinePassed();
        if (msg.value == 0) revert InvalidAmount();

        contributions[_campaignId][msg.sender] += msg.value;
        c.totalPledged += msg.value;
        c.remainingBalance += msg.value;

        emit ContributionMade(_campaignId, msg.sender, msg.value, c.totalPledged);
    }

    // ---------------------------------------------------------------------
    // Cancellation
    // ---------------------------------------------------------------------

    /**
     * @notice Creator cancels an active campaign before its deadline.
     *         Does NOT push refunds; contributors must claim individually.
     */
    function cancelCampaign(uint256 _campaignId) external campaignExists(_campaignId) {
        Campaign storage c = campaigns[_campaignId];

        if (msg.sender != c.creator) revert UnauthorizedCaller();
        if (c.state != State.Active) revert InvalidState();
        if (block.timestamp >= c.deadline) revert DeadlinePassed();

        c.state = State.Cancelled;

        emit CampaignCancelled(_campaignId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Finalization
    // ---------------------------------------------------------------------

    /**
     * @notice Anyone may finalize an active campaign once its deadline has passed.
     */
    function finalizeCampaign(uint256 _campaignId) external campaignExists(_campaignId) {
        Campaign storage c = campaigns[_campaignId];

        if (c.state != State.Active) revert InvalidState();
        if (block.timestamp < c.deadline) revert DeadlineNotReached();

        if (c.totalPledged >= c.goal) {
            c.state = State.Successful;
        } else {
            c.state = State.Failed;
        }

        emit CampaignFinalized(_campaignId, c.state, c.totalPledged);
    }

    // ---------------------------------------------------------------------
    // Withdrawal (creator, successful campaigns)
    // ---------------------------------------------------------------------

    /**
     * @notice Creator withdraws the full remaining balance of a successful campaign, once.
     */
    function withdrawFunds(uint256 _campaignId) external campaignExists(_campaignId) nonReentrant {
        Campaign storage c = campaigns[_campaignId];

        if (msg.sender != c.creator) revert UnauthorizedCaller();
        if (c.state != State.Successful) revert InvalidState();
        if (c.withdrawn) revert AlreadyWithdrawn();

        uint256 amount = c.remainingBalance;
        if (amount == 0) revert NoFundsAvailable();

        // Effects before interactions
        c.withdrawn = true;
        c.remainingBalance = 0;

        (bool success, ) = c.creator.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit FundsWithdrawn(_campaignId, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Refunds (contributors, failed/cancelled campaigns)
    // ---------------------------------------------------------------------

    /**
     * @notice A contributor claims back their own contribution from a failed or
     *         cancelled campaign. Each contributor must call this individually.
     */
    function claimRefund(uint256 _campaignId) external campaignExists(_campaignId) nonReentrant {
        Campaign storage c = campaigns[_campaignId];

        if (c.state != State.Failed && c.state != State.Cancelled) revert InvalidState();

        uint256 amount = contributions[_campaignId][msg.sender];
        if (amount == 0) revert NoFundsAvailable();

        // Effects before interactions
        contributions[_campaignId][msg.sender] = 0;
        c.remainingBalance -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit RefundClaimed(_campaignId, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Public queries
    // ---------------------------------------------------------------------

    function getCampaign(uint256 _campaignId)
        external
        view
        campaignExists(_campaignId)
        returns (
            uint256 id,
            address creator,
            string memory title,
            string memory description,
            uint256 goal,
            uint256 totalPledged,
            uint256 remainingBalance,
            uint256 deadline,
            State state,
            bool withdrawn
        )
    {
        Campaign storage c = campaigns[_campaignId];
        return (
            c.id,
            c.creator,
            c.title,
            c.description,
            c.goal,
            c.totalPledged,
            c.remainingBalance,
            c.deadline,
            c.state,
            c.withdrawn
        );
    }

    function getContribution(uint256 _campaignId, address _contributor)
        external
        view
        campaignExists(_campaignId)
        returns (uint256)
    {
        return contributions[_campaignId][_contributor];
    }

    // ---------------------------------------------------------------------
    // Guard against direct payments
    // ---------------------------------------------------------------------

    receive() external payable {
        revert DirectPaymentNotAllowed();
    }

    fallback() external payable {
        revert DirectPaymentNotAllowed();
    }
}
