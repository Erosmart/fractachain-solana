use anchor_lang::prelude::*;

#[event]
pub struct PlatformInitialized {
    pub admin: Pubkey,
    pub fee_bps: u16,
}

#[event]
pub struct AdminTransferred {
    pub previous: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct PaymentMintSet {
    pub kind: u8,
    pub mint: Pubkey,
}

#[event]
pub struct InvestorVerified {
    pub wallet: Pubkey,
    pub country_code: u32,
    pub expiry: i64,
}

#[event]
pub struct InvestorRevoked {
    pub wallet: Pubkey,
}

#[event]
pub struct VotesRestored {
    pub wallet: Pubkey,
}

#[event]
pub struct VotesSuspended {
    pub wallet: Pubkey,
    pub ownership_bps: u64,
}

#[event]
pub struct OfferingCreated {
    pub offering: Pubkey,
    pub rwa_mint: Pubkey,
    pub product_id: u64,
}

#[event]
pub struct SupplyMinted {
    pub offering: Pubkey,
    /// Cumulative units minted (sequence across mint batches).
    pub seq: u64,
    pub amount: u64,
    pub cv_deposit_hash: [u8; 32],
}

#[event]
pub struct OfferingOpened {
    pub offering: Pubkey,
    pub price_per_unit: u64,
    pub hard_cap: u64,
    pub deadline: i64,
}

#[event]
pub struct Contributed {
    pub offering: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub units: u64,
}

#[event]
pub struct Finalized {
    pub offering: Pubkey,
    pub successful: bool,
    pub proceeds_paid: u64,
}

#[event]
pub struct UnitsDelivered {
    pub offering: Pubkey,
    pub contributor: Pubkey,
    pub units: u64,
}

#[event]
pub struct Refunded {
    pub offering: Pubkey,
    pub contributor: Pubkey,
    pub amount: u64,
    pub units: u64,
}

#[event]
pub struct ProceedsWithdrawn {
    pub offering: Pubkey,
    pub fiduciary: Pubkey,
    pub amount: u64,
}

#[event]
pub struct OpaTriggered {
    pub offering: Pubkey,
    pub acquirer: Pubkey,
    pub ownership_bps: u64,
}

#[event]
pub struct OpaLaunched {
    pub offering: Pubkey,
    pub acquirer: Pubkey,
    pub price_per_share: u64,
    pub escrow: u64,
}

#[event]
pub struct OpaAccepted {
    pub offering: Pubkey,
    pub seller: Pubkey,
    pub units: u64,
    pub payout: u64,
}

#[event]
pub struct OpaEscrowReclaimed {
    pub offering: Pubkey,
    pub acquirer: Pubkey,
    pub amount: u64,
}

#[event]
pub struct SqueezeOutExecuted {
    pub offering: Pubkey,
    pub acquirer: Pubkey,
    pub price_per_share: u64,
    pub deposit: u64,
}

#[event]
pub struct SqueezeClaimed {
    pub offering: Pubkey,
    pub holder: Pubkey,
    pub units: u64,
    pub payout: u64,
}

#[event]
pub struct HolderFrozenChanged {
    pub offering: Pubkey,
    pub token_account: Pubkey,
    pub frozen: bool,
}

#[event]
pub struct MarketVaultAuthorized {
    pub offering: Pubkey,
    pub vault: Pubkey,
}

#[event]
pub struct MarketPriceRecorded {
    pub offering: Pubkey,
    pub price: u64,
    pub highest_price: u64,
}
