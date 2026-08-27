import type {
  AuthUserInput,
  UserRecord,
  WelcomeGrantTransaction,
} from "./contracts.js";

export async function createUserWithWelcomeGrant(
  tx: WelcomeGrantTransaction,
  user: AuthUserInput,
  initialCredits: number,
): Promise<UserRecord> {
  if (user.email === null) {
    throw new Error("User email is required for the welcome grant");
  }

  const createdUser = await tx.user.create({
    data: {
      ...user,
      email: user.email,
      creditBalance: initialCredits,
    },
  });

  await tx.creditLedgerEntry.create({
    data: {
      userId: createdUser.id,
      delta: initialCredits,
      reason: "welcome_grant",
    },
  });

  return createdUser;
}
