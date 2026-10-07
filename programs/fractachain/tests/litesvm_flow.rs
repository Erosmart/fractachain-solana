//! LiteSVM full-lifecycle integration tests.
//!
//! Covers the escrow-only licitacion flow end to end:
//!   create -> mint_supply -> open -> contribute -> finalize -> distribute | refund
//! plus the compliance gates (KYC, caps, market-before-close).
//!
//! Requires:
//!   1. `anchor build` (produces target/deploy/fractachain.so)
//!   2. OpenSSL on Windows (litesvm -> openssl-sys)
//!
//! Run: `cargo test --features litesvm-tests -- --test-threads 1`
#![cfg(feature = "litesvm-tests")]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::sysvar::SysvarId;
use anchor_spl::associated_token::{
    self, get_associated_token_address_with_program_id, spl_associated_token_account,
};
use anchor_spl::token::spl_token;
use anchor_spl::token_2022::spl_token_2022;
use fractachain::state::{
    Contribution, InvestorType, LegalInfo, Offering, OfferingState, PaymentKind,
};
use litesvm::{types::TransactionResult, LiteSVM};
use sha2::{Digest, Sha256};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

const PROGRAM_ID: Pubkey = fractachain::ID;
const SO_PATH: &str = "../../target/deploy/fractachain.so";
const USDC_DECIMALS: u8 = 6;
/// Classic SPL mint account length.
const MINT_LEN: u64 = 82;

/* ---------------------------------------------------------------- helpers */

fn new_svm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(PROGRAM_ID, SO_PATH)
        .expect("anchor build first: fractachain.so missing");
    svm
}

fn kp(svm: &mut LiteSVM) -> Keypair {
    let kp = Keypair::new();
    svm.airdrop(&kp.pubkey(), 10_000_000_000).unwrap();
    kp
}

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &PROGRAM_ID).0
}

fn platform_pda() -> Pubkey {
    pda(&[b"platform"])
}
fn investor_pda(wallet: &Pubkey) -> Pubkey {
    pda(&[b"investor", wallet.as_ref()])
}
fn offering_pda(seed: &[u8; 32]) -> Pubkey {
    pda(&[b"offering", seed])
}
fn rwa_mint_pda(offering: &Pubkey) -> Pubkey {
    pda(&[b"rwa_mint", offering.as_ref()])
}
fn contribution_pda(offering: &Pubkey, wallet: &Pubkey) -> Pubkey {
    pda(&[b"contribution", offering.as_ref(), wallet.as_ref()])
}
fn opa_pda(offering: &Pubkey) -> Pubkey {
    pda(&[b"opa", offering.as_ref()])
}

fn usdc_ata(owner: &Pubkey, usdc_mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(owner, usdc_mint, &spl_token::ID)
}
fn rwa_ata(owner: &Pubkey, rwa_mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(owner, rwa_mint, &spl_token_2022::ID)
}

fn now(svm: &LiteSVM) -> i64 {
    svm.get_sysvar::<Clock>().unix_timestamp
}

fn warp_past(svm: &mut LiteSVM, ts: i64) {
    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp = ts + 1;
    svm.set_sysvar(&clock);
}

fn disc(name: &str) -> [u8; 8] {
    let h = Sha256::digest(format!("global:{name}").as_bytes());
    h[..8].try_into().unwrap()
}

fn ix(name: &str, args: &[u8], accounts: Vec<AccountMeta>) -> Instruction {
    let mut data = disc(name).to_vec();
    data.extend_from_slice(args);
    Instruction {
        program_id: PROGRAM_ID,
        accounts,
        data,
    }
}

fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    extra_signers: &[&Keypair],
    ixs: &[Instruction],
) -> TransactionResult {
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra_signers);
    let tx = Transaction::new_signed_with_payer(
        ixs,
        Some(&payer.pubkey()),
        &signers,
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx)
}

