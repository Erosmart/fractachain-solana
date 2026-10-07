use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

use crate::errors::FractachainError;
use crate::events::*;
use crate::state::*;
use crate::token_ix::*;
use crate::utils::*;

/* --------------------------------------------------------------- contribute */

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        seeds = [INVESTOR_SEED, buyer.key().as_ref()],
        bump = investor.bump,
    )]
    pub investor: Box<Account<'info, Investor>>,
    #[account(
        mut,
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
    )]
    pub offering: Box<Account<'info, Offering>>,
    /// Buyer's USDC/USDT source.
    #[account(
        mut,
        token::authority = buyer,
        constraint = buyer_payment_ata.mint == offering.payment_mint,
    )]
    pub buyer_payment_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = offering.payment_mint)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = offering.escrow_ata)]
    pub escrow_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + Contribution::INIT_SPACE,
        seeds = [CONTRIBUTION_SEED, offering.key().as_ref(), buyer.key().as_ref()],
        bump,
    )]
    pub contribution: Box<Account<'info, Contribution>>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

/// Subscription = escrow only. Units stay in the treasury float until a
/// successful close — `distribute` delivers them, `refund` returns escrow on
/// failure. The buyer's RWA ATA and the Art. 87 check therefore moved to
/// `distribute`.
pub fn contribute(ctx: Context<Contribute>, payment_amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        is_investor_verified(&ctx.accounts.investor, now),
        FractachainError::KycNotVerified
    );

    let offering = &mut ctx.accounts.offering;
    require!(offering.state == OfferingState::Open, FractachainError::NotOpen);
    require!(now <= offering.deadline, FractachainError::DeadlinePassed);
    require!(payment_amount > 0, FractachainError::NotPositive);
    require!(
        payment_amount % offering.price_per_unit == 0,
        FractachainError::NotDivisible
    );
    let total_raised = checked_add(offering.total_raised, payment_amount)?;
    require!(total_raised <= offering.hard_cap, FractachainError::ExceedsHardCap);
    let units = payment_amount / offering.price_per_unit;
    require!(
        checked_add(offering.units_sold, units)? <= offering.units_minted,
        FractachainError::InsufficientSupply
    );

    // Pay into the escrow ATA (buyer signs their own transfer).
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.payment_token_program.key(),
            token_interface::TransferChecked {
                from: ctx.accounts.buyer_payment_ata.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.escrow_ata.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        payment_amount,
        ctx.accounts.payment_mint.decimals,
    )?;

    offering.total_raised = total_raised;
    offering.units_sold = offering
        .units_sold
        .checked_add(units)
        .ok_or(FractachainError::Overflow)?;

    let contribution = &mut ctx.accounts.contribution;
    contribution.offering = offering.key();
    contribution.wallet = ctx.accounts.buyer.key();
    contribution.amount = checked_add(contribution.amount, payment_amount)?;
    contribution.units = checked_add(contribution.units, units)?;
    contribution.bump = ctx.bumps.contribution;

    emit!(Contributed {
        offering: offering.key(),
        buyer: ctx.accounts.buyer.key(),
        amount: payment_amount,
        units,
    });
    Ok(())
}

