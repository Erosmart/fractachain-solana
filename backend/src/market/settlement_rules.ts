/**
 * Decision table for the automatic settlement, kept free of RPC and storage so
 * it can be tested: the expensive part (una llamada RPC) only runs when
 * the listing is an open on-chain offering.
 */
export type SettlementAction = 'settle_holders' | 'check_chain' | 'skip';

export function settlementAction(input: {
  status: string;
  onChain: boolean;
}): SettlementAction {
  if (input.status === 'CLOSED_SUCCESS') return 'settle_holders';
  // A sandbox offering closes through its own settlement policy; forcing a
  // close here would shut every open demo listing on the first contribution.
  if (input.status === 'LISTED' && input.onChain) return 'check_chain';
  return 'skip';
}