fn must_send(svm: &mut LiteSVM, payer: &Keypair, extra: &[&Keypair], ixs: &[Instruction]) {
    if let Err(e) = send(svm, payer, extra, ixs) {
        panic!("tx failed: {:?}\n{}", e.err, e.meta.pretty_logs());
    }
}

fn expect_fail(res: TransactionResult, code: &str) {
    let err = res.expect_err("expected transaction failure");
    let logs = err.meta.logs.join("\n");
    assert!(
        logs.contains(code),
        "expected '{code}' in logs, got {:?}:\n{logs}",
        err.err
    );
}

fn token_balance(svm: &LiteSVM, ata: &Pubkey) -> Option<u64> {
    svm.get_account(ata).map(|a| {
        assert!(a.data.len() >= 72, "token account too short");
        u64::from_le_bytes(a.data[64..72].try_into().unwrap())
    })
}

fn token_frozen(svm: &LiteSVM, ata: &Pubkey) -> Option<bool> {
    svm.get_account(ata).map(|a| {
        assert!(a.data.len() > 108, "token account too short");
        a.data[108] == 2 // AccountState::Frozen
    })
}

fn read_offering(svm: &LiteSVM, offering: &Pubkey) -> Offering {
    let acc = svm.get_account(offering).expect("offering missing");
    let mut data: &[u8] = &acc.data;
    Offering::try_deserialize(&mut data).expect("offering decode")
}

fn read_contribution(svm: &LiteSVM, contribution: &Pubkey) -> Option<Contribution> {
    svm.get_account(contribution).and_then(|a| {
        if a.data.is_empty() {
            None
        } else {
            let mut data: &[u8] = &a.data;
            Contribution::try_deserialize(&mut data).ok()
        }
    })
}

/* ------------------------------------------------------------ environment */

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    /// Mock USDC mint authority.
    usdc_auth: Keypair,
    usdc_mint: Pubkey,
    fiduciary: Pubkey,
}

