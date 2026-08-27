import assert from "node:assert/strict";
import test from "node:test";

import type { WelcomeGrantTransaction } from "./contracts.js";
import { createUserWithWelcomeGrant } from "./users.js";

function fakeUserTransaction(operations: string[]): WelcomeGrantTransaction {
  return {
    user: {
      create: async ({ data }) => {
        operations.push(`user:${data.email}:${data.creditBalance}`);
        return {
          id: "user-1",
          email: data.email,
          name: data.name ?? null,
          emailVerified: data.emailVerified ?? null,
          image: data.image ?? null,
          creditBalance: data.creditBalance,
          createdAt: new Date("2026-08-27T00:00:00.000Z"),
        };
      },
    },
    creditLedgerEntry: {
      create: async ({ data }) => {
        operations.push(
          `ledger:${data.userId}:${data.delta}:${data.reason}`,
        );
        return {
          id: "ledger-1",
          userId: data.userId,
          delta: data.delta,
          reason: data.reason,
          createdAt: new Date("2026-08-27T00:00:00.000Z"),
        };
      },
    },
  };
}

test("creates the user and welcome grant in one supplied transaction scope", async () => {
  const operations: string[] = [];
  const user = await createUserWithWelcomeGrant(
    fakeUserTransaction(operations),
    {
      email: "creator@example.com",
      name: null,
      emailVerified: null,
      image: null,
    },
    100,
  );

  assert.equal(user.creditBalance, 100);
  assert.deepEqual(operations, [
    "user:creator@example.com:100",
    "ledger:user-1:100:welcome_grant",
  ]);
});

test("rejects an Auth.js user with null email before writing anything", async () => {
  const operations: string[] = [];

  await assert.rejects(
    createUserWithWelcomeGrant(
      fakeUserTransaction(operations),
      {
        email: null,
        name: null,
        emailVerified: null,
        image: null,
      },
      100,
    ),
    /email is required/i,
  );
  assert.deepEqual(operations, []);
});
