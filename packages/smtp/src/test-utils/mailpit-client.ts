export interface MailpitConfig {
  readonly baseUrl: string;
  readonly timeout?: number;
}

export interface MailpitMessage {
  readonly ID: string;
  readonly MessageID: string;
  readonly Read: boolean;
  readonly From: {
    readonly Name: string;
    readonly Address: string;
  };
  readonly To: Array<{
    readonly Name: string;
    readonly Address: string;
  }>;
  readonly Cc: Array<{
    readonly Name: string;
    readonly Address: string;
  }>;
  readonly Bcc: Array<{
    readonly Name: string;
    readonly Address: string;
  }>;
  readonly Subject: string;
  readonly Date: string;
  readonly Text: string;
  readonly HTML: string;
  readonly Size: number;
  readonly Attachments: Array<{
    readonly PartID: string;
    readonly FileName: string;
    readonly ContentType: string;
    readonly ContentID: string;
    readonly Size: number;
  }>;
  readonly Tags: string[];
}

export interface MailpitSearchCriteria {
  readonly subject?: string;
  readonly from?: string;
  readonly to?: string;
  readonly hasAttachments?: boolean;
  readonly limit?: number;
}

export class MailpitClient {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(config: MailpitConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeout = config.timeout ?? 30000;
  }

  async getMessages(limit: number = 50): Promise<MailpitMessage[]> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/messages?limit=${limit}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(this.timeout),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch messages: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data.messages ?? [];
  }

  async getMessage(messageId: string): Promise<MailpitMessage> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/message/${messageId}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(this.timeout),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch message: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  }

  async searchMessages(
    criteria: MailpitSearchCriteria,
  ): Promise<MailpitMessage[]> {
    const queryParts: string[] = [];

    if (criteria.subject) {
      queryParts.push(`subject:"${criteria.subject}"`);
    }
    if (criteria.from) {
      queryParts.push(`from:"${criteria.from}"`);
    }
    if (criteria.to) {
      queryParts.push(`to:"${criteria.to}"`);
    }
    if (criteria.hasAttachments) {
      queryParts.push("has:attachment");
    }

    const searchParams = new URLSearchParams();
    if (queryParts.length > 0) {
      searchParams.append("query", queryParts.join(" "));
    }
    if (criteria.limit) {
      searchParams.append("limit", criteria.limit.toString());
    }

    const response = await fetch(
      `${this.baseUrl}/api/v1/search?${searchParams}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(this.timeout),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to search messages: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data.messages ?? [];
  }

  async deleteMessage(messageId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/message/${messageId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(this.timeout),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to delete message: ${response.status} ${response.statusText}`,
      );
    }
  }

  async deleteAllMessages(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/messages`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to delete all messages: ${response.status} ${response.statusText}`,
      );
    }
  }

  async waitForMessage(
    criteria: MailpitSearchCriteria,
    timeout: number = 30000,
    pollInterval: number = 1000,
  ): Promise<MailpitMessage> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const messages = await this.searchMessages(criteria);

      if (messages.length > 0) {
        // Get the full message details using the getMessage API
        // which includes complete attachment information
        return await this.getMessage(messages[0].ID);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Message not found within ${timeout}ms timeout`);
  }

  async getInfo(): Promise<{ version: string; database: string }> {
    const response = await fetch(`${this.baseUrl}/api/v1/info`, {
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get info: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  }
}
