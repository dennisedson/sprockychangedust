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

export type RepositoryFile = {
  path: string;
  content: string;
};

export type RepositoryScanResult = {
  hasHubSpotUsage: boolean;
  signals: ScanSignal[];
};