/// Shared Art. 87 logic for `contribute` and the `check_threshold` crank:
/// creates/writes the Opa PDA on a fresh 50% crossing, suspends votes when a
/// triggered offer lapses unanswered.
#[allow(clippy::too_many_arguments)]
pub fn apply_control_threshold<'info>(
    opa_info: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    investor: &mut Investor,
    offering_key: Pubkey,
    offering: &Offering,
    holder_balance: u64,
    now: i64,
    system_program: &AccountInfo<'info>,
    program_id: &Pubkey,
) -> Result<()> {
    let (opa_pda, opa_bump) =
        Pubkey::find_program_address(&[OPA_SEED, offering_key.as_ref()], program_id);
    require_keys_eq!(opa_pda, opa_info.key(), FractachainError::InvalidAddress);

    // Load the existing record only if the PDA is already initialized.
    let existing: Option<Opa> = if opa_info.data_is_empty() {
        None
    } else {
        let data = opa_info.try_borrow_data()?;
        let mut body: &[u8] = &data[..];
        Some(Opa::try_deserialize(&mut body)?)
    };

    // `#[account]` serialization already writes the 8-byte discriminator.
    let write_record = |opa_info: &AccountInfo<'info>, rec: &Opa| -> Result<()> {
        let mut data = opa_info.try_borrow_mut_data()?;
        let mut writer: &mut [u8] = &mut data[..];
        rec.try_serialize(&mut writer)?;
        Ok(())
    };

    match evaluate_control_threshold(holder_balance, offering.units_sold, existing.as_ref(), now) {
        ThresholdAction::None => Ok(()),
        ThresholdAction::Trigger { ownership_bps } => {
            if opa_info.data_is_empty() {
                create_opa_pda(
                    payer,
                    opa_info,
                    &[OPA_SEED, offering_key.as_ref(), &[opa_bump]],
                    system_program,
                    program_id,
                )?;
            }
            write_record(
                opa_info,
                &Opa {
                    offering: offering_key,
                    state: OpaState::Triggered,
                    acquirer: investor.wallet,
                    price_per_share: 0,
                    escrow_amount: 0,
                    accepted_total: 0,
                    triggered_at: now,
                    deadline: now + OPA_DEADLINE_SECONDS,
                    bump: opa_bump,
                },
            )?;
            emit!(OpaTriggered {
                offering: offering_key,
                acquirer: investor.wallet,
                ownership_bps,
            });
            Ok(())
        }
        ThresholdAction::SuspendVotes { ownership_bps } => {
            investor.voting_rights = false;
            if let Some(mut rec) = existing {
                rec.state = OpaState::SuspendedVotes;
                write_record(opa_info, &rec)?;
            }
            emit!(VotesSuspended {
                wallet: investor.wallet,
                ownership_bps,
            });
            Ok(())
        }
    }
}

/* ---------------------------------------------------------------- finalize */

#[derive(Accounts)]
pub struct Finalize<'info> {
    /// Permissionless crank — pays for the fiduciary ATA if it does not exist.
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
        constraint = offering.state == OfferingState::Open @ FractachainError::NotOpen,
    )]
    pub offering: Account<'info, Offering>,
    #[account(mut, address = offering.escrow_ata)]
    pub escrow_ata: InterfaceAccount<'info, TokenAccount>,
    /// ATA(fiduciary, payment_mint) — receives proceeds on success.
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = payment_mint,
        associated_token::authority = fiduciary,
        associated_token::token_program = payment_token_program,
    )]
    pub fiduciary_payment_ata: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: must equal offering.fiduciary.
    #[account(address = offering.fiduciary)]
    pub fiduciary: UncheckedAccount<'info>,
    #[account(address = offering.payment_mint)]
    pub payment_mint: InterfaceAccount<'info, Mint>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn finalize(ctx: Context<Finalize>) -> Result<()> {
    let offering = &mut ctx.accounts.offering;
    let now = Clock::get()?.unix_timestamp;
    require!(
        offering.total_raised >= offering.hard_cap || now >= offering.deadline,
        FractachainError::CannotFinalizeYet
    );

    if offering.total_raised >= offering.soft_cap {
        offering.state = OfferingState::Successful;
        // Sweep the escrow to the fiduciary trust account in the same tx.
        let proceeds = ctx.accounts.escrow_ata.amount;
        if proceeds > 0 {
            pay_from_escrow(
                &ctx.accounts.escrow_ata.to_account_info(),
                &ctx.accounts.fiduciary_payment_ata.to_account_info(),
                &ctx.accounts.payment_mint.to_account_info(),
                &offering.to_account_info(),
                &offering_signer(offering),
                &ctx.accounts.payment_token_program.to_account_info(),
                proceeds,
                ctx.accounts.payment_mint.decimals,
            )?;
            offering.proceeds_withdrawn = true;
        }
        emit!(Finalized {
            offering: offering.key(),
            successful: true,
            proceeds_paid: proceeds,
        });
    } else {
        offering.state = OfferingState::Failed;
        emit!(Finalized {
            offering: offering.key(),
            successful: false,
            proceeds_paid: 0,
        });
    }
    Ok(())
}

/* -------------------------------------------------------------- distribute */

