use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address_with_program_id;
use anchor_spl::token_2022::spl_token_2022;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

use crate::errors::FractachainError;
use crate::events::*;
use crate::instructions::lifecycle::apply_control_threshold;
use crate::state::*;
use crate::token_ix::*;
use crate::utils::*;

/* --------------------------------------------------------- threshold crank */

/// Permissionless: evaluates a holder's RWA balance against Art. 87/88.
/// Used after secondary-market fills (Manifest settles outside this program,
/// so any wallet/crank can poke this for any holder).
#[derive(Accounts)]
pub struct CheckThreshold<'info> {
    #[account(mut)]
    pub crank: Signer<'info>,
    /// The holder whose position is being evaluated.
    /// CHECK: seeds of investor guarantee the record belongs to holder_ata.owner.
    #[account(
        mut,
        seeds = [INVESTOR_SEED, investor.wallet.as_ref()],
        bump = investor.bump,
    )]
    pub investor: Account<'info, Investor>,
    #[account(
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
    )]
    pub offering: Account<'info, Offering>,
    /// Holder's RWA ATA — the balance under evaluation.
    #[account(
        address = get_associated_token_address_with_program_id(
            &investor.wallet, &offering.rwa_mint, &spl_token_2022::ID,
        ),
    )]
    pub holder_rwa_ata: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Opa PDA — created by CPI if the threshold trips.
    #[account(mut)]
    pub opa: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn check_threshold(ctx: Context<CheckThreshold>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    apply_control_threshold(
        &ctx.accounts.opa.to_account_info(),
        &ctx.accounts.crank.to_account_info(),
        &mut *ctx.accounts.investor,
        ctx.accounts.offering.key(),
        &ctx.accounts.offering,
        ctx.accounts.holder_rwa_ata.amount,
        now,
        &ctx.accounts.system_program.to_account_info(),
        &ctx.program_id,
    )
}

/* --------------------------------------------------------------- launch OPA */

#[derive(Accounts)]
pub struct LaunchOpa<'info> {
    #[account(mut)]
    pub acquirer: Signer<'info>,
    #[account(
        seeds = [INVESTOR_SEED, acquirer.key().as_ref()],
        bump = acquirer_investor.bump,
    )]
    pub acquirer_investor: Account<'info, Investor>,
    #[account(
        mut,
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
    )]
    pub offering: Account<'info, Offering>,
    #[account(
        mut,
        seeds = [OPA_SEED, offering.key().as_ref()],
        bump = opa.bump,
        constraint = opa.acquirer == acquirer.key() @ FractachainError::NotOpaAcquirer,
        constraint = (opa.state == OpaState::Triggered
            || opa.state == OpaState::SuspendedVotes)
            @ FractachainError::OpaNotTriggered,
    )]
    pub opa: Account<'info, Opa>,
    /// Acquirer's own balance — defines the float that must be bought out.
    #[account(
        token::authority = acquirer,
        address = get_associated_token_address_with_program_id(
            &acquirer.key(), &offering.rwa_mint, &spl_token_2022::ID,
        ),
    )]
    pub acquirer_rwa_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::authority = acquirer,
        constraint = acquirer_payment_ata.mint == offering.payment_mint,
    )]
    pub acquirer_payment_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = offering.escrow_ata)]
    pub escrow_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(address = offering.payment_mint)]
    pub payment_mint: InterfaceAccount<'info, Mint>,
    pub payment_token_program: Interface<'info, TokenInterface>,
}

pub fn launch_opa(ctx: Context<LaunchOpa>, price_per_share: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        is_investor_verified(&ctx.accounts.acquirer_investor, now),
        FractachainError::KycNotVerified
    );
    let offering = &mut ctx.accounts.offering;
    require!(offering.state == OfferingState::Successful, FractachainError::NotOpen);

    // Art. 88 equitable-price floor: never below the best price anyone paid.
    require!(
        price_per_share >= offering.highest_price,
        FractachainError::OpaPriceTooLow
    );
    record_price(offering, price_per_share);

    // Escrow covers every unit the acquirer does not already hold.
    let outstanding = offering
        .units_sold
        .checked_sub(ctx.accounts.acquirer_rwa_ata.amount)
        .ok_or(FractachainError::Overflow)?;
    let escrow_amount = outstanding
        .checked_mul(price_per_share)
        .ok_or(FractachainError::Overflow)?;

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.payment_token_program.key(),
            token_interface::TransferChecked {
                from: ctx.accounts.acquirer_payment_ata.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.escrow_ata.to_account_info(),
                authority: ctx.accounts.acquirer.to_account_info(),
            },
        ),
        escrow_amount,
        ctx.accounts.payment_mint.decimals,
    )?;

    let opa = &mut ctx.accounts.opa;
    opa.state = OpaState::ActiveOffer;
    opa.price_per_share = price_per_share;
    opa.escrow_amount = escrow_amount;
    opa.deadline = now + OPA_OFFER_SECONDS;

    emit!(OpaLaunched {
        offering: offering.key(),
        acquirer: ctx.accounts.acquirer.key(),
        price_per_share,
        escrow: escrow_amount,
    });
    Ok(())
}

