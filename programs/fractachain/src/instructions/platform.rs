use anchor_lang::prelude::*;

use crate::errors::FractachainError;
use crate::events::*;
use crate::state::*;
use crate::utils::*;

/* ----------------------------------------------------------- initialize */

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Platform::INIT_SPACE,
        seeds = [PLATFORM_SEED],
        bump,
    )]
    pub platform: Account<'info, Platform>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_platform(ctx: Context<InitializePlatform>, fee_bps: u16) -> Result<()> {
    let platform = &mut ctx.accounts.platform;
    platform.admin = ctx.accounts.admin.key();
    platform.usdc_mint = Pubkey::default();
    platform.usdt_mint = None;
    platform.fee_bps = fee_bps;
    platform.enforce_kyc_hours = false;
    platform.product_count = 0;
    platform.bump = ctx.bumps.platform;
    emit!(PlatformInitialized {
        admin: platform.admin,
        fee_bps,
    });
    Ok(())
}

/* ---------------------------------------------------------------- admin */

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// Must co-sign so a typo cannot strand the registry.
    pub new_admin: Signer<'info>,
    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
        has_one = admin @ FractachainError::UnauthorizedAdmin,
    )]
    pub platform: Account<'info, Platform>,
}

pub fn transfer_admin(ctx: Context<TransferAdmin>) -> Result<()> {
    let platform = &mut ctx.accounts.platform;
    let previous = platform.admin;
    platform.admin = ctx.accounts.new_admin.key();
    emit!(AdminTransferred {
        previous,
        new_admin: platform.admin,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SetPaymentMint<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
        has_one = admin @ FractachainError::UnauthorizedAdmin,
    )]
    pub platform: Account<'info, Platform>,
}

pub fn set_payment_mint(ctx: Context<SetPaymentMint>, kind: PaymentKind, mint: Pubkey) -> Result<()> {
    let platform = &mut ctx.accounts.platform;
    match kind {
        PaymentKind::Usdc => platform.usdc_mint = mint,
        PaymentKind::Usdt => platform.usdt_mint = Some(mint),
    }
    emit!(PaymentMintSet {
        kind: kind as u8,
        mint,
    });
    Ok(())
}

pub fn set_kyc_hours(ctx: Context<SetPaymentMint>, enforce: bool) -> Result<()> {
    ctx.accounts.platform.enforce_kyc_hours = enforce;
    Ok(())
}

/* ------------------------------------------------------------------ kyc */

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct VerifyInvestor<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
        has_one = admin @ FractachainError::UnauthorizedAdmin,
    )]
    pub platform: Account<'info, Platform>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + Investor::INIT_SPACE,
        seeds = [INVESTOR_SEED, wallet.as_ref()],
        bump,
    )]
    pub investor: Account<'info, Investor>,
    pub system_program: Program<'info, System>,
}

pub fn verify_investor(
    ctx: Context<VerifyInvestor>,
    wallet: Pubkey,
    country_code: u32,
    investor_type: InvestorType,
    expiry: i64,
) -> Result<()> {
    require!(!is_gafi_blacklisted(country_code), FractachainError::GafiBlacklisted);
    let now = Clock::get()?.unix_timestamp;
    require!(expiry > now, FractachainError::KycExpiryPast);
    if ctx.accounts.platform.enforce_kyc_hours {
        require!(
            is_argentina_business_hours(now),
            FractachainError::OutsideKycHours
        );
    }
    let investor = &mut ctx.accounts.investor;
    investor.wallet = wallet;
    investor.country_code = country_code;
    investor.investor_type = investor_type;
    investor.kyc_expiry = expiry;
    investor.is_active = true;
    // Re-verification does not restore votes suspended by an unfulfilled OPA.
    if investor.registered_at == 0 {
        investor.voting_rights = true;
        investor.registered_at = now;
    }
    investor.bump = ctx.bumps.investor;
    emit!(InvestorVerified {
        wallet,
        country_code,
        expiry,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct RevokeInvestor<'info> {
    pub admin: Signer<'info>,
    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
        has_one = admin @ FractachainError::UnauthorizedAdmin,
    )]
    pub platform: Account<'info, Platform>,
    #[account(mut)]
    pub investor: Account<'info, Investor>,
}

pub fn revoke_investor(ctx: Context<RevokeInvestor>) -> Result<()> {
    ctx.accounts.investor.is_active = false;
    emit!(InvestorRevoked {
        wallet: ctx.accounts.investor.wallet,
    });
    Ok(())
}

pub fn restore_votes(ctx: Context<RevokeInvestor>) -> Result<()> {
    ctx.accounts.investor.voting_rights = true;
    emit!(VotesRestored {
        wallet: ctx.accounts.investor.wallet,
    });
    Ok(())
}
