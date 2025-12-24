import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { findMailAccount, type JmapSession } from "./session.ts";

describe("findMailAccount", () => {
  it("should find account with mail capability", () => {
    const session: JmapSession = {
      capabilities: {},
      accounts: {
        "account-1": {
          name: "Test Account",
          isPersonal: true,
          isReadOnly: false,
          accountCapabilities: {
            "urn:ietf:params:jmap:mail": {},
          },
        },
      },
      primaryAccounts: {},
      username: "test@example.com",
      apiUrl: "https://jmap.example.com/api",
      downloadUrl: "https://jmap.example.com/download/{blobId}",
      uploadUrl: "https://jmap.example.com/upload/{accountId}",
      state: "123",
    };

    const accountId = findMailAccount(session);
    assert.equal(accountId, "account-1");
  });

  it("should return null when no mail account exists", () => {
    const session: JmapSession = {
      capabilities: {},
      accounts: {
        "account-1": {
          name: "Contacts Account",
          isPersonal: true,
          isReadOnly: false,
          accountCapabilities: {
            "urn:ietf:params:jmap:contacts": {},
          },
        },
      },
      primaryAccounts: {},
      username: "test@example.com",
      apiUrl: "https://jmap.example.com/api",
      downloadUrl: "https://jmap.example.com/download/{blobId}",
      uploadUrl: "https://jmap.example.com/upload/{accountId}",
      state: "123",
    };

    const accountId = findMailAccount(session);
    assert.equal(accountId, null);
  });

  it("should find first mail account when multiple exist", () => {
    const session: JmapSession = {
      capabilities: {},
      accounts: {
        "contacts-only": {
          name: "Contacts Only",
          isPersonal: true,
          isReadOnly: false,
          accountCapabilities: {
            "urn:ietf:params:jmap:contacts": {},
          },
        },
        "mail-account": {
          name: "Mail Account",
          isPersonal: true,
          isReadOnly: false,
          accountCapabilities: {
            "urn:ietf:params:jmap:mail": {},
          },
        },
      },
      primaryAccounts: {},
      username: "test@example.com",
      apiUrl: "https://jmap.example.com/api",
      downloadUrl: "https://jmap.example.com/download/{blobId}",
      uploadUrl: "https://jmap.example.com/upload/{accountId}",
      state: "123",
    };

    const accountId = findMailAccount(session);
    assert.equal(accountId, "mail-account");
  });
});
