import fs from 'fs';
import path from 'path';
import { deploymentFile, deploymentsDir, readDeployment, SOLANA_CLUSTER } from './connection';

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

/** True only after scripts/devnet/03-deploy.sh stamps `deployedAt` — the placeholder file stays in sandbox mode. */
export function isProgramDeployed(): boolean {
  const dep = loadDeployment();
  return Boolean(dep?.programId && dep.deployedAt);
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
