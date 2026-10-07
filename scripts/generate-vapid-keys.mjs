// Prints a VAPID key pair for web push. Run once, then add to Vercel:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY = the public key
//   VAPID_PRIVATE_KEY            = the private key (keep secret)
//   VAPID_SUBJECT                = mailto:you@yourdomain.com
//   PUSH_DISPATCH_SECRET         = the random secret printed below
//
//   node scripts/generate-vapid-keys.mjs
import crypto from "node:crypto";
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`PUSH_DISPATCH_SECRET=${crypto.randomBytes(24).toString("base64url")}`);