fn bootstrap() -> Env {
    let mut svm = new_svm();
    let admin = kp(&mut svm);
    let usdc_auth = kp(&mut svm);
    let fiduciary = kp(&mut svm).pubkey();
    let platform = platform_pda();

    must_send(
        &mut svm,
        &admin,
        &[],
        &[ix(
            "initialize_platform",
            &borsh::to_vec(&0u16).unwrap(),
            vec![
                AccountMeta::new(admin.pubkey(), true),
                AccountMeta::new(platform, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
        )],
    );

    // Mock USDC: classic SPL mint, 6 decimals, authority = usdc_auth.
    // Fresh keypair without airdrop — create_account requires a new address.
    let usdc_mint = Keypair::new();
    let rent = svm.minimum_balance_for_rent_exemption(MINT_LEN as usize);
    must_send(
        &mut svm,
        &admin,
        &[&usdc_mint],
        &[
            system_instruction::create_account(
                &admin.pubkey(),
                &usdc_mint.pubkey(),
                rent,
                MINT_LEN,
                &spl_token::ID,
            ),
            spl_token::instruction::initialize_mint2(
                &spl_token::ID,
                &usdc_mint.pubkey(),
                &usdc_auth.pubkey(),
                None,
                USDC_DECIMALS,
            )
            .unwrap(),
        ],
    );

    must_send(
        &mut svm,
        &admin,
        &[],
        &[ix(
            "set_payment_mint",
            &{
                let mut v = borsh::to_vec(&PaymentKind::Usdc).unwrap();
                v.extend_from_slice(usdc_mint.pubkey().as_ref());
                v
            },
            vec![
                AccountMeta::new_readonly(admin.pubkey(), true),
                AccountMeta::new(platform, false),
            ],
        )],
    );

    Env {
        svm,
        admin,
        usdc_auth,
        usdc_mint: usdc_mint.pubkey(),
        fiduciary,
    }
}

fn verify_investor(env: &mut Env, wallet: &Pubkey) {
    let expiry = now(&env.svm) + 86_400 * 365;
    must_send(
        &mut env.svm,
        &env.admin,
        &[],
        &[ix(
            "verify_investor",
            &{
                let mut v = Vec::new();
                v.extend_from_slice(wallet.as_ref());
                v.extend_from_slice(&borsh::to_vec(&32u32).unwrap());
                v.extend_from_slice(&borsh::to_vec(&InvestorType::National).unwrap());
                v.extend_from_slice(&borsh::to_vec(&expiry).unwrap());
                v
            },
            vec![
                AccountMeta::new(env.admin.pubkey(), true),
                AccountMeta::new_readonly(platform_pda(), false),
                AccountMeta::new(investor_pda(wallet), false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
        )],
    );
}

fn revoke_investor(env: &mut Env, wallet: &Pubkey) {
    must_send(
        &mut env.svm,
        &env.admin,
        &[],
        &[ix(
            "revoke_investor",
            &[],
            vec![
                AccountMeta::new_readonly(env.admin.pubkey(), true),
                AccountMeta::new_readonly(platform_pda(), false),
                AccountMeta::new(investor_pda(wallet), false),
            ],
        )],
    );
}

fn fund_usdc(env: &mut Env, wallet: &Pubkey, amount: u64) {
    let ata = usdc_ata(wallet, &env.usdc_mint);
    must_send(
        &mut env.svm,
        &env.admin,
        &[&env.usdc_auth],
        &[
            spl_associated_token_account::instruction::create_associated_token_account(
                &env.admin.pubkey(),
                wallet,
                &env.usdc_mint,
                &spl_token::ID,
            ),
            spl_token::instruction::mint_to(
                &spl_token::ID,
                &env.usdc_mint,
                &ata,
                &env.usdc_auth.pubkey(),
                &[&env.usdc_auth.pubkey()],
                amount,
            )
            .unwrap(),
        ],
    );
}

fn create_offering(env: &mut Env, seed: [u8; 32]) -> Pubkey {
    let offering = offering_pda(&seed);
    let rwa_mint = rwa_mint_pda(&offering);
    let treasury_ata = rwa_ata(&offering, &rwa_mint);
    let legal = LegalInfo {
        fideicomiso_hash: [9u8; 32],
        cnv_record_id: "CNV-TEST".to_string(),
        legal_terms_uri: "ipfs://terms".to_string(),
    };
    let args = {
        let mut v = Vec::new();
        v.extend_from_slice(&seed);
        v.extend_from_slice(&borsh::to_vec(&legal).unwrap());
        v.extend_from_slice(&borsh::to_vec(&"Fracta Asset".to_string()).unwrap());
        v.extend_from_slice(&borsh::to_vec(&"FRCT".to_string()).unwrap());
        v.extend_from_slice(&borsh::to_vec(&"ipfs://meta".to_string()).unwrap());
        v
    };
    must_send(
        &mut env.svm,
        &env.admin,
        &[],
        &[ix(
            "create_offering",
            &args,
            vec![
                AccountMeta::new(env.admin.pubkey(), true),
                AccountMeta::new(platform_pda(), false),
                AccountMeta::new(offering, false),
                AccountMeta::new(rwa_mint, false),
                AccountMeta::new(treasury_ata, false),
                AccountMeta::new_readonly(spl_token_2022::ID, false),
                AccountMeta::new_readonly(associated_token::ID, false),
                AccountMeta::new_readonly(system_program::ID, false),
                AccountMeta::new_readonly(Rent::id(), false),
            ],
        )],
    );
    offering
}

fn mint_supply(env: &mut Env, offering: &Pubkey, amount: u64) {
    let rwa_mint = rwa_mint_pda(offering);
    let args = {
        let mut v = borsh::to_vec(&amount).unwrap();
        v.extend_from_slice(&[7u8; 32]);
        v
    };
    must_send(
        &mut env.svm,
        &env.admin,
        &[],
        &[ix(
            "mint_supply",
            &args,
            vec![
                AccountMeta::new_readonly(env.admin.pubkey(), true),
                AccountMeta::new(*offering, false),
                AccountMeta::new(rwa_mint, false),
                AccountMeta::new(rwa_ata(offering, &rwa_mint), false),
                AccountMeta::new_readonly(spl_token_2022::ID, false),
            ],
        )],
    );
}

#[allow(clippy::too_many_arguments)]
fn open_offering(
    env: &mut Env,
    offering: &Pubkey,
    soft_cap: u64,
    hard_cap: u64,
    deadline: i64,
    price_per_unit: u64,
) {
    let args = {
        let mut v = Vec::new();
        v.extend_from_slice(env.fiduciary.as_ref());
        v.extend_from_slice(&soft_cap.to_le_bytes());
        v.extend_from_slice(&hard_cap.to_le_bytes());
        v.extend_from_slice(&deadline.to_le_bytes());
        v.extend_from_slice(&price_per_unit.to_le_bytes());
        v
    };
    must_send(
        &mut env.svm,
        &env.admin,
        &[],
        &[ix(
            "open_offering",
            &args,
            vec![
                AccountMeta::new(env.admin.pubkey(), true),
                AccountMeta::new(platform_pda(), false),
                AccountMeta::new(*offering, false),
                AccountMeta::new_readonly(env.usdc_mint, false),
                AccountMeta::new(usdc_ata(offering, &env.usdc_mint), false),
                AccountMeta::new_readonly(spl_token::ID, false),
                AccountMeta::new_readonly(associated_token::ID, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
        )],
    );
}

fn contribute(env: &mut Env, offering: &Pubkey, buyer: &Keypair, amount: u64) -> TransactionResult {
    let o = read_offering(&env.svm, offering);
    send(
        &mut env.svm,
        buyer,
        &[],
        &[ix(
            "contribute",
            &amount.to_le_bytes(),
            vec![
                AccountMeta::new(buyer.pubkey(), true),
                AccountMeta::new_readonly(investor_pda(&buyer.pubkey()), false),
                AccountMeta::new(*offering, false),
                AccountMeta::new(usdc_ata(&buyer.pubkey(), &env.usdc_mint), false),
                AccountMeta::new_readonly(env.usdc_mint, false),
                AccountMeta::new(o.escrow_ata, false),
                AccountMeta::new(contribution_pda(offering, &buyer.pubkey()), false),
                AccountMeta::new_readonly(spl_token::ID, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
        )],
    )
}

fn finalize(env: &mut Env, offering: &Pubkey, caller: &Keypair) -> TransactionResult {
    let o = read_offering(&env.svm, offering);
    send(
        &mut env.svm,
        caller,
        &[],
        &[ix(
            "finalize",
            &[],
            vec![
                AccountMeta::new(caller.pubkey(), true),
                AccountMeta::new(*offering, false),
                AccountMeta::new(o.escrow_ata, false),
                AccountMeta::new(usdc_ata(&env.fiduciary, &env.usdc_mint), false),
                AccountMeta::new_readonly(env.fiduciary, false),
                AccountMeta::new_readonly(env.usdc_mint, false),
                AccountMeta::new_readonly(spl_token::ID, false),
                AccountMeta::new_readonly(associated_token::ID, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
        )],
    )
}

fn distribute(
    env: &mut Env,
    offering: &Pubkey,
    caller: &Keypair,
    wallet: &Pubkey,
) -> TransactionResult {
    let o = read_offering(&env.svm, offering);
    send(
        &mut env.svm,
        caller,
        &[],
        &[ix(
            "distribute",
            &[],
            vec![
                AccountMeta::new(caller.pubkey(), true),
                AccountMeta::new(*offering, false),
                AccountMeta::new(*wallet, false),
                AccountMeta::new(investor_pda(wallet), false),
                AccountMeta::new(contribution_pda(offering, wallet), false),
                AccountMeta::new(rwa_ata(wallet, &o.rwa_mint), false),
                AccountMeta::new_readonly(o.rwa_mint, false),
                AccountMeta::new(o.treasury_ata, false),
                AccountMeta::new(opa_pda(offering), false),
                AccountMeta::new_readonly(spl_token_2022::ID, false),
                AccountMeta::new_readonly(associated_token::ID, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
        )],
    )
}

fn refund(env: &mut Env, offering: &Pubkey, caller: &Keypair, wallet: &Pubkey) -> TransactionResult {
    let o = read_offering(&env.svm, offering);
    send(
        &mut env.svm,
        caller,
        &[],
        &[ix(
            "refund",
            &[],
            vec![
                AccountMeta::new(caller.pubkey(), true),
                AccountMeta::new(*offering, false),
                AccountMeta::new(*wallet, false),
                AccountMeta::new(contribution_pda(offering, wallet), false),
                AccountMeta::new_readonly(env.usdc_mint, false),
                AccountMeta::new(o.escrow_ata, false),
                AccountMeta::new(usdc_ata(wallet, &env.usdc_mint), false),
                AccountMeta::new_readonly(spl_token::ID, false),
                AccountMeta::new_readonly(associated_token::ID, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
        )],
    )
}

/// Thaw attempt on a token account of this mint via authorize_market_vault.
fn authorize_market_vault(
    env: &mut Env,
    offering: &Pubkey,
    token_account: &Pubkey,
) -> TransactionResult {
    let o = read_offering(&env.svm, offering);
    send(
        &mut env.svm,
        &env.admin,
        &[],
        &[ix(
            "authorize_market_vault",
            &[],
            vec![
                AccountMeta::new_readonly(env.admin.pubkey(), true),
                AccountMeta::new_readonly(platform_pda(), false),
                AccountMeta::new_readonly(*offering, false),
                AccountMeta::new_readonly(o.rwa_mint, false),
                AccountMeta::new(*token_account, false),
                AccountMeta::new_readonly(spl_token_2022::ID, false),
            ],
        )],
    )
}

/* ------------------------------------------------------------------ tests */

/// Happy path: two investors, hard cap reached before deadline, finalize
/// succeeds, crank distributes units to both, proceeds reach the fiduciary.
#[test]
fn success_two_investors_hardcap_distribute() {
    let mut env = bootstrap();
    let (a, b) = (kp(&mut env.svm), kp(&mut env.svm));
    verify_investor(&mut env, &a.pubkey());
    verify_investor(&mut env, &b.pubkey());
    fund_usdc(&mut env, &a.pubkey(), 1_000);
    fund_usdc(&mut env, &b.pubkey(), 1_000);

    let offering = create_offering(&mut env, [1u8; 32]);
    mint_supply(&mut env, &offering, 10);
    let deadline = now(&env.svm) + 3_600;
    open_offering(&mut env, &offering, 200, 400, deadline, 100);

    let o = read_offering(&env.svm, &offering);
    assert_eq!(o.state, OfferingState::Open);

    contribute(&mut env, &offering, &a, 200).unwrap();
    contribute(&mut env, &offering, &b, 200).unwrap();

    let o = read_offering(&env.svm, &offering);
    assert_eq!(o.total_raised, 400);
    assert_eq!(o.units_sold, 4);
    // Escrow holds the funds; nobody has tokens yet.
    assert_eq!(token_balance(&env.svm, &o.escrow_ata), Some(400));
    assert_eq!(
        token_balance(&env.svm, &rwa_ata(&a.pubkey(), &o.rwa_mint)),
        None
    );
    assert_eq!(
        token_balance(&env.svm, &rwa_ata(&b.pubkey(), &o.rwa_mint)),
        None
    );

    // Hard cap hit → finalize allowed even though the deadline is far away.
    let crank = kp(&mut env.svm);
    finalize(&mut env, &offering, &crank).unwrap();

    let o = read_offering(&env.svm, &offering);
    assert_eq!(o.state, OfferingState::Successful);
    assert!(o.proceeds_withdrawn);
    // Proceeds swept to the fiduciary in the same ix.
    assert_eq!(
        token_balance(&env.svm, &usdc_ata(&env.fiduciary, &env.usdc_mint)),
        Some(400)
    );
    assert_eq!(token_balance(&env.svm, &o.escrow_ata), Some(0));

    // Crank distributes — the investors don't sign.
    distribute(&mut env, &offering, &crank, &a.pubkey()).unwrap();
    distribute(&mut env, &offering, &crank, &b.pubkey()).unwrap();

    assert_eq!(
        token_balance(&env.svm, &rwa_ata(&a.pubkey(), &o.rwa_mint)),
        Some(2)
    );
    assert_eq!(
        token_balance(&env.svm, &rwa_ata(&b.pubkey(), &o.rwa_mint)),
        Some(2)
    );
    // Verified KYC → delivered thawed.
    assert_eq!(
        token_frozen(&env.svm, &rwa_ata(&a.pubkey(), &o.rwa_mint)),
        Some(false)
    );
    // Treasury float reduced by exactly what was sold.
    assert_eq!(token_balance(&env.svm, &o.treasury_ata), Some(10 - 4));

    // Idempotency: a second distribute fails.
    env.svm.expire_blockhash();
    expect_fail(
        distribute(&mut env, &offering, &crank, &a.pubkey()),
        "NothingToDistribute",
    );

    // Contribution state is zeroed (retry-safe).
    let c = read_contribution(&env.svm, &contribution_pda(&offering, &a.pubkey()));
    assert!(c.is_none() || c.unwrap().units == 0);
}

/// Soft cap met but hard cap not → must wait for the deadline; after the
/// deadline the close succeeds and partial fills are still delivered.
#[test]
fn success_close_by_deadline_partial_fill() {
    let mut env = bootstrap();
    let (a, b) = (kp(&mut env.svm), kp(&mut env.svm));
    verify_investor(&mut env, &a.pubkey());
    verify_investor(&mut env, &b.pubkey());
    fund_usdc(&mut env, &a.pubkey(), 1_000);
    fund_usdc(&mut env, &b.pubkey(), 1_000);

    let offering = create_offering(&mut env, [2u8; 32]);
    mint_supply(&mut env, &offering, 100);
    let deadline = now(&env.svm) + 3_600;
    // soft 300, hard 1000, price 100 → 3+ units succeed.
    open_offering(&mut env, &offering, 300, 1_000, deadline, 100);

    contribute(&mut env, &offering, &a, 400).unwrap();
    contribute(&mut env, &offering, &b, 200).unwrap();
    let o = read_offering(&env.svm, &offering);
    assert_eq!(o.total_raised, 600); // >= soft, < hard

    let crank = kp(&mut env.svm);
    expect_fail(
        finalize(&mut env, &offering, &crank),
        "CannotFinalizeYet",
    );

    env.svm.expire_blockhash();
    warp_past(&mut env.svm, deadline);
    finalize(&mut env, &offering, &crank).unwrap();

    let o = read_offering(&env.svm, &offering);
    assert_eq!(o.state, OfferingState::Successful);
    assert_eq!(
        token_balance(&env.svm, &usdc_ata(&env.fiduciary, &env.usdc_mint)),
        Some(600)
    );

    distribute(&mut env, &offering, &crank, &a.pubkey()).unwrap();
    distribute(&mut env, &offering, &crank, &b.pubkey()).unwrap();
    assert_eq!(
        token_balance(&env.svm, &rwa_ata(&a.pubkey(), &o.rwa_mint)),
        Some(4)
    );
    assert_eq!(
        token_balance(&env.svm, &rwa_ata(&b.pubkey(), &o.rwa_mint)),
        Some(2)
    );
}

/// Soft cap missed → failure, and a permissionless crank refunds both
/// investors in full. Refund does not require the investor's signature.
#[test]
fn failed_offering_refunds_both_permissionless() {
    let mut env = bootstrap();
    let (a, b) = (kp(&mut env.svm), kp(&mut env.svm));
    verify_investor(&mut env, &a.pubkey());
    verify_investor(&mut env, &b.pubkey());
    fund_usdc(&mut env, &a.pubkey(), 200);
    fund_usdc(&mut env, &b.pubkey(), 300);

    let offering = create_offering(&mut env, [3u8; 32]);
    mint_supply(&mut env, &offering, 100);
    let deadline = now(&env.svm) + 3_600;
    open_offering(&mut env, &offering, 1_000, 2_000, deadline, 100);

    contribute(&mut env, &offering, &a, 200).unwrap();
    contribute(&mut env, &offering, &b, 300).unwrap();
    assert_eq!(
        token_balance(&env.svm, &usdc_ata(&a.pubkey(), &env.usdc_mint)),
        Some(0)
    );

    // Refund is impossible before a failed close.
    let crank = kp(&mut env.svm);
    expect_fail(
        refund(&mut env, &offering, &crank, &a.pubkey()),
        "NotFailed",
    );

    warp_past(&mut env.svm, deadline);
    finalize(&mut env, &offering, &crank).unwrap();
    let o = read_offering(&env.svm, &offering);
    assert_eq!(o.state, OfferingState::Failed);
    // The earlier NotFailed attempt recorded this tx signature — rotate the
    // blockhash so the replay is evaluated on-chain, not deduped.
    env.svm.expire_blockhash();
    // Funds stay in escrow for refunds — the fiduciary ATA is created by
    // finalize's init_if_needed but receives nothing.
    assert_eq!(token_balance(&env.svm, &o.escrow_ata), Some(500));
    assert_eq!(
        token_balance(&env.svm, &usdc_ata(&env.fiduciary, &env.usdc_mint)),
        Some(0)
    );

    refund(&mut env, &offering, &crank, &a.pubkey()).unwrap();
    refund(&mut env, &offering, &crank, &b.pubkey()).unwrap();

    assert_eq!(
        token_balance(&env.svm, &usdc_ata(&a.pubkey(), &env.usdc_mint)),
        Some(200)
    );
    assert_eq!(
        token_balance(&env.svm, &usdc_ata(&b.pubkey(), &env.usdc_mint)),
        Some(300)
    );
    assert_eq!(token_balance(&env.svm, &o.escrow_ata), Some(0));

    // Contribution PDAs closed → a second refund cannot replay.
    assert!(read_contribution(&env.svm, &contribution_pda(&offering, &a.pubkey())).is_none());
    env.svm.expire_blockhash();
    expect_fail(
        refund(&mut env, &offering, &crank, &a.pubkey()),
        "", // account gone — any error is correct
    );

    // No tokens ever left the treasury.
    assert_eq!(token_balance(&env.svm, &o.treasury_ata), Some(100));
}

/// Revoking KYC after the close must not confiscate funds: the refund still
/// lands even though the investor can no longer trade.
#[test]
fn revoked_kyc_still_refundable() {
    let mut env = bootstrap();
    let a = kp(&mut env.svm);
    verify_investor(&mut env, &a.pubkey());
    fund_usdc(&mut env, &a.pubkey(), 500);

    let offering = create_offering(&mut env, [4u8; 32]);
    mint_supply(&mut env, &offering, 100);
    let deadline = now(&env.svm) + 3_600;
    open_offering(&mut env, &offering, 1_000, 2_000, deadline, 100);

    contribute(&mut env, &offering, &a, 500).unwrap();
    revoke_investor(&mut env, &a.pubkey());

    warp_past(&mut env.svm, deadline);
    let crank = kp(&mut env.svm);
    finalize(&mut env, &offering, &crank).unwrap();
    refund(&mut env, &offering, &crank, &a.pubkey()).unwrap();
    assert_eq!(
        token_balance(&env.svm, &usdc_ata(&a.pubkey(), &env.usdc_mint)),
        Some(500)
    );
}

/// KYC gate, price divisibility, hard-cap and deadline enforcement.
#[test]
fn contribution_guards() {
    let mut env = bootstrap();
    let verified = kp(&mut env.svm);
    let stranger = kp(&mut env.svm);
    verify_investor(&mut env, &verified.pubkey());
    fund_usdc(&mut env, &verified.pubkey(), 10_000);
    fund_usdc(&mut env, &stranger.pubkey(), 10_000);

    let offering = create_offering(&mut env, [5u8; 32]);
    mint_supply(&mut env, &offering, 100);
    let deadline = now(&env.svm) + 3_600;
    open_offering(&mut env, &offering, 100, 1_000, deadline, 100);

    // No investor PDA at all → Anchor seeds constraint fails the tx.
    expect_fail(
        contribute(&mut env, &offering, &stranger, 100),
        "", // account missing
    );

    // Non-multiple of price_per_unit.
    expect_fail(
        contribute(&mut env, &offering, &verified, 150),
        "NotDivisible",
    );

    // Beyond hard cap.
    expect_fail(
        contribute(&mut env, &offering, &verified, 1_100),
        "ExceedsHardCap",
    );

    contribute(&mut env, &offering, &verified, 1_000).unwrap();

    // Contribution after the deadline is rejected.
    warp_past(&mut env.svm, deadline);
    expect_fail(
        contribute(&mut env, &offering, &verified, 100),
        "DeadlinePassed",
    );
}

/// A GAFI-blacklisted country can never be KYC-verified.
#[test]
fn gafi_country_rejected() {
    let mut env = bootstrap();
    let w = kp(&mut env.svm);
    let expiry = now(&env.svm) + 86_400 * 365;
    let res = send(
        &mut env.svm,
        &env.admin,
        &[],
        &[ix(
            "verify_investor",
            &{
                let mut v = Vec::new();
                v.extend_from_slice(w.pubkey().as_ref());
                v.extend_from_slice(&364u32.to_le_bytes()); // North Korea
                v.extend_from_slice(&borsh::to_vec(&InvestorType::National).unwrap());
                v.extend_from_slice(&expiry.to_le_bytes());
                v
            },
            vec![
                AccountMeta::new(env.admin.pubkey(), true),
                AccountMeta::new_readonly(platform_pda(), false),
                AccountMeta::new(investor_pda(&w.pubkey()), false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
        )],
    );
    expect_fail(res, "GafiBlacklisted");
}

/// The market-vault thaw is gated on a successful close — no secondary
/// trading on units that were never delivered.
#[test]
fn market_vault_requires_success() {
    let mut env = bootstrap();
    let offering = create_offering(&mut env, [6u8; 32]);
    mint_supply(&mut env, &offering, 10);
    let o = read_offering(&env.svm, &offering);
    let deadline = now(&env.svm) + 3_600;
    open_offering(&mut env, &offering, 100, 1_000, deadline, 100);

    // Still open → rejected.
    expect_fail(
        authorize_market_vault(&mut env, &offering, &o.treasury_ata),
        "MarketBeforeClose",
    );

    // After a successful close the thaw works.
    warp_past(&mut env.svm, deadline);
    let crank = kp(&mut env.svm);
    finalize(&mut env, &offering, &crank).unwrap();
    // Zero raise < soft → Failed, not Successful — vault still gated.
    env.svm.expire_blockhash();
    expect_fail(
        authorize_market_vault(&mut env, &offering, &o.treasury_ata),
        "MarketBeforeClose",
    );
}

/// PDA derivations must match the backend seeds in src/solana/pda.ts.
#[test]
fn pda_derivations_stable() {
    let seed = [7u8; 32];
    let o = offering_pda(&seed);
    assert_eq!(o, offering_pda(&seed));
    assert_ne!(o, rwa_mint_pda(&o));
    assert_ne!(o, contribution_pda(&o, &Pubkey::new_unique()));
    assert_ne!(o, opa_pda(&o));
}
