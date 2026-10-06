use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token_2022::spl_token_2022;
use spl_token_2022::extension::default_account_state;
use spl_token_2022::extension::metadata_pointer;
use spl_token_2022::extension::ExtensionType;
use spl_token_2022::instruction as t22;
use spl_token_metadata_interface::state::TokenMetadata;

use crate::errors::FractachainError;
use crate::state::Offering;

/// Signer seeds of the `Offering` PDA — mint / freeze / delegate authority.
pub fn offering_signer<'a>(offering: &'a Offering) -> [&'a [u8]; 3] {
    [
        crate::state::OFFERING_SEED,
        &offering.listing_seed,
        std::slice::from_ref(&offering.bump),
    ]
}

/// Creates the Token-2022 RWA mint PDA with extensions:
/// `DefaultAccountState(Frozen)` (KYC gate), `PermanentDelegate(Offering)`
/// (refund / squeeze-out / clawback), `MetadataPointer` + `TokenMetadata`.
#[allow(clippy::too_many_arguments)]
pub fn create_rwa_mint<'info>(
    payer: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    offering: &AccountInfo<'info>,
    mint_seeds: &[&[u8]],
    offering_seeds: &[&[u8]],
    _rent: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    token_2022_program: &AccountInfo<'info>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    let metadata = TokenMetadata {
        update_authority: Some(offering.key()).try_into().unwrap(),
        mint: mint.key(),
        name: name.clone(),
        symbol: symbol.clone(),
        uri: uri.clone(),
        additional_metadata: vec![],
    };
    let space = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&[
        ExtensionType::DefaultAccountState,
        ExtensionType::PermanentDelegate,
        ExtensionType::MetadataPointer,
        ExtensionType::TokenMetadata,
    ])?
    .checked_add(metadata.tlv_size_of().map_err(|_| error!(FractachainError::Overflow))?)
    .unwrap();
    let rent_lamports = Rent::get()?.minimum_balance(space);

    // 1. Allocate the mint account (PDA signs its own creation).
    invoke_signed(
        &system_instruction::create_account(
            &payer.key(),
            &mint.key(),
            rent_lamports,
            space as u64,
            &spl_token_2022::ID,
        ),
        &[payer.clone(), mint.clone(), system_program.clone()],
        &[mint_seeds],
    )?;

    let mint_infos = [mint.clone(), token_2022_program.clone()];

    // 2. Extensions must be initialized before initialize_mint2.
    invoke(
        &metadata_pointer::instruction::initialize(
            &spl_token_2022::ID,
            &mint.key(),
            Some(offering.key()),
            Some(mint.key()),
        )?,
        &mint_infos,
    )?;
    invoke(
        &default_account_state::instruction::initialize_default_account_state(
            &spl_token_2022::ID,
            &mint.key(),
            &spl_token_2022::state::AccountState::Frozen,
        )?,
        &mint_infos,
    )?;
    invoke(
        &t22::initialize_permanent_delegate(&spl_token_2022::ID, &mint.key(), &offering.key())?,
        &mint_infos,
    )?;

    // 3. decimals 0 — one unit = one cuotaparte/accion.
    invoke(
        &t22::initialize_mint2(
            &spl_token_2022::ID,
            &mint.key(),
            &offering.key(),
            Some(&offering.key()),
            0,
        )?,
        &mint_infos,
    )?;

    // 4. On-chain token metadata (ticker / name / legal URI).
    invoke_signed(
        &spl_token_metadata_interface::instruction::initialize(
            &spl_token_2022::ID,
            &mint.key(),
            &offering.key(),
            &mint.key(),
            &offering.key(),
            name,
            symbol,
            uri,
        ),
        &[
            mint.clone(),
            offering.clone(),
            mint.clone(),
            offering.clone(),
            token_2022_program.clone(),
        ],
        &[offering_seeds],
    )?;
    Ok(())
}

/// thaw a token account whose freeze authority is the Offering PDA.
pub fn thaw<'info>(
    token_account: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    offering: &AccountInfo<'info>,
    offering_seeds: &[&[u8]],
    token_program: &AccountInfo<'info>,
) -> Result<()> {
    invoke_signed(
        &t22::thaw_account(
            &spl_token_2022::ID,
            &token_account.key(),
            &mint.key(),
            &offering.key(),
            &[],
        )?,
        &[
            token_account.clone(),
            mint.clone(),
            offering.clone(),
            token_program.clone(),
        ],
        &[offering_seeds],
    )?;
    Ok(())
}

