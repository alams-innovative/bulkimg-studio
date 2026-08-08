import { createPublicKey } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const repository = "alams-innovative/bulkimg-studio";
const keyDirectory = join(homedir(), ".bulkimg-studio-release-keys");
const privateKeyPath = join(keyDirectory, "bulkimg-update-private.pem");
const publicKeyPath = join(keyDirectory, "bulkimg-update-public.pem");

function fail(message: string): never {
  throw new Error(`FAILED  ${message}`);
}

if (!existsSync(privateKeyPath) || !existsSync(publicKeyPath)) {
  fail("Signing keys are missing. Run: bun run update:signing:setup");
}

const privateKey = readFileSync(privateKeyPath, "utf8");
const derivedPublicKey = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
if (derivedPublicKey !== readFileSync(publicKeyPath, "utf8")) {
  fail("The public key does not match the private key. Do not release until this is resolved.");
}
console.log("OK  Local Ed25519 key pair matches.");
console.log(`OK  Private key remains outside the repository: ${keyDirectory}`);

if (!Bun.which("gh")) fail("GitHub CLI (gh) is not installed or is not on PATH.");
const secrets = Bun.spawnSync(["gh", "secret", "list", "--repo", repository], { stdout: "pipe", stderr: "pipe" });
if (secrets.exitCode !== 0) fail("Could not list GitHub repository secrets. Run: gh auth login");
if (!new TextDecoder().decode(secrets.stdout).split(/\r?\n/).some((line) => line.startsWith("BULKIMG_UPDATE_SIGNING_PRIVATE_KEY\t"))) {
  fail("GitHub secret BULKIMG_UPDATE_SIGNING_PRIVATE_KEY was not found. Run: bun run update:signing:setup --upload-secret");
}
console.log(`OK  GitHub Actions signing secret exists for ${repository}.`);
console.log("READY  Release workflow can sign manifests. The secret value was not read or displayed.");
