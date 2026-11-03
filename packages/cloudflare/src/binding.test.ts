import type { CloudflareEmailBinding } from "./binding.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// The declarations below are copied from @cloudflare/workers-types
// 5.20261023.1 (index.d.ts), renamed with a `Workers` prefix.  The package
// itself is not a dependency: its global declarations clash with the
// `Request` and `Response` types of Deno and Node.js.  This test only has to
// compile; it fails type checking if `env.EMAIL` stops fitting
// `CloudflareEmailBinding`.

interface WorkersEmailSendResult {
  messageId: string;
}

interface WorkersEmailMessage {
  readonly from: string;
  readonly to: string;
}

type WorkersEmailAttachment =
  | {
    disposition: "inline";
    contentId: string;
    filename: string;
    type: string;
    content: string | ArrayBuffer | ArrayBufferView;
  }
  | {
    disposition: "attachment";
    contentId?: undefined;
    filename: string;
    type: string;
    content: string | ArrayBuffer | ArrayBufferView;
  };

interface WorkersEmailAddress {
  name: string;
  email: string;
}

interface WorkersEmailReplyMessageBuilder {
  from: string | WorkersEmailAddress;
  subject: string;
  replyTo?: string | WorkersEmailAddress;
  headers?: Record<string, string>;
  text?: string;
  html?: string;
  attachments?: WorkersEmailAttachment[];
}

type WorkersEmailDestinations =
  & {
    to?: string | WorkersEmailAddress | (string | WorkersEmailAddress)[];
    cc?: string | WorkersEmailAddress | (string | WorkersEmailAddress)[];
    bcc?: string | WorkersEmailAddress | (string | WorkersEmailAddress)[];
  }
  & (
    | { to: string | WorkersEmailAddress | (string | WorkersEmailAddress)[] }
    | { cc: string | WorkersEmailAddress | (string | WorkersEmailAddress)[] }
    | { bcc: string | WorkersEmailAddress | (string | WorkersEmailAddress)[] }
  );

type WorkersEmailMessageBuilder =
  & WorkersEmailReplyMessageBuilder
  & WorkersEmailDestinations;

interface WorkersSendEmail {
  send(message: WorkersEmailMessage): Promise<WorkersEmailSendResult>;
  send(builder: WorkersEmailMessageBuilder): Promise<WorkersEmailSendResult>;
}

/**
 * Compiles only if a Workers `send_email` binding can be passed where
 * a `CloudflareEmailBinding` is expected, as in `{ binding: env.EMAIL }`.
 */
function acceptBinding(binding: WorkersSendEmail): CloudflareEmailBinding {
  return binding;
}

describe("CloudflareEmailBinding", () => {
  it("accepts the type of a Workers send_email binding", () => {
    assert.equal(typeof acceptBinding, "function");
  });
});