/* ---------------------------------------------------------------- accept OPA */

#[derive(Accounts)]
pub struct AcceptOpa<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    /// CHECK: the acquirer must be KYC'd — read from the Opa record.
    #[account(address = opa.acquirer)]
    pub acquirer: UncheckedAccount<'info>,
    #[account(
        seeds = [INVESTOR_SEED, opa.acquirer.as_ref()],
        bump = acquirer_investor.bump,
    )]
    pub acquirer_investor: Box<Account<'info, Investor>>,
    #[account(
        mut,
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
    )]
    pub offering: Box<Account<'info, Offering>>,
    #[account(
        mut,
        seeds = [OPA_SEED, offering.key().as_ref()],
        bump = opa.bump,
        constraint = opa.state == OpaState::ActiveOffer @ FractachainError::OpaNotActive,
    )]
    pub opa: Box<Account<'info, Opa>>,
    /// Seller's whole balance is sold — may be frozen, delegate handles it.
    #[account(
        mut,
        token::authority = seller,
        address = get_associated_token_address_with_program_id(
            &seller.key(), &offering.rwa_mint, &spl_token_2022::ID,
        ),
    )]
    pub seller_rwa_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::authority = acquirer,
        address = get_associated_token_address_with_program_id(
            &opa.acquirer, &offering.rwa_mint, &spl_token_2022::ID,
        ),
    )]
    pub acquirer_rwa_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::authority = seller,
        constraint = seller_payment_ata.mint == offering.payment_mint,
    )]
    pub seller_payment_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = offering.escrow_ata)]
    pub escrow_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = offering.rwa_mint)]
    pub rwa_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = offering.payment_mint)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_2022_program: Program<'info, anchor_spl::token_2022::Token2022>,
    pub payment_token_program: Interface<'info, TokenInterface>,
}

pub fn accept_opa(ctx: Context<AcceptOpa>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        is_investor_verified(&ctx.accounts.acquirer_investor, now),
        FractachainError::KycNotVerified
    );
    let offering = &mut ctx.accounts.offering;
    let opa = &mut ctx.accounts.opa;
    require!(now <= opa.deadline, FractachainError::OpaExpired);
    require!(
        ctx.accounts.seller.key() != opa.acquirer,
        FractachainError::AcquirerCannotAccept
    );

    let balance = ctx.accounts.seller_rwa_ata.amount;
    require!(balance > 0, FractachainError::NotPositive);
    let payout = balance
        .checked_mul(opa.price_per_share)
        .ok_or(FractachainError::Overflow)?;
    require!(
        payout <= opa.escrow_amount,
        FractachainError::OpaEscrowExhausted
    );

    let seeds: &[&[u8]] = &offering_signer(offering);

    // Units to the acquirer — the permanent delegate moves them even out of a
    // frozen ATA (a KYC-revoked minority must still be able to exit).
    transfer_checked_signed(
        &ctx.accounts.seller_rwa_ata.to_account_info(),
        &ctx.accounts.acquirer_rwa_ata.to_account_info(),
        &ctx.accounts.rwa_mint.to_account_info(),
        &offering.to_account_info(),
        seeds,
        &ctx.accounts.token_2022_program.to_account_info(),
        balance,
        0,
    )?;
    // Escrow pays the seller.
    pay_from_escrow(
        &ctx.accounts.escrow_ata.to_account_info(),
        &ctx.accounts.seller_payment_ata.to_account_info(),
        &ctx.accounts.payment_mint.to_account_info(),
        &offering.to_account_info(),
        seeds,
        &ctx.accounts.payment_token_program.to_account_info(),
        payout,
        ctx.accounts.payment_mint.decimals,
    )?;

    opa.escrow_amount -= payout;
    opa.accepted_total += balance;
    record_price(offering, opa.price_per_share);

    emit!(OpaAccepted {
        offering: offering.key(),
        seller: ctx.accounts.seller.key(),
        units: balance,
        payout,
    });
    Ok(())
}

