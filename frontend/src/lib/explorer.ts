import { SOLANA_CLUSTER } from './solanaWallet';

const suffix = SOLANA_CLUSTER === 'mainnet-beta' ? '' : `?cluster=${SOLANA_CLUSTER}`;

export const explorerAddress = (address: string) => `https://explorer.solana.com/address/${address}${suffix}`;
export const explorerTx = (signature: string) => `https://explorer.solana.com/tx/${signature}${suffix}`;
