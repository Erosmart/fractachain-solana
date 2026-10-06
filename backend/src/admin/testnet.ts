import fs from 'fs';
import path from 'path';
import { persistToPg } from '../data/pgstore';
import { SOLANA_CLUSTER, SOLANA_RPC_URL } from '../solana/connection';

export type SolanaMode = 'local' | 'faucet' | 'deploy';

export interface TestnetConfig {
  mode: SolanaMode;
  faucet: boolean;
  rpcUrl: string;
  cluster: string;
  notes: string;
  settlePolicy: 'ON_MIN' | 'ON_DATE';
  settleAt?: string;
  updatedAt: string;
}

const FILE = path.join(__dirname, '..', '..', 'data', 'testnet.json');

const DEFAULTS: TestnetConfig = {
  mode: 'deploy',
  faucet: true,
  rpcUrl: SOLANA_RPC_URL,
  cluster: SOLANA_CLUSTER,
  notes: 'Devnet de Solana. El faucet airdropea SOL. La dirección del programa está en deployments/devnet.json.',
  settlePolicy: 'ON_MIN',
  settleAt: undefined,
  updatedAt: new Date().toISOString(),
};

let config: TestnetConfig = { ...DEFAULTS };

function load() {
  try {
    if (fs.existsSync(FILE)) {
      config = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
    } else {
      save();
    }
  } catch {
    config = { ...DEFAULTS };
  }
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(config, null, 2));
  persistToPg('testnet.json', config);
}

load();

export function getTestnetConfig() {
  return { ...config };
}

export function setTestnetConfig(partial: Partial<TestnetConfig>) {
  const next = { ...config, ...partial, updatedAt: new Date().toISOString() };
  next.settlePolicy = partial.settlePolicy === 'ON_DATE' || next.settlePolicy === 'ON_DATE' ? 'ON_DATE' : 'ON_MIN';
  if (partial.settlePolicy === 'ON_MIN') {
    next.settlePolicy = 'ON_MIN';
    next.settleAt = undefined;
  }
  if (next.settlePolicy === 'ON_DATE') {
    const at = partial.settleAt ?? next.settleAt;
    if (!at) throw new Error('Indicá la fecha hasta la que esperás para repartir tokens');
    next.settleAt = new Date(at).toISOString();
  }
  config = next;
  save();
  return getTestnetConfig();
}
