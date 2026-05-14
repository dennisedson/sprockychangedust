export type ScanSignal = {
  filePath: string;
  kind: "dependency" | "source-pattern";
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
