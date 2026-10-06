use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::errors::FractachainError;
use crate::events::*;
use crate::state::*;
use crate::token_ix::*;

/// Shared accounts for freeze/thaw-style admin actions on an RWA token
/// account of this mint (holder ATA, Manifest vault, market seat ATA…).
#[derive(Accounts)]
pub struct Compliance<'info> {
    pub admin: Signer<'info>,
    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
        has_one = admin @ FractachainError::UnauthorizedAdmin,
    )]
    pub platform: Account<'info, Platform>,
    #[account(
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
    )]
    pub offering: Account<'info, Offering>,
    #[account(address = offering.rwa_mint)]
    pub rwa_mint: InterfaceAccount<'info, Mint>,
    /// Any token account of this mint — caller decides which.
    #[account(
        mut,
        token::mint = rwa_mint,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_2022_program: Program<'info, anchor_spl::token_2022::Token2022>,
}

/// Revokes a holder's ability to move units (KYC revocation, sanctions).
/// The permanent delegate still lets the program pull their units back —
/// "revoked means frozen for trading, not trapped".
pub fn freeze_holder(ctx: Context<Compliance>) -> Result<()> {
    freeze(
        &ctx.accounts.token_account.to_account_info(),
        &ctx.accounts.rwa_mint.to_account_info(),
        &ctx.accounts.offering.to_account_info(),
        &offering_signer(&ctx.accounts.offering),
        &ctx.accounts.token_2022_program.to_account_info(),
    )?;
    emit!(HolderFrozenChanged {
        offering: ctx.accounts.offering.key(),
        token_account: ctx.accounts.token_account.key(),
        frozen: true,
    });
    Ok(())
}

/// Re-enables transfers after KYC re-verification.
pub fn thaw_holder(ctx: Context<Compliance>) -> Result<()> {
    thaw(
        &ctx.accounts.token_account.to_account_info(),
        &ctx.accounts.rwa_mint.to_account_info(),
        &ctx.accounts.offering.to_account_info(),
        &offering_signer(&ctx.accounts.offering),
        &ctx.accounts.token_2022_program.to_account_info(),
    )?;
    emit!(HolderFrozenChanged {
        offering: ctx.accounts.offering.key(),
        token_account: ctx.accounts.token_account.key(),
        frozen: false,
    });
    Ok(())
}

/// Manifest vault authorization: `create_market` CPIs run in the backend tx;
/// this thaws the freshly-created vault (DefaultAccountState=Frozen) in the
/// same market-bootstrap flow, before any deposit/order can hit a frozen
/// account. Idempotent is not required — call once per vault.
pub fn authorize_market_vault(ctx: Context<Compliance>) -> Result<()> {
    thaw(
        &ctx.accounts.token_account.to_account_info(),
        &ctx.accounts.rwa_mint.to_account_info(),
        &ctx.accounts.offering.to_account_info(),
        &offering_signer(&ctx.accounts.offering),
        &ctx.accounts.token_2022_program.to_account_info(),
    )?;
    emit!(MarketVaultAuthorized {
        offering: ctx.accounts.offering.key(),
        vault: ctx.accounts.token_account.key(),
    });
    Ok(())
}

#[derive(Accounts)]
pub struct RecordMarketPrice<'info> {
    pub admin: Signer<'info>,
    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
        has_one = admin @ FractachainError::UnauthorizedAdmin,
    )]
    pub platform: Account<'info, Platform>,
    #[account(
        mut,
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
    )]
    pub offering: Account<'info, Offering>,
}

/// Backend/crank reports an observed secondary-market print so the
/// Art. 88 equitable-price floor tracks reality.
pub fn record_market_price(ctx: Context<RecordMarketPrice>, price: u64) -> Result<()> {
    require!(price > 0, FractachainError::NotPositive);
    let offering = &mut ctx.accounts.offering;
    if price > offering.highest_price {
        offering.highest_price = price;
    }
    emit!(MarketPriceRecorded {
        offering: offering.key(),
        price,
        highest_price: offering.highest_price,
    });
    Ok(())
}
