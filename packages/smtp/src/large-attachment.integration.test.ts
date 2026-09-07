import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type Socket } from "node:net";
import { Buffer } from "node:buffer";
import { createHash, verify } from "node:crypto";
import { createMessage } from "@upyo/core";
import { SmtpTransport } from "./smtp-transport.ts";
import {
  TEST_DKIM_PRIVATE_KEY,
  TEST_DKIM_PUBLIC_KEY,
} from "./test-utils/dkim-test-keys.ts";

for (const megabytes of [8, 64]) {
  for (const signed of [false, true]) {
    test(`streams ${megabytes} MiB to a slow receiver${signed ? " with DKIM" : ""}`, async () => {
      const total = megabytes * 1024 * 1024;
      const payloadHash = createHash("sha256");
      const bodyHash = createHash("sha256");
      const expectedHash = createHash("sha256");
      const bytes = Uint8Array.from({ length: 65536 }, (_, i) => i % 251);
      for (let offset = 0; offset < total; offset += bytes.length) {
        expectedHash.update(bytes);
      }
      let received = 0;
      let produced = 0;
      let maximumAhead = 0;
      let reads = 0;
      let socket: Socket | undefined;
      let resumeTimer: ReturnType<typeof setTimeout> | undefined;
      const headers: string[] = [];
      let serverError: unknown;
      const server = createServer((connection) => {
        socket = connection;
        connection.on("error", (error) => {
          serverError = error;
        });
        connection.write("220 ready\r\n");
        let buffer = "";
        let data = false;
        let header = true;
        let attachmentHeader = false;
        let payload = false;
        connection.on("data", (chunk) => {
          connection.pause();
          resumeTimer = setTimeout(() => connection.resume(), 1);
          buffer += chunk.toString("utf8");
          let end: number;
          while ((end = buffer.indexOf("\r\n")) >= 0) {
            let line = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (!data) {
              if (line.startsWith("EHLO")) {
                connection.write("250-test\r\n250 SIZE 200000000\r\n");
              } else if (line === "DATA") {
                data = true;
                connection.write("354 go\r\n");
              } else if (line === "QUIT") connection.end("221 bye\r\n");
              else connection.write("250 OK\r\n");
              continue;
            }
            if (line === ".") {
              data = false;
              connection.write("250 accepted\r\n");
              continue;
            }
            if (line.startsWith("..")) line = line.slice(1);
            if (header) {
              if (line === "") header = false;
              else headers.push(line);
              continue;
            }
            bodyHash.update(line + "\r\n");
            if (line.startsWith("--")) {
              payload = false;
              attachmentHeader = false;
            }
            if (payload) {
              const decoded = Buffer.from(line, "base64");
              payloadHash.update(decoded);
              received += decoded.length;
              maximumAhead = Math.max(maximumAhead, produced - received);
            }
            if (line === "Content-Transfer-Encoding: base64") {
              attachmentHeader = true;
            }
            if (attachmentHeader && line === "") payload = true;
          }
          // The receiver keeps only an incomplete MIME line, never the DATA body.
          if (buffer.length > 65536) {
            serverError = new RangeError("Receiver buffer grew unexpectedly.");
          }
        });
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve)
      );
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const transport = new SmtpTransport({
        host: "127.0.0.1",
        port: address.port,
        pool: false,
        socketTimeout: 10000,
        dkim: signed
          ? {
            bodyMode: "streaming",
            signatures: [{
              signingDomain: "example.com",
              selector: "test",
              canonicalization: "simple/simple",
              privateKey: TEST_DKIM_PRIVATE_KEY,
            }],
          }
          : undefined,
      });
      try {
        const receipt = await transport.send(
          createMessage({
            from: "from@example.com",
            to: "to@example.com",
            subject: "Large attachment",
            content: { text: "Test" },
            attachments: {
              filename: "large.bin",
              inline: false,
              contentType: "application/octet-stream",
              contentId: "large",
              content: async function* () {
                reads++;
                produced = 0;
                for (let offset = 0; offset < total; offset += bytes.length) {
                  produced += bytes.length;
                  yield bytes;
                }
              },
            },
          }),
        );
        assert.ok(receipt.successful, JSON.stringify(receipt));
        assert.equal(reads, signed ? 2 : 1);
        assert.equal(received, total);
        assert.equal(payloadHash.digest("hex"), expectedHash.digest("hex"));
        assert.ok(
          maximumAhead < 8 * 1024 * 1024,
          `Read ahead: ${maximumAhead}`,
        );
        if (signed) {
          const signature = headers.find((line) =>
            line.startsWith("DKIM-Signature:")
          )!;
          const tags = new Map(
            signature.slice(15).split(";").map((tag) => {
              const equal = tag.indexOf("=");
              return [tag.slice(0, equal).trim(), tag.slice(equal + 1).trim()];
            }),
          );
          assert.equal(tags.get("bh"), bodyHash.digest("base64"));
          const selected = tags.get("h")!.split(":").map((name) =>
            headers.find((line) =>
              line.toLowerCase().startsWith(name.toLowerCase() + ":")
            )!
          );
          selected.push(signature.replace(/b=[^;]*$/, "b="));
          assert.ok(
            verify(
              "sha256",
              Buffer.from(selected.join("\r\n")),
              TEST_DKIM_PUBLIC_KEY,
              Buffer.from(tags.get("b")!, "base64"),
            ),
          );
        }
      } finally {
        await transport.closeAllConnections();
        clearTimeout(resumeTimer);
        socket?.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      if (
        serverError &&
        !(serverError instanceof Error && "code" in serverError &&
          serverError.code === "ECONNRESET")
      ) throw serverError;
    });
  }
}
