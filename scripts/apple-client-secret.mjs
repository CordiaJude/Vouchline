// Generates the "Secret Key (for OAuth)" for Sign in with Apple in
// Supabase (Authentication -> Providers -> Apple). Runs entirely on your
// machine; the .p8 private key never leaves it.
//
//   node scripts/apple-client-secret.mjs \
//     --team TEAMID1234 --key KEYID12345 --client com.vouchline.web --p8 ~/Downloads/AuthKey_KEYID12345.p8
//
// Apple caps these at 6 months, so the secret printed here expires in
// ~180 days: run this again and paste the new one before then.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, a, i, all) => (a.startsWith("--") ? [...pairs, [a.slice(2), all[i + 1]]] : pairs), []),
);
const { team, key, client, p8 } = args;
if (!team || !key || !client || !p8) {
  console.error("usage: node scripts/apple-client-secret.mjs --team <Team ID> --key <Key ID> --client <Services ID> --p8 <path to .p8>");
  process.exit(1);
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const expires = now + 180 * 24 * 60 * 60;

const header = b64url(JSON.stringify({ alg: "ES256", kid: key, typ: "JWT" }));
const payload = b64url(
  JSON.stringify({ iss: team, iat: now, exp: expires, aud: "https://appleid.apple.com", sub: client }),
);
const privateKey = fs.readFileSync(p8.replace(/^~/, os.homedir()), "utf8");
const signature = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), {
  key: privateKey,
  dsaEncoding: "ieee-p1363",
});

console.log(`${header}.${payload}.${b64url(signature)}`);
console.error(`\nExpires ${new Date(expires * 1000).toDateString()}. Set a reminder to regenerate it before then.`);
