import { createMessage } from "@upyo/core";
import {
  type CloudflareEmailBinding,
  CloudflareWorkerTransport,
} from "../dist/index.js";

export default {
  async fetch(
    _request: Request,
    env: { readonly EMAIL: CloudflareEmailBinding },
  ): Promise<Response> {
    const transport = new CloudflareWorkerTransport({ binding: env.EMAIL });
    // The local simulator cannot pass attachment bytes, so this message has
    // none.
    const receipt = await transport.send(
      createMessage({
        from: "Sender <sender@example.com>",
        to: "Recipient <recipient@example.com>",
        cc: "cc@example.com",
        subject: "Edge smoke test",
        content: { text: "Hello", html: "<p>Hello</p>" },
        headers: { "X-Upyo": "edge" },
      }),
    );
    return Response.json(receipt);
  },
};
