import { autoDiscover, createClient } from '@solana/client';

export type SolanaNetwork = 'devnet' | 'mainnet-beta';

export function getSolanaNetwork(): SolanaNetwork {
  const raw = String(import.meta.env.VITE_SOLANA_NETWORK || 'devnet').trim().toLowerCase();
  return raw === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';
}

export function getSolanaEndpoint(network: SolanaNetwork = getSolanaNetwork()) {
  return network === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';
}

export const solanaClient = createClient({
  endpoint: getSolanaEndpoint(),
  walletConnectors: autoDiscover(),
});

export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return window.btoa(binary);
}

export function shortenAddress(value?: string | null) {
  if (!value) {
    return '';
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
