import { RoleName } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  keycloakUserId: string;
  email: string;
  name: string;
  role: RoleName;
  shopId: string | null;
}

export interface AuthenticatedAgent {
  printerId: string;
  agentId: string;
  shopId: string;
}

export interface StatusTokenClaims {
  [key: string]: unknown;
  shopId: string;
  documentId?: string;
  quoteId?: string;
  printJobId?: string;
  exp: number;
}
