import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const repository = "alams-innovative/bulkimg-studio";
const uploadSecret = Bun.argv.includes("--upload-secret");
const keyDirectory = join(homedir(), ".bulkimg-studio-release-keys");
const privateKeyPath = join(keyDirectory, "bulkimg-update-private.pem");
const publicKeyPath = join(keyDirectory, "bulkimg-update-public.pem");

function ok(message: string): void {
  console.log(`OK  ${message}`);
}

function fail(message: string): never {
  throw new Error(`FAILED  ${message}`);
}

mkdirSync(keyDirectory, { recursive: true });

if (!existsSync(privateKeyPath)) {
  const keys = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  writeFileSync(privateKeyPath, keys.privateKey, { mode: 0o600 });
  writeFileSync(publicKeyPath, keys.publicKey);
  ok(`Created a new Ed25519 signing key pair in ${keyDirectory}`);
} else {
  ok(`Using the existing private signing key in ${keyDirectory}`);
}

const privateKey = readFileSync(privateKeyPath, "utf8");
const derivedPublicKey = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
if (existsSync(publicKeyPath) && readFileSync(publicKeyPath, "utf8") !== derivedPublicKey) {
  fail(`The public key file does not match ${privateKeyPath}. Refusing to overwrite either key.`);
}
if (!existsSync(publicKeyPath)) writeFileSync(publicKeyPath, derivedPublicKey);
ok("The public and private keys match.");

if (!uploadSecret) {
  console.log("");
  console.log("Next: run this same command with --upload-secret to store the private key in GitHub Actions.");
  console.log("The private key is never printed, committed, or copied into the application.");
  process.exit(0);
}

if (!Bun.which("gh")) fail("GitHub CLI (gh) is not installed or is not on PATH.");
const auth = Bun.spawnSync(["gh", "auth", "status"], { stdout: "inherit", stderr: "inherit" });
if (auth.exitCode !== 0) fail("Sign in first with: gh auth login");

const upload = Bun.spawnSync([
  "gh", "secret", "set", "BULKIMG_UPDATE_SIGNING_PRIVATE_KEY",
  "--repo", repository,
  "--body", privateKey,
], { stdout: "inherit", stderr: "inherit" });
if (upload.exitCode !== 0) fail("GitHub did not accept the signing secret.");
ok(`GitHub Actions secret BULKIMG_UPDATE_SIGNING_PRIVATE_KEY is configured for ${repository}.`);