/// freeze a token account whose freeze authority is the Offering PDA.
pub fn freeze<'info>(
    token_account: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    offering: &AccountInfo<'info>,
    offering_seeds: &[&[u8]],
    token_program: &AccountInfo<'info>,
) -> Result<()> {
    invoke_signed(
        &t22::freeze_account(
            &spl_token_2022::ID,
            &token_account.key(),
            &mint.key(),
            &offering.key(),
            &[],
        )?,
        &[
            token_account.clone(),
            mint.clone(),
            offering.clone(),
            token_program.clone(),
        ],
        &[offering_seeds],
    )?;
    Ok(())
}

/// `transfer_checked` where the Offering PDA signs as authority or as the
/// Token-2022 permanent delegate (delegate moves tokens even out of frozen
/// accounts — used by refund / squeeze-out / clawback).
#[allow(clippy::too_many_arguments)]
pub fn transfer_checked_signed<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    offering: &AccountInfo<'info>,
    offering_seeds: &[&[u8]],
    token_program: &AccountInfo<'info>,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    invoke_signed(
        &t22::transfer_checked(
            &spl_token_2022::ID,
            &from.key(),
            &mint.key(),
            &to.key(),
            &offering.key(),
            &[],
            amount,
            decimals,
        )?,
        &[
            from.clone(),
            mint.clone(),
            to.clone(),
            offering.clone(),
            token_program.clone(),
        ],
        &[offering_seeds],
    )?;
    Ok(())
}

/// `mint_to` with the Offering PDA as mint authority.
pub fn mint_to_offering<'info>(
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    offering: &AccountInfo<'info>,
    offering_seeds: &[&[u8]],
    token_program: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    invoke_signed(
        &t22::mint_to(
            &spl_token_2022::ID,
            &mint.key(),
            &to.key(),
            &offering.key(),
            &[],
            amount,
        )?,
        &[
            mint.clone(),
            to.clone(),
            offering.clone(),
            token_program.clone(),
        ],
        &[offering_seeds],
    )?;
    Ok(())
}

/// `burn_checked` via the permanent delegate — drains a holder's position
/// (squeeze-out claim). Balance goes to 0, so a second claim is impossible.
pub fn burn_delegate<'info>(
    token_account: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    offering: &AccountInfo<'info>,
    offering_seeds: &[&[u8]],
    token_program: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    invoke_signed(
        &t22::burn_checked(
            &spl_token_2022::ID,
            &token_account.key(),
            &mint.key(),
            &offering.key(),
            &[],
            amount,
            0,
        )?,
        &[
            token_account.clone(),
            mint.clone(),
            offering.clone(),
            token_program.clone(),
        ],
        &[offering_seeds],
    )?;
    Ok(())
}

/// Pays a payment-mint amount out of the escrow ATA, Offering-signed.
pub fn pay_from_escrow<'info>(
    escrow: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    payment_mint: &AccountInfo<'info>,
    offering: &AccountInfo<'info>,
    offering_seeds: &[&[u8]],
    payment_token_program: &AccountInfo<'info>,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    transfer_checked_signed(
        escrow,
        to,
        payment_mint,
        offering,
        offering_seeds,
        payment_token_program,
        amount,
        decimals,
    )
}

/// Creates the `Opa` PDA manually — `init_if_needed` can't be conditional,
/// and an empty record would masquerade as `Triggered`.
pub fn create_opa_pda<'info>(
    payer: &AccountInfo<'info>,
    opa: &AccountInfo<'info>,
    opa_seeds: &[&[u8]],
    system_program: &AccountInfo<'info>,
    program_id: &Pubkey,
) -> Result<()> {
    let space = 8 + crate::state::Opa::INIT_SPACE;
    let rent = Rent::get()?.minimum_balance(space);
    invoke_signed(
        &system_instruction::create_account(&payer.key(), &opa.key(), rent, space as u64, program_id),
        &[payer.clone(), opa.clone(), system_program.clone()],
        &[opa_seeds],
    )?;
    Ok(())
}
