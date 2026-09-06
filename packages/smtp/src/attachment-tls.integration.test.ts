import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import {
  createSecureContext,
  createServer as createTlsServer,
  TLSSocket,
} from "node:tls";
import { createMessage } from "@upyo/core";
import { SmtpTransport } from "./smtp-transport.ts";

const credentials = {
  key: readFileSync(new URL("../test-certs/server-key.pem", import.meta.url)),
  cert: readFileSync(new URL("../test-certs/server-cert.pem", import.meta.url)),
};

for (const implicit of [false, true]) {
  for (const cancel of [false, true]) {
    test(`${implicit ? "implicit TLS" : "STARTTLS"} ${cancel ? "cancels" : "streams"} attachment reads`, async () => {
      const sockets = new Set<Socket>();
      let received = "";
      let accepted = false;
      const controller = new AbortController();
      const handle = (socket: Socket, upgraded = false) => {
        sockets.add(socket);
        socket.on("error", () => {});
        socket.on("close", () => sockets.delete(socket));
        if (!upgraded) socket.write("220 ready\r\n");
        let buffer = "";
        let data = false;
        const onData = (bytes: Uint8Array) => {
          buffer += Buffer.from(bytes).toString();
          let end: number;
          while ((end = buffer.indexOf("\r\n")) >= 0) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (data) {
              if (line === ".") {
                data = false;
                accepted = true;
                socket.write("250 accepted\r\n");
              } else received += line + "\r\n";
            } else if (line.startsWith("EHLO")) {
              socket.write(
                implicit || upgraded
                  ? "250 ready\r\n"
                  : "250-ready\r\n250 STARTTLS\r\n",
              );
            } else if (line === "STARTTLS") {
              socket.off("data", onData);
              socket.write("220 upgrade\r\n");
              const tls = new TLSSocket(socket, {
                isServer: true,
                secureContext: createSecureContext(credentials),
              });
              handle(tls, true);
              return;
            } else if (line === "DATA") {
              data = true;
              socket.write("354 go\r\n");
            } else if (line === "QUIT") socket.end("221 bye\r\n");
            else socket.write("250 OK\r\n");
          }
        };
        socket.on("data", onData);
      };
      const server = implicit
        ? createTlsServer(credentials, handle)
        : createServer(handle);
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve)
      );
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const transport = new SmtpTransport({
        host: "127.0.0.1",
        port: address.port,
        secure: implicit,
        requireTls: !implicit,
        tls: { rejectUnauthorized: false },
        pool: false,
        socketTimeout: 2000,
      });
      let closed = false;
      try {
        const pending = transport.send(
          createMessage({
            from: "from@example.com",
            to: "to@example.com",
            subject: "TLS",
            content: { text: "Test" },
            attachments: {
              filename: "a.bin",
              contentId: "a",
              inline: false,
              contentType: "application/octet-stream",
              content: async function* (signal) {
                try {
                  yield new Uint8Array([1, 2, 3]);
                  if (cancel) controller.abort(new TypeError("Canceled."));
                  signal?.throwIfAborted();
                  yield new Uint8Array([4, 5, 6]);
                } finally {
                  closed = true;
                }
              },
            },
          }),
          { signal: controller.signal },
        );
        if (cancel) {
          await assert.rejects(
            pending,
            (error) => error === controller.signal.reason,
          );
        } else {
          assert.ok((await pending).successful);
          assert.ok(received.includes("AQIDBAUG"));
        }
        assert.equal(accepted, !cancel);
        assert.ok(closed);
      } finally {
        await transport.closeAllConnections();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  }
}