/* ------------------------------------------------------------ reclaim OPA */

#[derive(Accounts)]
pub struct ReclaimOpaEscrow<'info> {
    #[account(mut)]
    pub acquirer: Signer<'info>,
    #[account(
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
    )]
    pub offering: Account<'info, Offering>,
    #[account(
        mut,
        seeds = [OPA_SEED, offering.key().as_ref()],
        bump = opa.bump,
        constraint = opa.acquirer == acquirer.key() @ FractachainError::NotOpaAcquirer,
        constraint = opa.state == OpaState::ActiveOffer @ FractachainError::OpaNotActive,
    )]
    pub opa: Account<'info, Opa>,
    #[account(
        mut,
        token::authority = acquirer,
        constraint = acquirer_payment_ata.mint == offering.payment_mint,
    )]
    pub acquirer_payment_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = offering.escrow_ata)]
    pub escrow_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(address = offering.payment_mint)]
    pub payment_mint: InterfaceAccount<'info, Mint>,
    pub payment_token_program: Interface<'info, TokenInterface>,
}

pub fn reclaim_opa(ctx: Context<ReclaimOpaEscrow>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(now > ctx.accounts.opa.deadline, FractachainError::OpaStillActive);
    let amount = ctx.accounts.opa.escrow_amount;
    require!(amount > 0, FractachainError::NothingToReclaim);
    let offering = &ctx.accounts.offering;
    pay_from_escrow(
        &ctx.accounts.escrow_ata.to_account_info(),
        &ctx.accounts.acquirer_payment_ata.to_account_info(),
        &ctx.accounts.payment_mint.to_account_info(),
        &offering.to_account_info(),
        &offering_signer(offering),
        &ctx.accounts.payment_token_program.to_account_info(),
        amount,
        ctx.accounts.payment_mint.decimals,
    )?;
    ctx.accounts.opa.escrow_amount = 0;
    emit!(OpaEscrowReclaimed {
        offering: offering.key(),
        acquirer: ctx.accounts.acquirer.key(),
        amount,
    });
    Ok(())
}

/* ------------------------------------------------------------ squeeze-out */

#[derive(Accounts)]
pub struct ExecuteSqueezeOut<'info> {
    #[account(mut)]
    pub acquirer: Signer<'info>,
    #[account(
        seeds = [INVESTOR_SEED, acquirer.key().as_ref()],
        bump = acquirer_investor.bump,
    )]
    pub acquirer_investor: Account<'info, Investor>,
    #[account(
        mut,
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
        constraint = offering.state == OfferingState::Successful
            @ FractachainError::NotOpen,
    )]
    pub offering: Account<'info, Offering>,
    /// May not exist yet — squeeze-out does not require a prior OPA.
    #[account(
        init_if_needed,
        payer = acquirer,
        space = 8 + Opa::INIT_SPACE,
        seeds = [OPA_SEED, offering.key().as_ref()],
        bump,
    )]
    pub opa: Account<'info, Opa>,
    #[account(
        token::authority = acquirer,
        address = get_associated_token_address_with_program_id(
            &acquirer.key(), &offering.rwa_mint, &spl_token_2022::ID,
        ),
    )]
    pub acquirer_rwa_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::authority = acquirer,
        constraint = acquirer_payment_ata.mint == offering.payment_mint,
    )]
    pub acquirer_payment_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = offering.escrow_ata)]
    pub escrow_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(address = offering.payment_mint)]
    pub payment_mint: InterfaceAccount<'info, Mint>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn execute_squeeze_out(ctx: Context<ExecuteSqueezeOut>, price_per_share: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        is_investor_verified(&ctx.accounts.acquirer_investor, now),
        FractachainError::KycNotVerified
    );
    let offering = &mut ctx.accounts.offering;

    require!(
        price_per_share >= offering.highest_price,
        FractachainError::SqueezePriceTooLow
    );
    record_price(offering, price_per_share);

    // >=95% ownership required (Art. 88).
    let balance = ctx.accounts.acquirer_rwa_ata.amount;
    let bps = ownership_bps(balance, offering.units_sold);
    require!(bps >= 9_500, FractachainError::SqueezeThresholdNotMet);

    let remaining = offering
        .units_sold
        .checked_sub(balance)
        .ok_or(FractachainError::Overflow)?;
    let deposit = remaining
        .checked_mul(price_per_share)
        .ok_or(FractachainError::Overflow)?;

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.payment_token_program.key(),
            token_interface::TransferChecked {
                from: ctx.accounts.acquirer_payment_ata.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.escrow_ata.to_account_info(),
                authority: ctx.accounts.acquirer.to_account_info(),
            },
        ),
        deposit,
        ctx.accounts.payment_mint.decimals,
    )?;

    let opa = &mut ctx.accounts.opa;
    opa.offering = offering.key();
    opa.state = OpaState::SqueezedOut;
    opa.acquirer = ctx.accounts.acquirer.key();
    opa.price_per_share = price_per_share;
    opa.escrow_amount = deposit;
    opa.triggered_at = now;
    opa.bump = ctx.bumps.opa;
    offering.squeeze_price = price_per_share;
    offering.state = OfferingState::Terminated;

    emit!(SqueezeOutExecuted {
        offering: offering.key(),
        acquirer: opa.acquirer,
        price_per_share,
        deposit,
    });
    Ok(())
}

