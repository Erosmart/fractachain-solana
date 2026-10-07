use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address_with_program_id;
use anchor_spl::token_2022::spl_token_2022;
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
        mut,
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
    /// Buyer's RWA ATA — created frozen, then thawed (KYC'd holder).
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = rwa_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_2022_program,
    )]
    pub buyer_rwa_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = offering.rwa_mint)]
    pub rwa_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = offering.payment_mint)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = offering.treasury_ata)]
    pub treasury_ata: Box<InterfaceAccount<'info, TokenAccount>>,
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
    /// CHECK: Opa PDA, created manually if the 50% threshold trips.
    #[account(mut)]
    pub opa: UncheckedAccount<'info>,
    pub token_2022_program: Program<'info, anchor_spl::token_2022::Token2022>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

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

    // Thaw the buyer's RWA ATA if the mint froze it (fresh ATA or KYC-revoked
    // holder whose Investor record is now live again).
    if ctx.accounts.buyer_rwa_ata.is_frozen() {
        thaw(
            &ctx.accounts.buyer_rwa_ata.to_account_info(),
            &ctx.accounts.rwa_mint.to_account_info(),
            &offering.to_account_info(),
            &offering_signer(offering),
            &ctx.accounts.token_2022_program.to_account_info(),
        )?;
    }

    // Deliver the units out of the custodied float.
    transfer_checked_signed(
        &ctx.accounts.treasury_ata.to_account_info(),
        &ctx.accounts.buyer_rwa_ata.to_account_info(),
        &ctx.accounts.rwa_mint.to_account_info(),
        &offering.to_account_info(),
        &offering_signer(offering),
        &ctx.accounts.token_2022_program.to_account_info(),
        units,
        0,
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

    // Art. 87/88: crossing 50% anywhere — primary or secondary — must trip the
    // OPA bookkeeping, not just secondary fills.
    ctx.accounts.buyer_rwa_ata.reload()?;
    let buyer_balance = ctx.accounts.buyer_rwa_ata.amount;
    apply_control_threshold(
        &ctx.accounts.opa.to_account_info(),
        &ctx.accounts.buyer.to_account_info(),
        &mut *ctx.accounts.investor,
        offering.key(),
        offering,
        buyer_balance,
        now,
        &ctx.accounts.system_program.to_account_info(),
        &ctx.program_id,
    )?;
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

    let disc = Opa::DISCRIMINATOR;

    // Load the existing record only if the PDA is already initialized.
    let existing: Option<Opa> = if opa_info.data_is_empty() {
        None
    } else {
        let data = opa_info.try_borrow_data()?;
        let mut body: &[u8] = &data[..];
        Some(Opa::try_deserialize(&mut body)?)
    };

    let write_record = |opa_info: &AccountInfo<'info>, rec: &Opa| -> Result<()> {
        let mut data = opa_info.try_borrow_mut_data()?;
        data[..disc.len()].copy_from_slice(disc);
        let mut writer: &mut [u8] = &mut data[disc.len()..];
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

/* ----------------------------------------------------------------- refund */

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,
    #[account(
        mut,
        seeds = [OFFERING_SEED, offering.listing_seed.as_ref()],
        bump = offering.bump,
        constraint = offering.state == OfferingState::Failed @ FractachainError::NotFailed,
    )]
    pub offering: Box<Account<'info, Offering>>,
    #[account(
        mut,
        close = contributor,
        seeds = [CONTRIBUTION_SEED, offering.key().as_ref(), contributor.key().as_ref()],
        bump = contribution.bump,
        has_one = wallet @ FractachainError::NotContributionOwner,
    )]
    pub contribution: Box<Account<'info, Contribution>>,
    /// CHECK: alias of contributor for the has_one above.
    #[account(address = contributor.key())]
    pub wallet: UncheckedAccount<'info>,
    /// Contributor's RWA ATA — may be frozen; the permanent delegate moves it.
    #[account(
        mut,
        token::authority = contributor,
        address = get_associated_token_address_with_program_id(
            &contributor.key(), &rwa_mint.key(), &spl_token_2022::ID,
        ),
    )]
    pub contributor_rwa_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = offering.rwa_mint)]
    pub rwa_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = offering.payment_mint)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = offering.treasury_ata)]
    pub treasury_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = offering.escrow_ata)]
    pub escrow_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = contributor,
        associated_token::mint = payment_mint,
        associated_token::authority = contributor,
        associated_token::token_program = payment_token_program,
    )]
    pub contributor_payment_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_2022_program: Program<'info, anchor_spl::token_2022::Token2022>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn refund(ctx: Context<Refund>) -> Result<()> {
    let offering = &mut ctx.accounts.offering;
    let units = ctx.accounts.contribution.units;
    require!(units > 0, FractachainError::NothingToRefund);
    let amount = ctx.accounts.contribution.amount;

    let seeds: &[&[u8]] = &offering_signer(offering);

    // Units return to the custodied float — permanent delegate moves them even
    // if the contributor's ATA is frozen (KYC revoked holders still exit).
    transfer_checked_signed(
        &ctx.accounts.contributor_rwa_ata.to_account_info(),
        &ctx.accounts.treasury_ata.to_account_info(),
        &ctx.accounts.rwa_mint.to_account_info(),
        &offering.to_account_info(),
        seeds,
        &ctx.accounts.token_2022_program.to_account_info(),
        units,
        0,
    )?;

    // Escrow pays back the contribution.
    pay_from_escrow(
        &ctx.accounts.escrow_ata.to_account_info(),
        &ctx.accounts.contributor_payment_ata.to_account_info(),
        &ctx.accounts.payment_mint.to_account_info(),
        &offering.to_account_info(),
        seeds,
        &ctx.accounts.payment_token_program.to_account_info(),
        amount,
        ctx.accounts.payment_mint.decimals,
    )?;

    offering.units_sold = offering
        .units_sold
        .checked_sub(units)
        .ok_or(FractachainError::Overflow)?;

    emit!(Refunded {
        offering: offering.key(),
        contributor: ctx.accounts.contributor.key(),
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
