export type ScanSignal = {
  filePath: string;
  kind:
    | "api"
    | "auth"
    | "cms"
    | "dependency"
    | "documentation"
    | "project-config"
    | "serverless"
    | "source-pattern"
    | "webhook";
  label: string;
  severity: "red" | "amber" | "green";
  line?: number;
  excerpt?: string;
};

export type RepositoryManifestEvidence = {
  kind:
    | "api_path"
    | "file_marker"
    | "function_call"
    | "package"
    | "platform_version"
    | "scope";
  value: string;
  filePath: string;
  line?: number;
};

export type RepositoryManifest = {
  platformVersions: string[];
  apiPaths: string[];
  apiVersionSegments: string[];
  sdkPackages: string[];
  sdkSymbols: string[];
  scopes: string[];
  fileMarkers: string[];
  productAreas: string[];
  evidence: RepositoryManifestEvidence[];
};

export type RepositoryFile = {
  path: string;
  content: string;
};

export type RepositoryScanResult = {
  hasHubSpotUsage: boolean;
  signals: ScanSignal[];
  manifest: RepositoryManifest;
};