/* ------------------------------------------------------------- claim (pull) */

#[derive(Accounts)]
pub struct ClaimSqueezeOut<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,
    #[account(
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
        constraint = offering.state == OfferingState::Terminated
            @ FractachainError::NotTerminated,
    )]
    pub offering: Account<'info, Offering>,
    #[account(
        seeds = [OPA_SEED, offering.key().as_ref()],
        bump = opa.bump,
        constraint = opa.state == OpaState::SqueezedOut
            @ FractachainError::SqueezeNotExecuted,
    )]
    pub opa: Account<'info, Opa>,
    /// Holder's whole balance is burned by the delegate — pull-claim, so a
    /// second claim finds amount = 0 and fails.
    #[account(
        mut,
        token::authority = holder,
        address = get_associated_token_address_with_program_id(
            &holder.key(), &offering.rwa_mint, &spl_token_2022::ID,
        ),
    )]
    pub holder_rwa_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = holder,
        associated_token::mint = payment_mint,
        associated_token::authority = holder,
        associated_token::token_program = payment_token_program,
    )]
    pub holder_payment_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = offering.escrow_ata)]
    pub escrow_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(address = offering.rwa_mint)]
    pub rwa_mint: InterfaceAccount<'info, Mint>,
    #[account(address = offering.payment_mint)]
    pub payment_mint: InterfaceAccount<'info, Mint>,
    pub token_2022_program: Program<'info, anchor_spl::token_2022::Token2022>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn claim_squeeze_out(ctx: Context<ClaimSqueezeOut>) -> Result<()> {
    require!(
        ctx.accounts.holder.key() != ctx.accounts.opa.acquirer,
        FractachainError::AcquirerCannotClaim
    );
    let balance = ctx.accounts.holder_rwa_ata.amount;
    require!(balance > 0, FractachainError::NothingToClaim);
    let payout = balance
        .checked_mul(ctx.accounts.offering.squeeze_price)
        .ok_or(FractachainError::Overflow)?;

    let offering = &ctx.accounts.offering;
    let seeds: &[&[u8]] = &offering_signer(offering);

    // The squeeze burns the minority position outright.
    burn_delegate(
        &ctx.accounts.holder_rwa_ata.to_account_info(),
        &ctx.accounts.rwa_mint.to_account_info(),
        &offering.to_account_info(),
        seeds,
        &ctx.accounts.token_2022_program.to_account_info(),
        balance,
    )?;
    pay_from_escrow(
        &ctx.accounts.escrow_ata.to_account_info(),
        &ctx.accounts.holder_payment_ata.to_account_info(),
        &ctx.accounts.payment_mint.to_account_info(),
        &offering.to_account_info(),
        seeds,
        &ctx.accounts.payment_token_program.to_account_info(),
        payout,
        ctx.accounts.payment_mint.decimals,
    )?;

    emit!(SqueezeClaimed {
        offering: offering.key(),
        holder: ctx.accounts.holder.key(),
        units: balance,
        payout,
    });
    Ok(())
}
