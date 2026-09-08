import {
  createFailedReceipt,
  type RawMessagePlan,
  RawMessageValidationError,
  type Receipt,
} from "@upyo/core";
import type { ResolvedJmapConfig } from "./config.ts";
import { JMAP_ERROR_TYPES, JmapApiError } from "./errors.ts";
import { JmapHttpClient, type JmapRequest } from "./http-client.ts";
import type { JmapSession } from "./session.ts";
import { isRecord, rawOperation, uploadRawMessage } from "./raw-upload.ts";

const using = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:mail",
  "urn:ietf:params:jmap:submission",
];

function failure(
  message: string,
  stage: "import" | "submission" | "upload",
  retryable: boolean,
  unknown = false,
): Receipt<"jmap"> {
  return createFailedReceipt(message, {
    provider: "jmap",
    code: `jmap.raw_${stage}_${unknown ? "unknown" : "failed"}`,
    category: unknown ? "unknown" : retryable ? undefined : "rejected",
    retryable,
    attempts: 1,
  });
}

function methodResult(
  response: unknown,
  name: string,
  id: string,
  accountId: string,
): { name: string; args: Record<string, unknown> } {
  if (!isRecord(response) || !Array.isArray(response.methodResponses)) {
    throw new JmapApiError("Invalid raw JMAP method response.");
  }
  const matches = response.methodResponses.filter((entry: unknown) =>
    Array.isArray(entry) && entry[2] === id
  );
  if (matches.length !== 1) {
    throw new JmapApiError(
      "Missing or contradictory raw JMAP method response.",
    );
  }
  const result: unknown = matches[0];
  if (
    !Array.isArray(result) || result.length !== 3 || !isRecord(result[1]) ||
    (result[0] !== name && result[0] !== "error")
  ) throw new JmapApiError("Invalid raw JMAP method result.");
  if (result[0] === "error") {
    if (typeof result[1].type !== "string" || !result[1].type) {
      throw new JmapApiError("Invalid raw JMAP method error.");
    }
  } else if (result[1].accountId !== accountId) {
    throw new JmapApiError("Wrong account in raw JMAP response.");
  }
  return { name: result[0], args: result[1] };
}

function creation(
  args: Record<string, unknown>,
): { created?: Record<string, unknown>; rejected?: Record<string, unknown> } {
  const created = isRecord(args.created) ? args.created.raw : undefined;
  const rejected = isRecord(args.notCreated) ? args.notCreated.raw : undefined;
  if (created !== undefined && rejected !== undefined) {
    throw new JmapApiError("Contradictory raw JMAP creation result.");
  }
  if (isRecord(created) && typeof created.id === "string" && created.id) {
    return { created };
  }
  if (
    isRecord(rejected) && typeof rejected.type === "string" && rejected.type
  ) return { rejected };
  throw new JmapApiError("Missing raw JMAP creation result.");
}

function errorDescription(error: Record<string, unknown>): string {
  return `Raw JMAP operation rejected: ${String(error.type)}${
    typeof error.description === "string" ? `: ${error.description}` : ""
  }`;
}

function isRequestRejection(error: unknown): boolean {
  if (
    !(error instanceof JmapApiError) || !error.responseBody ||
    error.statusCode === undefined || error.statusCode < 400 ||
    error.statusCode > 599
  ) return false;
  try {
    const body: unknown = JSON.parse(error.responseBody);
    if (
      !isRecord(body) ||
      (body.status !== undefined && body.status !== error.statusCode)
    ) return false;
    if (body.type === JMAP_ERROR_TYPES.limit) {
      return typeof body.limit === "string" && body.limit.length > 0;
    }
    return body.type === JMAP_ERROR_TYPES.notJSON ||
      body.type === JMAP_ERROR_TYPES.notRequest ||
      body.type === JMAP_ERROR_TYPES.unknownCapability;
  } catch {
    return false;
  }
}

