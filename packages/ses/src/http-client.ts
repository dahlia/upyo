import type { ResolvedSesConfig } from "./config.ts";

export interface SesResponse {
  readonly statusCode?: number;
  readonly body?: string;
  readonly headers?: Record<string, string>;
}

export interface SesError {
  readonly message: string;
  readonly statusCode?: number;
  readonly errors?: {
    readonly message: string;
    readonly field?: string;
    readonly code?: string;
  }[];
}

export class SesHttpClient {
  config: ResolvedSesConfig;

  constructor(config: ResolvedSesConfig) {
    this.config = config;
  }

  sendMessage(
    messageData: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<SesResponse> {
    const region = this.config.region;
    const url =
      `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;

    return this.makeRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messageData),
      signal,
    });
  }

  async makeRequest(
    url: string,
    options: RequestInit,
  ): Promise<SesResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const response = await this.fetchWithAuth(url, options);
        const text = await response.text();

        if (response.status === 200) {
          return {
            statusCode: response.status,
            body: text,
            headers: this.headersToRecord(response.headers),
          };
        }

        let errorData: SesError;
        try {
          errorData = JSON.parse(text);
        } catch {
          errorData = { message: text || `HTTP ${response.status}` };
        }

        throw new SesApiError(
          errorData.message || `HTTP ${response.status}`,
          response.status,
          errorData.errors,
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (
          error instanceof SesApiError &&
          error.statusCode &&
          error.statusCode >= 400 &&
          error.statusCode < 500
        ) {
          throw error;
        }

        if (attempt === this.config.retries) {
          throw error;
        }

        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error("Request failed after all retries");
  }

  async fetchWithAuth(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    const credentials = await this.getCredentials();
    const headers = new Headers(options.headers);

    const signedHeaders = await this.signRequest(url, {
      ...options,
      headers,
    }, credentials);

    for (const [key, value] of Object.entries(this.config.headers)) {
      signedHeaders.set(key, value);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    let signal = controller.signal;
    if (options.signal) {
      signal = options.signal;
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort());
      }
    }

    try {
      return await globalThis.fetch(url, {
        ...options,
        headers: this.headersToRecord(signedHeaders),
        signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // deno-lint-ignore require-await
  private async getCredentials(): Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  }> {
    const auth = this.config.authentication;

    switch (auth.type) {
      case "credentials":
        return {
          accessKeyId: auth.accessKeyId,
          secretAccessKey: auth.secretAccessKey,
        };

      case "session":
        return {
          accessKeyId: auth.accessKeyId,
          secretAccessKey: auth.secretAccessKey,
          sessionToken: auth.sessionToken,
        };

      default:
        throw new Error(
          // deno-lint-ignore no-explicit-any
          `Unsupported authentication type: ${(auth as any).type}`,
        );
    }
  }

  private async signRequest(
    url: string,
    options: RequestInit,
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    },
  ): Promise<Headers> {
    const parsedUrl = new URL(url);
    const method = options.method || "GET";
    const headers = new Headers(options.headers);

    const host = parsedUrl.host;
    const path = parsedUrl.pathname + parsedUrl.search;
    const service = "ses";
    const region = this.config.region;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.substring(0, 8);

    headers.set("Host", host);
    headers.set("X-Amz-Date", amzDate);

    if (credentials.sessionToken) {
      headers.set("X-Amz-Security-Token", credentials.sessionToken);
    }

    const signedHeaders = "host;x-amz-date" +
      (credentials.sessionToken ? ";x-amz-security-token" : "");
    const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n` +
      (credentials.sessionToken
        ? `x-amz-security-token:${credentials.sessionToken}\n`
        : "");

    const payloadHash = await this.sha256(options.body as string || "");
    const canonicalRequest =
      `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    const algorithm = "AWS4-HMAC-SHA256";
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign =
      `${algorithm}\n${amzDate}\n${credentialScope}\n${await this.sha256(
        canonicalRequest,
      )}`;

    const signingKey = await this.getSignatureKey(
      credentials.secretAccessKey,
      dateStamp,
      region,
      service,
    );
    const signature = await this.hmacSha256(signingKey, stringToSign);

    const authorizationHeader =
      `${algorithm} Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    headers.set("Authorization", authorizationHeader);

    return headers;
  }

  private async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private async hmacSha256(key: ArrayBuffer, data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, dataBuffer);
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private async getSignatureKey(
    key: string,
    dateStamp: string,
    regionName: string,
    serviceName: string,
  ): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();

    let keyBuffer = new Uint8Array(encoder.encode("AWS4" + key))
      .buffer as ArrayBuffer;
    keyBuffer = await this.hmacSha256Buffer(keyBuffer, dateStamp);
    keyBuffer = await this.hmacSha256Buffer(keyBuffer, regionName);
    keyBuffer = await this.hmacSha256Buffer(keyBuffer, serviceName);
    keyBuffer = await this.hmacSha256Buffer(keyBuffer, "aws4_request");

    return keyBuffer;
  }

  private async hmacSha256Buffer(
    key: ArrayBuffer,
    data: string,
  ): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return await crypto.subtle.sign("HMAC", cryptoKey, dataBuffer);
  }

  headersToRecord(headers: Headers): Record<string, string> {
    const record: Record<string, string> = {};
    for (const [key, value] of headers.entries()) {
      record[key] = value;
    }
    return record;
  }
}

export class SesApiError extends Error {
  readonly statusCode?: number;
  readonly errors?: {
    readonly message: string;
    readonly field?: string;
    readonly code?: string;
  }[];

  constructor(
    message: string,
    statusCode?: number,
    errors?: Array<{
      message: string;
      field?: string;
      code?: string;
    }>,
  ) {
    super(message);
    this.name = "SesApiError";
    this.statusCode = statusCode;
    this.errors = errors;
  }
}
