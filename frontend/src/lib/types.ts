export type Role = 'ADMIN' | 'TRADER' | 'SYSTEM';

export interface User {
  id: string;
  username: string;
  email?: string | null;
  displayName?: string | null;
  role: Role;
  status: 'PENDING' | 'ACTIVE' | 'BLOCKED';
  totpEnabled?: boolean;
  takerFee?: string | null;
  spread?: string | null;
  maxOpenDeals?: number;
  countryCode?: string | null;
  preferredFiat?: string | null;
  preferredAsset?: string | null;
  locale?: string | null;
  needsCurrency?: boolean;
  kycStatus?: string;
  kycVerified?: boolean;
  createdAt?: string;
}

export interface Balance {
  currency: string;
  available: string;
  frozen: string;
  total: string;
}

export interface PaymentMethod {
  id: string;
  type: 'CARD' | 'SBP' | 'BANK_ACCOUNT' | 'CRYPTO_WALLET';
  bankName?: string | null;
  holderName: string;
  details: string;
  fiat: string;
  isActive: boolean;
}

export interface Advertisement {
  id: string;
  side: 'BUY' | 'SELL';
  asset: string;
  fiat: string;
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED';
  isFloating: boolean;
  price?: string | null;
  floatingMargin?: string | null;
  effectivePrice: number;
  totalAmount: string;
  availableAmount: string;
  minFiat: string;
  maxFiat: string;
  terms?: string | null;
  paymentWindowMin: number;
  user: {
    id: string;
    username: string;
    displayName?: string | null;
    trustScore?: number | null;
    completedDeals?: number | null;
  };
  paymentMethods: { paymentMethod: PaymentMethod }[];
}

export type DealStatus =
  | 'CREATED'
  | 'PAID'
  | 'RELEASED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DISPUTED';

export interface Deal {
  id: string;
  code: string;
  status: DealStatus;
  asset: string;
  fiat: string;
  price: string;
  assetAmount: string;
  fiatAmount: string;
  feeAmount: string;
  netAmount: string;
  paymentDeadline?: string | null;
  otcStage?: string;
  buyerAlias?: string | null;
  sellerAlias?: string | null;
  buyer: { id: string; username: string; displayName?: string | null };
  seller: { id: string; username: string; displayName?: string | null };
  paymentMethod?: PaymentMethod | null;
  dispute?: { status: string; reason: string } | null;
  chatMessages?: ChatMessage[];
  lastMessage?: ChatMessage | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  dealId: string;
  senderId: string;
  body: string;
  isSystem: boolean;
  attachmentUrl?: string | null;
  createdAt: string;
  sender?: { id: string; username: string };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  readAt?: string | null;
  createdAt: string;
}
