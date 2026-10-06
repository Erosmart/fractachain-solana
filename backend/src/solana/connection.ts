import { clusterApiUrl, Commitment, Connection } from '@solana/web3.js';
import path from 'path';
import fs from 'fs';

export type SolanaCluster = 'devnet' | 'testnet' | 'localnet' | 'mainnet-beta';

export const SOLANA_CLUSTER: SolanaCluster =
  (process.env.SOLANA_CLUSTER as SolanaCluster) || 'devnet';

export const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ||
  (SOLANA_CLUSTER === 'localnet'
    ? 'http://127.0.0.1:8899'
    : clusterApiUrl(
        SOLANA_CLUSTER === 'mainnet-beta'
          ? 'mainnet-beta'
          : SOLANA_CLUSTER === 'testnet'
            ? 'testnet'
            : 'devnet',
      ));

export const isLocalCluster = SOLANA_CLUSTER === 'localnet' || SOLANA_CLUSTER === 'devnet';

/** Devnet/localnet airdrops + demo USDC grants are opt-in: nothing touches the network unless SOLANA_AUTO_FAUCET=true. */
export function autoFaucetEnabled(): boolean {
  return process.env.SOLANA_AUTO_FAUCET === 'true' && SOLANA_CLUSTER !== 'mainnet-beta';
}

export const SOLANA_COMMITMENT: Commitment =
  (process.env.SOLANA_COMMITMENT as Commitment) || 'confirmed';

/** Fallback pre-deployment program id — replaced by deployments/<cluster>.json. */
export const FALLBACK_PROGRAM_ID =
  process.env.FRACTACHAIN_PROGRAM_ID || 'Fractachain111111111111111111111111111111111';

let cached: Connection | null = null;

export function getConnection(): Connection {
  if (!cached) {
    cached = new Connection(SOLANA_RPC_URL, SOLANA_COMMITMENT);
  }
  return cached;
}

export function explorerTx(signature?: string | null): string | null {
  if (!signature) return null;
  const cluster =
    SOLANA_CLUSTER === 'mainnet-beta' ? '' : `?cluster=${SOLANA_CLUSTER}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

export function explorerAddress(address?: string | null): string | null {
  if (!address) return null;
  const cluster =
    SOLANA_CLUSTER === 'mainnet-beta' ? '' : `?cluster=${SOLANA_CLUSTER}`;
  return `https://explorer.solana.com/address/${address}${cluster}`;
}

export function deploymentsDir(): string {
  return path.join(__dirname, '..', '..', '..', 'deployments');
}

export function deploymentFile(): string {
  return path.join(deploymentsDir(), `${SOLANA_CLUSTER}.json`);
}

export function readDeployment<T = Record<string, unknown>>(): T | null {
  try {
    const file = deploymentFile();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}