/** Uploads, imports, then submits exactly once; uncertain submission must not be retried. @internal */
export async function deliverRawMessage(
  config: ResolvedJmapConfig,
  session: JmapSession,
  accountId: string,
  draftsMailboxId: string,
  identityId: string,
  plan: RawMessagePlan,
  signal?: AbortSignal,
): Promise<Receipt<"jmap">> {
  // Mutations must never inherit the composed transport's automatic retries.
  const client = new JmapHttpClient({ ...config, retries: 0 }, false);
  const execute = (request: JmapRequest) =>
    rawOperation(
      config.timeout,
      (owned) => client.executeRequest(session.apiUrl, request, owned),
      signal,
    );
  let stage: "upload" | "import" | "submission" = "upload";
  try {
    const uploaded = await uploadRawMessage(
      config,
      session.uploadUrl,
      accountId,
      plan,
      signal,
    );
    signal?.throwIfAborted();
    stage = "import";
    const imported = methodResult(
      await execute({
        using,
        methodCalls: [["Email/import", {
          accountId,
          emails: {
            raw: {
              blobId: uploaded.blobId,
              mailboxIds: { [draftsMailboxId]: true },
            },
          },
        }, "raw-import"]],
      }),
      "Email/import",
      "raw-import",
      accountId,
    );
    if (imported.name === "error") {
      return failure(
        errorDescription(imported.args),
        "import",
        imported.args.type === "serverPartialFail",
      );
    }
    const { created, rejected } = creation(imported.args);
    let emailId: string;
    if (created && typeof created.id === "string") emailId = created.id;
    else if (
      rejected?.type === "alreadyExists" &&
      typeof rejected.existingId === "string" && rejected.existingId
    ) {
      const existing = methodResult(
        await execute({
          using,
          methodCalls: [["Email/get", {
            accountId,
            ids: [rejected.existingId],
            properties: ["id", "blobId"],
          }, "raw-existing"]],
        }),
        "Email/get",
        "raw-existing",
        accountId,
      );
      const list = existing.args.list;
      if (
        existing.name === "error" || !Array.isArray(list) ||
        list.length !== 1 || !isRecord(list[0]) ||
        list[0].id !== rejected.existingId || list[0].blobId !== uploaded.blobId
      ) {
        return failure(
          "Existing Email does not match the uploaded raw blob.",
          "import",
          false,
        );
      }
      emailId = rejected.existingId;
    } else {return failure(
        errorDescription(rejected ?? { type: "invalidResult" }),
        "import",
        false,
      );}
    signal?.throwIfAborted();
    stage = "submission";
    const submitted = methodResult(
      await execute({
        using,
        methodCalls: [["EmailSubmission/set", {
          accountId,
          create: {
            raw: {
              emailId,
              identityId,
              envelope: {
                mailFrom: { email: plan.envelope.from ?? "" },
                rcptTo: plan.envelope.to.map((email) => ({ email })),
              },
            },
          },
        }, "raw-submit"]],
      }),
      "EmailSubmission/set",
      "raw-submit",
      accountId,
    );
    if (submitted.name === "error") {
      // RFC 8620 permits partial state changes for serverPartialFail.
      return failure(
        errorDescription(submitted.args),
        "submission",
        false,
        submitted.args.type === "serverPartialFail",
      );
    }
    const result = creation(submitted.args);
    if (result.rejected) {
      return failure(errorDescription(result.rejected), "submission", false);
    }
    if (!result.created || typeof result.created.id !== "string") {
      throw new JmapApiError("Missing raw submission ID.");
    }
    signal?.throwIfAborted();
    return { successful: true, provider: "jmap", messageId: result.created.id };
  } catch (error) {
    signal?.throwIfAborted();
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof RawMessageValidationError) {
      return createFailedReceipt(message, {
        provider: "jmap",
        code: "jmap.raw_message_invalid",
        category: "validation",
        retryable: false,
        attempts: 1,
      });
    }
    const definite = isRequestRejection(error);
    return failure(
      message,
      stage,
      stage !== "submission" && !definite,
      stage === "submission" && !definite,
    );
  }
}

/** Validates raw discovery responses before accepting delivery identifiers. @internal */
export function rawDiscoveryResult(
  response: unknown,
  method: string,
  accountId: string,
): Record<string, unknown> {
  const result = methodResult(response, method, "c0", accountId);
  if (result.name === "error") {
    throw new JmapApiError(errorDescription(result.args));
  }
  return result.args;
}
