export interface ArisOnRampResponse {
  success: boolean;
  arsAmount: number;
  usdcAmount: number;
  exchangeRate: number; // 1450 ARS/USD
  destinationWallet: string;
  txHash: string;
  settlementTimeSeconds: number;
  provider: 'Anclap (SEP-24)' | 'Alfred Pay (CBU/CVU)';
}

export interface FiatOnRampResponse {
  success: boolean;
  fiatAmount: number;
  fiatCurrency: 'USD' | 'EUR' | 'GBP' | 'BRL';
  usdcAmount: number;
  processingFeeUsdc: number; // 1%
  destinationWallet: string;
  txHash: string;
  provider: 'MoonPay' | 'Ramp Network' | 'Banxa';
}

export interface CctpBridgeResponse {
  success: boolean;
  originChain: 'ethereum' | 'arbitrum' | 'base' | 'solana' | 'polygon';
  destinationChain: 'solana';
  usdcAmount: number;
  bridgeFee: 0; // Cero slippage, Cero comisión
  timeSeconds: number;
  messageHash: string;
  solanaMintTx: string;
}

export interface NearIntentsResponse {
  success: boolean;
  depositAsset: 'BTC' | 'ETH' | 'SOL' | 'USDT';
  depositAmount: number;
  estimatedUsdcReceiving: number;
  depositAddress: string;
  swapStatus: 'COMPLETED_MOCK';
  solanaSettlementTx: string;
}

// 1. Simulación On-Ramp ARS (Anclap / Alfred Pay)
export function processArsOnRamp(arsAmount: number, destinationWallet: string): ArisOnRampResponse {
  const exchangeRate = 1450.0;
  const usdcAmount = Number((arsAmount / exchangeRate).toFixed(2));
  const txHash = `mock_solana_tx_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  return {
    success: true,
    arsAmount,
    usdcAmount,
    exchangeRate,
    destinationWallet,
    txHash,
    settlementTimeSeconds: 3,
    provider: 'Alfred Pay (CBU/CVU)',
  };
}

// 2. Simulación On-Ramp USD/EUR (MoonPay / Ramp con 1% fee)
export function processFiatOnRamp(fiatAmount: number, fiatCurrency: 'USD' | 'EUR' | 'GBP' | 'BRL', destinationWallet: string): FiatOnRampResponse {
  const fee = Number((fiatAmount * 0.01).toFixed(2));
  const netAmount = Number((fiatAmount - fee).toFixed(2));
  const txHash = `mock_card_tx_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  return {
    success: true,
    fiatAmount,
    fiatCurrency,
    usdcAmount: netAmount,
    processingFeeUsdc: fee,
    destinationWallet,
    txHash,
    provider: 'MoonPay',
  };
}

// 3. Simulación Circle CCTP V2 (Cross-chain 1:1 burn & mint)
export function processCctpBridge(originChain: 'ethereum' | 'arbitrum' | 'base' | 'solana' | 'polygon', usdcAmount: number, destinationWallet: string): CctpBridgeResponse {
  return {
    success: true,
    originChain,
    destinationChain: 'solana',
    usdcAmount,
    bridgeFee: 0,
    timeSeconds: 3,
    messageHash: `0x${Math.random().toString(16).substring(2)}${Math.random().toString(16).substring(2)}`,
    solanaMintTx: `cctp_mint_${Date.now()}_solana_devnet`,
  };
}

// 4. Simulación NEAR Intents 1Click (BTC/ETH/SOL/USDT -> Solana USDC)
export function processNearIntentsSwap(depositAsset: 'BTC' | 'ETH' | 'SOL' | 'USDT', depositAmount: number, destinationWallet: string): NearIntentsResponse {
  let rateToUsdc = 1;
  if (depositAsset === 'BTC') rateToUsdc = 65000;
  else if (depositAsset === 'ETH') rateToUsdc = 3400;
  else if (depositAsset === 'SOL') rateToUsdc = 150;
  else if (depositAsset === 'USDT') rateToUsdc = 1.0;

  const estimatedUsdcReceiving = Number((depositAmount * rateToUsdc).toFixed(2));

  return {
    success: true,
    depositAsset,
    depositAmount,
    estimatedUsdcReceiving,
    depositAddress: `intents_deposit_${depositAsset.toLowerCase()}_${Math.random().toString(36).substring(7)}`,
    swapStatus: 'COMPLETED_MOCK',
    solanaSettlementTx: `near_intent_tx_${Date.now()}_solana`,
  };
}