#[derive(Accounts)]
pub struct Distribute<'info> {
    /// Permissionless crank — pays for the holder's ATA if it does not exist.
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
        constraint = offering.state == OfferingState::Successful
            @ FractachainError::NotOpen,
    )]
    pub offering: Box<Account<'info, Offering>>,
    /// CHECK: holder wallet — must own the contribution below.
    #[account(mut)]
    pub wallet: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [INVESTOR_SEED, wallet.key().as_ref()],
        bump = investor.bump,
    )]
    pub investor: Box<Account<'info, Investor>>,
    #[account(
        mut,
        seeds = [CONTRIBUTION_SEED, offering.key().as_ref(), wallet.key().as_ref()],
        bump = contribution.bump,
        has_one = wallet @ FractachainError::NotContributionOwner,
    )]
    pub contribution: Box<Account<'info, Contribution>>,
    /// Holder's RWA ATA — created frozen, thawed on delivery (KYC'd holder).
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = rwa_mint,
        associated_token::authority = wallet,
        associated_token::token_program = token_2022_program,
    )]
    pub wallet_rwa_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = offering.rwa_mint)]
    pub rwa_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = offering.treasury_ata)]
    pub treasury_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: Opa PDA, created manually if the 50% threshold trips.
    #[account(mut)]
    pub opa: UncheckedAccount<'info>,
    pub token_2022_program: Program<'info, anchor_spl::token_2022::Token2022>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Delivers one contributor's units after a successful close. Anyone can
/// call it — the settlement sweeper iterates all Contribution PDAs. A holder
/// whose KYC lapsed between contribute and close receives the units but the
/// ATA stays frozen (delivered ≠ tradable); refund only exists on failure.
/// Idempotent: sets `units`/`amount` to zero so a second call is a no-op.
pub fn distribute(ctx: Context<Distribute>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let offering = &mut ctx.accounts.offering;
    let units = ctx.accounts.contribution.units;
    require!(units > 0, FractachainError::NothingToDistribute);

    let seeds: &[&[u8]] = &offering_signer(offering);

    // Thaw long enough to land the units, then re-freeze only if the holder
    // is no longer KYC-verified — a revoked holder owns their units but can't
    // move them.
    let verified = is_investor_verified(&ctx.accounts.investor, now);
    if ctx.accounts.wallet_rwa_ata.is_frozen() {
        thaw(
            &ctx.accounts.wallet_rwa_ata.to_account_info(),
            &ctx.accounts.rwa_mint.to_account_info(),
            &offering.to_account_info(),
            seeds,
            &ctx.accounts.token_2022_program.to_account_info(),
        )?;
    }
    transfer_checked_signed(
        &ctx.accounts.treasury_ata.to_account_info(),
        &ctx.accounts.wallet_rwa_ata.to_account_info(),
        &ctx.accounts.rwa_mint.to_account_info(),
        &offering.to_account_info(),
        seeds,
        &ctx.accounts.token_2022_program.to_account_info(),
        units,
        0,
    )?;
    if !verified {
        freeze(
            &ctx.accounts.wallet_rwa_ata.to_account_info(),
            &ctx.accounts.rwa_mint.to_account_info(),
            &offering.to_account_info(),
            seeds,
            &ctx.accounts.token_2022_program.to_account_info(),
        )?;
    }

    let contribution = &mut ctx.accounts.contribution;
    contribution.units = 0;
    contribution.amount = 0;

    emit!(UnitsDelivered {
        offering: offering.key(),
        contributor: ctx.accounts.wallet.key(),
        units,
    });

    // Art. 87/88: a >50% delivery trips the OPA bookkeeping, same as a
    // secondary-market fill would.
    ctx.accounts.wallet_rwa_ata.reload()?;
    let balance = ctx.accounts.wallet_rwa_ata.amount;
    apply_control_threshold(
        &ctx.accounts.opa.to_account_info(),
        &ctx.accounts.caller.to_account_info(),
        &mut *ctx.accounts.investor,
        offering.key(),
        offering,
        balance,
        now,
        &ctx.accounts.system_program.to_account_info(),
        &ctx.program_id,
    )?;
    Ok(())
}

/* ----------------------------------------------------------------- refund */

