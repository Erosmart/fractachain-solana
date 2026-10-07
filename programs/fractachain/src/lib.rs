use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod token_ix;
pub mod utils;

use instructions::*;
use state::*;

declare_id!("2d6JqnHjvAL1935Y6CXGnx2VB2Ff8L3Yi9tkApaHbJzd");

#[program]
pub mod fractachain {
    use super::*;

    /* -------------------------------------------------------- platform */

    pub fn initialize_platform(ctx: Context<InitializePlatform>, fee_bps: u16) -> Result<()> {
        instructions::platform::initialize_platform(ctx, fee_bps)
    }

    pub fn transfer_admin(ctx: Context<TransferAdmin>) -> Result<()> {
        instructions::platform::transfer_admin(ctx)
    }

    pub fn set_payment_mint(
        ctx: Context<SetPaymentMint>,
        kind: PaymentKind,
        mint: Pubkey,
    ) -> Result<()> {
        instructions::platform::set_payment_mint(ctx, kind, mint)
    }

    pub fn set_kyc_hours(ctx: Context<SetPaymentMint>, enforce: bool) -> Result<()> {
        instructions::platform::set_kyc_hours(ctx, enforce)
    }

    /* ------------------------------------------------------------- kyc */

    pub fn verify_investor(
        ctx: Context<VerifyInvestor>,
        wallet: Pubkey,
        country_code: u32,
        investor_type: InvestorType,
        expiry: i64,
    ) -> Result<()> {
        instructions::platform::verify_investor(ctx, wallet, country_code, investor_type, expiry)
    }

    pub fn revoke_investor(ctx: Context<RevokeInvestor>) -> Result<()> {
        instructions::platform::revoke_investor(ctx)
    }

    pub fn restore_votes(ctx: Context<RevokeInvestor>) -> Result<()> {
        instructions::platform::restore_votes(ctx)
    }

    /* -------------------------------------------------------- offerings */

    pub fn create_offering(
        ctx: Context<CreateOffering>,
        listing_seed: [u8; 32],
        legal_info: LegalInfo,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        instructions::offering::create_offering(ctx, listing_seed, legal_info, name, symbol, uri)
    }

    pub fn mint_supply(ctx: Context<MintSupply>, amount: u64, cv_deposit_hash: [u8; 32]) -> Result<()> {
        instructions::offering::mint_supply(ctx, amount, cv_deposit_hash)
    }

    pub fn open_offering(
        ctx: Context<OpenOffering>,
        fiduciary: Pubkey,
        soft_cap: u64,
        hard_cap: u64,
        deadline: i64,
        price_per_unit: u64,
    ) -> Result<()> {
        instructions::offering::open_offering(ctx, fiduciary, soft_cap, hard_cap, deadline, price_per_unit)
    }

    pub fn set_fiduciary(ctx: Context<UpdateOffering>, fiduciary: Pubkey) -> Result<()> {
        instructions::offering::set_fiduciary(ctx, fiduciary)
    }

    pub fn set_offering_payment_mint(ctx: Context<SetOfferingPaymentMint>) -> Result<()> {
        instructions::offering::set_offering_payment_mint(ctx)
    }

    pub fn set_price_per_unit(ctx: Context<UpdateOffering>, price_per_unit: u64) -> Result<()> {
        instructions::offering::set_price_per_unit(ctx, price_per_unit)
    }

    /* -------------------------------------------------------- lifecycle */

    pub fn contribute(ctx: Context<Contribute>, payment_amount: u64) -> Result<()> {
        instructions::lifecycle::contribute(ctx, payment_amount)
    }

    pub fn finalize(ctx: Context<Finalize>) -> Result<()> {
        instructions::lifecycle::finalize(ctx)
    }

    /// Permissionless crank — delivers one contributor's units after a
    /// successful close. The backend sweeps every Contribution PDA.
    pub fn distribute(ctx: Context<Distribute>) -> Result<()> {
        instructions::lifecycle::distribute(ctx)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::lifecycle::refund(ctx)
    }

    pub fn withdraw_proceeds(ctx: Context<WithdrawProceeds>) -> Result<()> {
        instructions::lifecycle::withdraw_proceeds(ctx)
    }

    /* ------------------------------------------------- OPA / squeeze-out */

    /// Permissionless crank — evaluates a holder's balance against the 50%
    /// trigger and the expired-window vote suspension (Art. 87/88).
    pub fn check_threshold(ctx: Context<CheckThreshold>) -> Result<()> {
        instructions::opa::check_threshold(ctx)
    }

    pub fn launch_opa(ctx: Context<LaunchOpa>, price_per_share: u64) -> Result<()> {
        instructions::opa::launch_opa(ctx, price_per_share)
    }

    pub fn accept_opa(ctx: Context<AcceptOpa>) -> Result<()> {
        instructions::opa::accept_opa(ctx)
    }

    pub fn reclaim_opa(ctx: Context<ReclaimOpaEscrow>) -> Result<()> {
        instructions::opa::reclaim_opa(ctx)
    }

    pub fn execute_squeeze_out(ctx: Context<ExecuteSqueezeOut>, price_per_share: u64) -> Result<()> {
        instructions::opa::execute_squeeze_out(ctx, price_per_share)
    }

    pub fn claim_squeeze_out(ctx: Context<ClaimSqueezeOut>) -> Result<()> {
        instructions::opa::claim_squeeze_out(ctx)
    }

    /* -------------------------------------------------------- compliance */

    pub fn freeze_holder(ctx: Context<Compliance>) -> Result<()> {
        instructions::compliance::freeze_holder(ctx)
    }

    pub fn thaw_holder(ctx: Context<Compliance>) -> Result<()> {
        instructions::compliance::thaw_holder(ctx)
    }

    /// Thaws a freshly created Manifest vault (Token-2022 DefaultAccountState
    /// = Frozen) inside the market-bootstrap flow.
    pub fn authorize_market_vault(ctx: Context<Compliance>) -> Result<()> {
        instructions::compliance::authorize_market_vault(ctx)
    }

    /// Feeds the Art. 88 equitable-price floor with observed market prints.
    pub fn record_market_price(ctx: Context<RecordMarketPrice>, price: u64) -> Result<()> {
        instructions::compliance::record_market_price(ctx, price)
    }
}
