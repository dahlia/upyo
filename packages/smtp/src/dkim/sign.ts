/**
 * DKIM Signing implementation per RFC 6376.
 *
 * Uses Web Crypto API for cross-runtime compatibility.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6376
 * @since 0.4.0
 */

import {
  canonicalizeBodyRelaxed,
  canonicalizeBodySimple,
  canonicalizeHeaderRelaxed,
  canonicalizeHeaderSimple,
} from "./canonicalize.ts";
import {
  DEFAULT_ALGORITHM,
  DEFAULT_CANONICALIZATION,
  DEFAULT_SIGNED_HEADERS,
  type DkimSignature,
  type DkimSignResult,
} from "./types.ts";

/**
 * Signs a raw email message with DKIM.
 *
 * @param rawMessage - The complete raw email message (headers + body)
 * @param config - DKIM signature configuration
 * @returns The DKIM-Signature header result
 * @throws Error if signing fails (e.g., invalid private key)
 * @since 0.4.0
 */
export async function signMessage(
  rawMessage: string,
  config: DkimSignature,
): Promise<DkimSignResult> {
  const algorithm = config.algorithm ?? DEFAULT_ALGORITHM;
  const canonicalization = config.canonicalization ?? DEFAULT_CANONICALIZATION;
  const headerFields = config.headerFields ?? DEFAULT_SIGNED_HEADERS;

  // Parse the raw message into headers and body
  const { headers, body } = parseMessage(rawMessage);

  // Determine canonicalization methods
  const [headerCanon, bodyCanon] = canonicalization.split("/") as [
    "relaxed" | "simple",
    "relaxed" | "simple",
  ];

  // Get or import the private key
  const privateKey = await getPrivateKey(config.privateKey, algorithm);

  // Compute body hash
  const bodyHash = await computeBodyHash(body, bodyCanon);

  // Build the DKIM-Signature header value (without b= value)
  const dkimHeaderValue = buildDkimHeaderValue({
    algorithm,
    canonicalization,
    signingDomain: config.signingDomain,
    selector: config.selector,
    headerFields,
    bodyHash,
  });

  // Compute the signature
  const signatureData = buildSignatureData(
    headers,
    headerFields,
    headerCanon,
    dkimHeaderValue,
  );

  const signature = await signData(signatureData, privateKey, algorithm);

  // Return the complete DKIM-Signature header
  return {
    headerName: "DKIM-Signature",
    signature: `${dkimHeaderValue} b=${signature}`,
  };
}

/**
 * Parses a raw email message into headers and body.
 */
function parseMessage(rawMessage: string): {
  headers: Map<string, string>;
  body: string;
} {
  // Find the separator between headers and body (empty line)
  const separatorIndex = rawMessage.indexOf("\r\n\r\n");
  if (separatorIndex === -1) {
    // No body, all headers
    return {
      headers: parseHeaders(rawMessage),
      body: "",
    };
  }

  const headerSection = rawMessage.substring(0, separatorIndex);
  const body = rawMessage.substring(separatorIndex + 4); // Skip \r\n\r\n

  return {
    headers: parseHeaders(headerSection),
    body,
  };
}

/**
 * Parses header section into a map of header name to value.
 * Handles folded headers (continuation lines).
 */
function parseHeaders(headerSection: string): Map<string, string> {
  const headers = new Map<string, string>();
  const lines = headerSection.split("\r\n");

  let currentName = "";
  let currentValue = "";

  for (const line of lines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      // Continuation of previous header (folded)
      currentValue += "\r\n" + line;
    } else {
      // New header - save previous if exists
      if (currentName) {
        headers.set(currentName.toLowerCase(), currentValue);
      }

      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        currentName = line.substring(0, colonIndex);
        currentValue = line.substring(colonIndex + 1);
      }
    }
  }

  // Save the last header
  if (currentName) {
    headers.set(currentName.toLowerCase(), currentValue);
  }

  return headers;
}

/**
 * Gets the private key, either using a provided CryptoKey or importing from PEM.
 */
