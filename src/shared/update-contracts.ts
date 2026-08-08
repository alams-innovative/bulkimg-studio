export type UpdateChannel = "stable" | "beta";

export type UpdateManifest = {
  version: string;
  tag: string;
  channel: UpdateChannel;
  publishedAt: string;
  releaseNotesUrl: string;
  zipUrl: string;
  zipSha256: string;
  zipBytes: number;
  minimumSupportedVersion: string;
  architectures: Array<"x64" | "arm64">;
  schemaVersion: number;
};

export type UpdateRelease = Pick<UpdateManifest, "version" | "tag" | "channel" | "publishedAt" | "releaseNotesUrl" | "minimumSupportedVersion" | "architectures" | "schemaVersion"> & {
  available: boolean;
  unavailableReason: string | null;
  isCurrent: boolean;
};

export type UpdateActivity = "idle" | "checking" | "downloading" | "ready" | "installing" | "error";

export type UpdateState = {
  configured: boolean;
  currentVersion: string;
  channel: UpdateChannel;
  lastCheckedAt: string | null;
  lastError: string | null;
  activity: UpdateActivity;
  progress: { receivedBytes: number; totalBytes: number | null } | null;
  available: UpdateRelease | null;
  releases: UpdateRelease[];
  downloadedVersion: string | null;
  fallbackStableVersions: string[];
};

export type UpdateConfig = {
  repository: "alams-innovative/bulkimg-studio";
  publicKeyPem: string;
};