#[derive(Accounts)]
pub struct Refund<'info> {
    /// Permissionless crank — pays for the contributor's payment ATA if it
    /// does not exist. The contributor does not need to sign.
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
        constraint = offering.state == OfferingState::Failed @ FractachainError::NotFailed,
    )]
    pub offering: Box<Account<'info, Offering>>,
    /// CHECK: contribution owner — refund destination, gets the PDA rent back.
    #[account(mut)]
    pub wallet: UncheckedAccount<'info>,
    #[account(
        mut,
        close = wallet,
        seeds = [CONTRIBUTION_SEED, offering.key().as_ref(), wallet.key().as_ref()],
        bump = contribution.bump,
        has_one = wallet @ FractachainError::NotContributionOwner,
    )]
    pub contribution: Box<Account<'info, Contribution>>,
    #[account(address = offering.payment_mint)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = offering.escrow_ata)]
    pub escrow_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = payment_mint,
        associated_token::authority = wallet,
        associated_token::token_program = payment_token_program,
    )]
    pub contributor_payment_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Refunds one contribution after a failed close. Permissionless — the
/// sweeper iterates Contribution PDAs so nobody has to claim manually.
/// Units never left the treasury float, so there's nothing to claw back.
pub fn refund(ctx: Context<Refund>) -> Result<()> {
    let offering = &mut ctx.accounts.offering;
    let contribution = &mut ctx.accounts.contribution;
    let amount = contribution.amount;
    let units = contribution.units;
    require!(amount > 0, FractachainError::NothingToRefund);

    pay_from_escrow(
        &ctx.accounts.escrow_ata.to_account_info(),
        &ctx.accounts.contributor_payment_ata.to_account_info(),
        &ctx.accounts.payment_mint.to_account_info(),
        &offering.to_account_info(),
        &offering_signer(offering),
        &ctx.accounts.payment_token_program.to_account_info(),
        amount,
        ctx.accounts.payment_mint.decimals,
    )?;

    offering.units_sold = offering
        .units_sold
        .checked_sub(units)
        .ok_or(FractachainError::Overflow)?;
    // The `close` attribute zeroes the account on exit — belt & suspenders
    // for re-entrancy inside this ix.
    contribution.amount = 0;
    contribution.units = 0;

    emit!(Refunded {
        offering: offering.key(),
        contributor: ctx.accounts.wallet.key(),
        amount,
        units,
    });
    Ok(())
}

/* --------------------------------------------------------- withdraw proceeds */

#[derive(Accounts)]
pub struct WithdrawProceeds<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
        has_one = admin @ FractachainError::UnauthorizedAdmin,
        constraint = (offering.state == OfferingState::Successful
            || offering.state == OfferingState::Terminated)
            @ FractachainError::NotOpen,
        constraint = !offering.proceeds_withdrawn @ FractachainError::ProceedsAlreadyWithdrawn,
    )]
    pub offering: Account<'info, Offering>,
    #[account(mut, address = offering.escrow_ata)]
    pub escrow_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = fiduciary,
    )]
    pub fiduciary_payment_ata: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: must equal offering.fiduciary.
    #[account(address = offering.fiduciary)]
    pub fiduciary: UncheckedAccount<'info>,
    #[account(address = offering.payment_mint)]
    pub payment_mint: InterfaceAccount<'info, Mint>,
    pub payment_token_program: Interface<'info, TokenInterface>,
}

pub fn withdraw_proceeds(ctx: Context<WithdrawProceeds>) -> Result<()> {
    let offering = &mut ctx.accounts.offering;
    let amount = ctx.accounts.escrow_ata.amount;
    require!(amount > 0, FractachainError::NothingToWithdraw);
    pay_from_escrow(
        &ctx.accounts.escrow_ata.to_account_info(),
        &ctx.accounts.fiduciary_payment_ata.to_account_info(),
        &ctx.accounts.payment_mint.to_account_info(),
        &offering.to_account_info(),
        &offering_signer(offering),
        &ctx.accounts.payment_token_program.to_account_info(),
        amount,
        ctx.accounts.payment_mint.decimals,
    )?;
    offering.proceeds_withdrawn = true;
    emit!(ProceedsWithdrawn {
        offering: offering.key(),
        fiduciary: offering.fiduciary,
        amount,
    });
    Ok(())
}