function getPrivateKey(
  key: string | CryptoKey,
  algorithm: string,
): CryptoKey | Promise<CryptoKey> {
  if (typeof key !== "string") {
    // Already a CryptoKey, use it directly
    return key;
  }
  return importPrivateKey(key, algorithm);
}

/**
 * Imports a PEM-encoded private key for use with Web Crypto API.
 */
async function importPrivateKey(
  pem: string,
  algorithm: string,
): Promise<CryptoKey> {
  try {
    // Remove PEM headers/footers and whitespace
    const pemContents = pem
      .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/, "")
      .replace(/-----END (?:RSA )?PRIVATE KEY-----/, "")
      .replace(/\s/g, "");

    // Decode Base64 to binary
    const binaryString = atob(pemContents);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Determine the algorithm parameters based on DKIM algorithm
    const keyAlgorithm = algorithm === "ed25519-sha256"
      ? { name: "Ed25519" }
      : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

    return await crypto.subtle.importKey(
      "pkcs8",
      bytes,
      keyAlgorithm,
      false,
      ["sign"],
    );
  } catch (error) {
    throw new Error(
      `Failed to import private key: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Computes the body hash (bh= tag value).
 */
async function computeBodyHash(
  body: string,
  canonMethod: "relaxed" | "simple",
): Promise<string> {
  // Canonicalize the body
  const canonicalBody = canonMethod === "relaxed"
    ? canonicalizeBodyRelaxed(body)
    : canonicalizeBodySimple(body);

  // Hash with SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalBody);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Base64 encode
  return arrayBufferToBase64(hashBuffer);
}

/**
 * Builds the DKIM-Signature header value without the b= signature.
 */
function buildDkimHeaderValue(params: {
  algorithm: string;
  canonicalization: string;
  signingDomain: string;
  selector: string;
  headerFields: readonly string[];
  bodyHash: string;
}): string {
  const parts = [
    "v=1",
    `a=${params.algorithm}`,
    `c=${params.canonicalization}`,
    `d=${params.signingDomain}`,
    `s=${params.selector}`,
    `h=${params.headerFields.join(":")}`,
    `bh=${params.bodyHash};`,
  ];

  return parts.join("; ");
}

/**
 * Builds the data to be signed (canonicalized headers + DKIM-Signature header).
 */
function buildSignatureData(
  headers: Map<string, string>,
  headerFields: readonly string[],
  canonMethod: "relaxed" | "simple",
  dkimHeaderValue: string,
): string {
  const lines: string[] = [];

  // Canonicalize each header specified in h= tag
  for (const field of headerFields) {
    const value = headers.get(field.toLowerCase());
    if (value !== undefined) {
      const canonicalized = canonMethod === "relaxed"
        ? canonicalizeHeaderRelaxed(field, value)
        : canonicalizeHeaderSimple(field, value);
      lines.push(canonicalized);
    }
  }

  // Add the DKIM-Signature header itself (without trailing CRLF)
  // The b= tag should be empty for signing
  const dkimHeader = canonMethod === "relaxed"
    ? canonicalizeHeaderRelaxed("DKIM-Signature", " " + dkimHeaderValue + " b=")
    : canonicalizeHeaderSimple("DKIM-Signature", " " + dkimHeaderValue + " b=");

  lines.push(dkimHeader);

  // Join with CRLF (no trailing CRLF on last header per RFC 6376)
  return lines.join("\r\n");
}

/**
 * Signs data using the appropriate algorithm.
 */
async function signData(
  data: string,
  privateKey: CryptoKey,
  algorithm: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  // Determine the signing algorithm based on DKIM algorithm
  const signAlgorithm = algorithm === "ed25519-sha256"
    ? "Ed25519"
    : "RSASSA-PKCS1-v1_5";

  const signature = await crypto.subtle.sign(
    signAlgorithm,
    privateKey,
    dataBuffer,
  );

  return arrayBufferToBase64(signature);
}

/**
 * Converts an ArrayBuffer to a Base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
