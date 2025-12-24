/**
 * JMAP Session response structure (RFC 8620 Section 2).
 * @since 0.4.0
 */
export interface JmapSession {
  readonly capabilities: Record<string, unknown>;
  readonly accounts: Record<string, JmapAccount>;
  readonly primaryAccounts: Record<string, string>;
  readonly username: string;
  readonly apiUrl: string;
  readonly downloadUrl: string;
  readonly uploadUrl: string;
  readonly eventSourceUrl?: string;
  readonly state: string;
}

/**
 * JMAP Account structure from session response.
 * @since 0.4.0
 */
export interface JmapAccount {
  readonly name: string;
  readonly isPersonal: boolean;
  readonly isReadOnly: boolean;
  readonly accountCapabilities: Record<string, unknown>;
}

/**
 * JMAP Identity object for sender authorization (RFC 8621 Section 6).
 * @since 0.4.0
 */
export interface JmapIdentity {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly replyTo?: readonly {
    readonly email: string;
    readonly name?: string;
  }[];
  readonly bcc?: readonly { readonly email: string; readonly name?: string }[];
  readonly textSignature?: string;
  readonly htmlSignature?: string;
  readonly mayDelete: boolean;
}

/**
 * Cached session data with metadata.
 * @since 0.4.0
 */
export interface CachedSession {
  readonly session: JmapSession;
  readonly fetchedAt: number;
  readonly accountId: string;
  readonly identities: readonly JmapIdentity[];
}

/**
 * Finds the first account with mail capability from a JMAP session.
 * @param session The JMAP session response.
 * @returns The account ID with mail capability, or `null` if none found.
 * @since 0.4.0
 */
export function findMailAccount(session: JmapSession): string | null {
  for (const [accountId, account] of Object.entries(session.accounts)) {
    if ("urn:ietf:params:jmap:mail" in account.accountCapabilities) {
      return accountId;
    }
  }
  return null;
}
