/**
 * One-time migration: flag users whose stored password is plaintext.
 *
 * Background: before bcrypt hashing was introduced, the /api/auth/register
 * endpoint persisted raw passwords directly to MongoDB. This script finds
 * every user document whose password field does not start with a bcrypt prefix
 * ($2b$ or $2a$) and marks requiresPasswordReset = true so that the next login
 * attempt redirects them through the password-reset flow instead of attempting
 * a bcrypt.compare against a plaintext string.
 *
 * The plaintext password is NOT read, logged, or transmitted — the script only
 * checks whether the stored value looks like a bcrypt hash.
 *
 * Usage:
 *   MONGODB_URI=<uri> node backend/scripts/migratePasswords.js
 *
 * Run once after deploying the bcrypt fix. Safe to re-run (idempotent).
 */

import mongoose from 'mongoose';
import 'dotenv/config';

const BCRYPT_PREFIX_PATTERN = /^\$2[ab]\$/;

const userSchema = new mongoose.Schema(
  {
    email: String,
    password: { type: String, select: false },
    requiresPasswordReset: { type: Boolean, default: false },
  },
  { strict: false }
);

const User = mongoose.model('User', userSchema);

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI environment variable is not set.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  // Fetch only users that have a non-null password field stored.
  // The select('+password') is required because the field has select:false in the main model.
  const usersWithPasswords = await User.find({
    password: { $exists: true, $ne: null, $type: 'string' },
    requiresPasswordReset: { $ne: true },
  }).select('+password email requiresPasswordReset');

  console.log(`Found ${usersWithPasswords.length} user(s) with a stored password field.`);

  let flagged = 0;
  let alreadyHashed = 0;
  let skipped = 0;

  for (const user of usersWithPasswords) {
    if (!user.password) {
      skipped++;
      continue;
    }

    if (BCRYPT_PREFIX_PATTERN.test(user.password)) {
      alreadyHashed++;
      continue;
    }

    // Password does not look like a bcrypt hash — treat it as plaintext.
    // Set the reset flag; do NOT log or touch the raw password value.
    await User.updateOne(
      { _id: user._id },
      { $set: { requiresPasswordReset: true } }
    );

    // Redact the email in logs to avoid exposing PII in CI/CD output.
    const [local, domain] = (user.email || '').split('@');
    const redacted = local
      ? `${local.slice(0, 2)}***@${domain}`
      : '(no email)';
    console.log(`  Flagged: ${redacted}`);
    flagged++;
  }

  console.log('\n── Migration summary ──────────────────────────────────');
  console.log(`  Already hashed  : ${alreadyHashed}`);
  console.log(`  Flagged for reset: ${flagged}`);
  console.log(`  Skipped (null pw): ${skipped}`);
  console.log('───────────────────────────────────────────────────────');

  if (flagged > 0) {
    console.log(
      `\n${flagged} account(s) have been flagged. Those users will be prompted to reset their\n` +
        'password on their next login attempt. No passwords were read or transmitted.'
    );
  } else {
    console.log('\nNo plaintext passwords found. Nothing to migrate.');
  }

  await mongoose.disconnect();
  console.log('Disconnected. Done.');
};

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
