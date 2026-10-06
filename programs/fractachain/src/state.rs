use anchor_lang::prelude::*;

/* ------------------------------------------------------------------ seeds */

pub const PLATFORM_SEED: &[u8] = b"platform";
pub const INVESTOR_SEED: &[u8] = b"investor";
pub const OFFERING_SEED: &[u8] = b"offering";
pub const OPA_SEED: &[u8] = b"opa";
pub const CONTRIBUTION_SEED: &[u8] = b"contribution";
pub const RWA_MINT_SEED: &[u8] = b"rwa_mint";

/* ------------------------------------------------------------------ enums */

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum OfferingState {
    Draft,
    Minted,
    Open,
    Successful,
    Failed,
    Terminated,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum InvestorType {
    National,
    Foreign,
    Qualified,
    Institutional,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum OpaState {
    /// >50% detected, acquirer must launch the tender offer.
    Triggered,
    /// Escrowed offer live, minorities can accept.
    ActiveOffer,
    /// Deadline lapsed without an offer — votes suspended (Art. 88).
    SuspendedVotes,
    /// >=95% reached, buyout deposited, minorities claim.
    SqueezedOut,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum PaymentKind {
    Usdc,
    Usdt,
}

/* ---------------------------------------------------------------- accounts */

/// Platform singleton — issuance-factory equivalent.
#[account]
#[derive(InitSpace)]
pub struct Platform {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub usdt_mint: Option<Pubkey>,
    /// Secondary-market fee, informational (Manifest applies its own).
    pub fee_bps: u16,
    /// Mon–Fri 08:00–16:00 ART gate for KYC approvals (was pubnet detection).
    pub enforce_kyc_hours: bool,
    pub product_count: u64,
    pub bump: u8,
}

/// Platform-wide KYC record — one approval covers every offering.
#[account]
#[derive(InitSpace)]
pub struct Investor {
    pub wallet: Pubkey,
    pub country_code: u32,
    pub investor_type: InvestorType,
    pub kyc_expiry: i64,
    pub is_active: bool,
    pub voting_rights: bool,
    pub registered_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct LegalInfo {
    pub fideicomiso_hash: [u8; 32],
    #[max_len(64)]
    pub cnv_record_id: String,
    #[max_len(128)]
    pub legal_terms_uri: String,
}

/// One tokenized issuance (licitacion + stock-vault merged).
#[account]
#[derive(InitSpace)]
pub struct Offering {
    pub listing_seed: [u8; 32],
    pub admin: Pubkey,
    /// Trust account that receives the proceeds of a successful issuance.
    pub fiduciary: Pubkey,
    pub payment_mint: Pubkey,
    pub payment_kind: PaymentKind,
    /// Token-2022 mint (decimals 0) — authority = this PDA.
    pub rwa_mint: Pubkey,
    /// ATA(Offering, rwa_mint) — the custodied float.
    pub treasury_ata: Pubkey,
    /// ATA(Offering, payment_mint) — raised funds / OPA+squeeze escrow.
    pub escrow_ata: Pubkey,
    pub soft_cap: u64,
    pub hard_cap: u64,
    pub deadline: i64,
    pub price_per_unit: u64,
    pub total_raised: u64,
    pub units_minted: u64,
    pub units_sold: u64,
    /// Latest Caja de Valores attestation that backed a mint batch.
    pub cv_deposit_hash: [u8; 32],
    pub state: OfferingState,
    pub legal_info: LegalInfo,
    pub proceeds_withdrawn: bool,
    /// Highest unit price ever seen — floors OPA/squeeze price (Art. 88).
    pub highest_price: u64,
    pub squeeze_price: u64,
    pub product_id: u64,
    pub bump: u8,
    pub mint_bump: u8,
}

/// A wallet's cumulative subscription in one offering.
#[account]
#[derive(InitSpace)]
pub struct Contribution {
    pub offering: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
    pub units: u64,
    pub bump: u8,
}

/// Tender-offer record — own PDA so offerings without OPA pay no rent.
#[account]
#[derive(InitSpace)]
pub struct Opa {
    pub offering: Pubkey,
    pub state: OpaState,
    pub acquirer: Pubkey,
    pub price_per_share: u64,
    /// Payment tokens escrowed for accept_opa / claim_squeeze_out.
    pub escrow_amount: u64,
    /// RWA units already bought back through this offer.
    pub accepted_total: u64,
    pub triggered_at: i64,
    pub deadline: i64,
    pub bump: u8,
}
