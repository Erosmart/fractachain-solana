use anchor_lang::prelude::*;

/// Same semantics (and close wording) as the Soroban panics so
/// `mapProgramError` can keep the Spanish UI texts.
#[error_code]
pub enum FractachainError {
    #[msg("Unauthorized admin")]
    UnauthorizedAdmin,
    #[msg("Already initialized")]
    AlreadyInitialized,
    #[msg("Amount must be positive")]
    NotPositive,
    #[msg("Amount must be a multiple of unit price")]
    NotDivisible,
    #[msg("Hard cap must be >= soft cap")]
    BadCaps,
    #[msg("Deadline must be in the future")]
    DeadlineInPast,
    #[msg("Country is GAFI blacklisted")]
    GafiBlacklisted,
    #[msg("KYC expiry must be in the future")]
    KycExpiryPast,
    #[msg("Whitelist authorization only allowed during Argentine business hours (Mon-Fri 08:00-16:00 ART)")]
    OutsideKycHours,
    #[msg("Buyer KYC not verified or expired")]
    KycNotVerified,
    #[msg("Recipient KYC not verified or expired")]
    RecipientKycNotVerified,
    #[msg("Licitacion not open")]
    NotOpen,
    #[msg("Deadline passed")]
    DeadlinePassed,
    #[msg("Exceeds hard cap")]
    ExceedsHardCap,
    #[msg("Insufficient minted supply")]
    InsufficientSupply,
    #[msg("Not in open state")]
    NotInOpenState,
    #[msg("Cannot finalize yet")]
    CannotFinalizeYet,
    #[msg("Refunds only available on failed licitacion")]
    NotFailed,
    #[msg("No balance to refund")]
    NothingToRefund,
    #[msg("Proceeds are only withdrawable after a successful licitacion")]
    ProceedsNotWithdrawable,
    #[msg("Proceeds already withdrawn")]
    ProceedsAlreadyWithdrawn,
    #[msg("Cannot change the payout wallet after contributions started")]
    ContributionsStarted,
    #[msg("Payment mint not allowlisted on the platform")]
    PaymentMintNotAllowed,
    #[msg("Offering not in draft state")]
    NotDraft,
    #[msg("Offering not minted yet")]
    NotMinted,
    #[msg("OPA not triggered")]
    OpaNotTriggered,
    #[msg("Not the OPA acquirer")]
    NotOpaAcquirer,
    #[msg("OPA cannot be launched in current state")]
    OpaBadState,
    #[msg("OPA price below equitable price floor")]
    OpaPriceTooLow,
    #[msg("No active OPA offer")]
    OpaNotActive,
    #[msg("OPA offer expired")]
    OpaExpired,
    #[msg("Acquirer cannot accept its own offer")]
    AcquirerCannotAccept,
    #[msg("OPA escrow exhausted")]
    OpaEscrowExhausted,
    #[msg("OPA offer still active")]
    OpaStillActive,
    #[msg("Squeeze-out only after successful issuance")]
    SqueezeOutNotAllowed,
    #[msg("Buyout price below equitable price floor")]
    SqueezePriceTooLow,
    #[msg("Squeeze-out threshold of 95% not met")]
    SqueezeThresholdNotMet,
    #[msg("Squeeze-out not executed")]
    SqueezeNotExecuted,
    #[msg("Acquirer cannot claim squeeze-out")]
    AcquirerCannotClaim,
    #[msg("Math overflow")]
    Overflow,
    #[msg("Account address does not match expected derivation")]
    InvalidAddress,
    #[msg("Not the contribution owner")]
    NotContributionOwner,
    #[msg("Nothing to withdraw")]
    NothingToWithdraw,
    #[msg("Nothing to reclaim")]
    NothingToReclaim,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Offering not terminated")]
    NotTerminated,
    #[msg("Contribution already settled")]
    NothingToDistribute,
    #[msg("Secondary market opens only after a successful close")]
    MarketBeforeClose,
}
