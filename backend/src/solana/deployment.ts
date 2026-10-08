import fs from 'fs';
import path from 'path';
import { deploymentFile, deploymentsDir, readDeployment, SOLANA_CLUSTER } from './connection';

/** Pre-deploy declare_id! placeholder — never treat as a live program. */
export const PLACEHOLDER_PROGRAM_ID = 'Fractachain111111111111111111111111111111111';

export interface SolanaDeployment {
  cluster: string;
  programId: string;
  usdcMint?: string;
  usdtMint?: string;
  platform?: string;
  markets?: Record<string, { market: string; baseMint: string; quoteMint: string }>;
  deployedAt?: string;
  deployer?: string;
  notes?: string;
}

export function loadDeployment(): SolanaDeployment | null {
  return readDeployment<SolanaDeployment>();
}

function effectiveProgramId(): string {
  const env = (process.env.FRACTACHAIN_PROGRAM_ID || '').trim();
  if (env) return env;
  const dep = loadDeployment();
  return (dep?.programId || PLACEHOLDER_PROGRAM_ID).trim();
}

/**
 * True after scripts/devnet/03-deploy.sh stamps `deployedAt`, or when ops sets
 * FRACTACHAIN_PROGRAM_DEPLOYED=true (Railway env switch — no rebuild needed).
 *
 * Never true while the effective program id is still the placeholder
 * `Fractachain1111…` — a bare DEPLOYED=true without a real id would otherwise
 * drive create/mint/open against an undeployed address.
 */
export function isProgramDeployed(): boolean {
  const pid = effectiveProgramId();
  if (!pid || pid === PLACEHOLDER_PROGRAM_ID) {
    return false;
  }
  if (process.env.FRACTACHAIN_PROGRAM_DEPLOYED === 'true') {
    return true;
  }
  const dep = loadDeployment();
  return Boolean(dep?.programId && dep.deployedAt && dep.programId !== PLACEHOLDER_PROGRAM_ID);
}

export function saveDeployment(partial: Partial<SolanaDeployment>): SolanaDeployment {
  const current = loadDeployment() || { cluster: SOLANA_CLUSTER, programId: '' };
  const next: SolanaDeployment = { ...current, ...partial, cluster: SOLANA_CLUSTER };
  fs.mkdirSync(deploymentsDir(), { recursive: true });
  fs.writeFileSync(deploymentFile(), JSON.stringify(next, null, 2));
  return next;
}

export function deploymentPath(): string {
  return deploymentFile();
}
