#!/usr/bin/env node
// Dev-only credit top-up.
//
// There is no way to add credits without this until Phase 4 billing exists.
// Writes the balance change and a ledger entry in ONE transaction, so the
// ledger stays a complete audit trail -- bumping creditBalance alone would
// leave the ledger permanently unable to explain the balance.
//
// Usage:
//   node packages/db/scripts/grant-credits.mjs <email> <amount>
//
// Requires DATABASE_URL in the environment (or apps/worker/.env).

import { PrismaClient } from "@prisma/client";

const [, , email, rawAmount] = process.argv;

if (!email || !rawAmount) {
  console.error("Usage: grant-credits.mjs <email> <amount>");
  process.exit(1);
}

const amount = Number.parseInt(rawAmount, 10);
if (!Number.isInteger(amount) || amount <= 0) {
  console.error(`Amount must be a positive integer, got: ${rawAmount}`);
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.creditLedgerEntry.create({
      data: {
        userId: user.id,
        delta: amount,
        // Deliberately not "topup": that reason is reserved for real paid
        // top-ups so Phase 4 revenue reporting stays accurate. See
        // ARCHITECTURE.md Section 8.
        reason: "dev_grant",
      },
    });
    return tx.user.update({
      where: { id: user.id },
      data: { creditBalance: { increment: amount } },
    });
  });

  console.log(
    `Granted ${amount} credits to ${email}. New balance: ${updated.creditBalance}`,
  );
} finally {
  await prisma.$disconnect();
}
