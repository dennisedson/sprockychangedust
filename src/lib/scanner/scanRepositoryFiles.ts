// @workflow_state: REVIEW
import type {
  RepositoryFile,
  RepositoryManifest,
  RepositoryManifestEvidence,
  RepositoryScanResult,
  ScanSignal,
} from "@/lib/scanner/types";

type ScanPattern = {
  kind: ScanSignal["kind"];
  label: string;
  regex: RegExp;
  severity: ScanSignal["severity"];
};

const implementationPatterns: ScanPattern[] = [
  {
    kind: "api",
    label: "HubSpot API host",
    regex: /api\.hubapi\.com/i,
    severity: "red" as const,
  },
  {
    kind: "api",
    label: "HubSpot CRM API route",
    regex: /\/crm\/v\d+\/(?:objects|schemas|associations|imports|pipelines|properties)\b/i,
    severity: "red" as const,
  },
  {
    kind: "api",
    label: "HubSpot CMS API route",
    regex: /\/cms\/v\d+\/(?:blogs|domains|files|hubdb|pages|source-code)\b/i,
    severity: "amber" as const,
  },
  {
    kind: "source-pattern",
    label: "HubSpot JavaScript client",
    regex: /(?:new\s+Hubspot|hubspotClient|@hubspot\/api-client|hubspot-api-client)/i,
    severity: "red" as const,
  },
  {
    kind: "auth",
    label: "HubSpot OAuth authorization URL",
    regex: /app\.hubspot\.com\/oauth\/(?:\d+\/)?authorize/i,
    severity: "red" as const,
  },
  {
    kind: "auth",
    label: "HubSpot OAuth token exchange",
    regex: /\/oauth\/(?:v\d+|2026-03)\/token/i,
    severity: "red" as const,
  },
  {
    kind: "auth",
    label: "HubSpot OAuth token metadata endpoint",
    regex: /\/oauth\/(?:v\d+|2026-03)\/(?:access-tokens|refresh-tokens)(?:\/|\b)/i,
    severity: "red" as const,
  },
  {
    kind: "auth",
    label: "HubSpot OAuth app credentials or grant flow",
    regex:
      /HUBSPOT_(?:CLIENT_ID|CLIENT_SECRET|REDIRECT_URI|REFRESH_TOKEN)|grant_type\s*[:=]\s*["']?(?:authorization_code|refresh_token|client_credentials)|\b(?:client_id|client_secret|refresh_token|access_token)\b/i,
    severity: "red" as const,
  },
  {
    kind: "auth",
    label: "HubSpot private app access token usage",
    regex:
      /PRIVATE_APP_ACCESS_TOKEN|new\s+hubspot\.Client\s*\(\s*{[^}]*accessToken|accessToken\s*:\s*(?:process\.env|[A-Z_]*HUBSPOT|YOUR_ACCESS_TOKEN)/i,
    severity: "red" as const,
  },
  {
    kind: "webhook",
    label: "HubSpot webhook handling",
    regex: /hubspot.*webhook|webhook.*hubspot|x-hubspot-signature/i,
    severity: "amber" as const,
  },
  {
    kind: "webhook",
    label: "HubSpot webhook subscription config",
    regex: /"type"\s*:\s*"webhooks"|subscriptionType|legacyCrmObjects|hubEvents|targetUrl/i,
    severity: "amber" as const,
  },
  {
    kind: "project-config",
    label: "HubSpot developer project config",
    regex:
      /"type"\s*:\s*"app"|"distribution"\s*:\s*"(?:marketplace|private)"|"permittedUrls"|"requiredScopes"|"optionalScopes"|"platformVersion"/i,
    severity: "amber" as const,
  },
  {
    kind: "project-config",
    label: "HubSpot CLI deployment workflow",
    regex:
      /\bhs\s+(project\s+(?:upload|deploy|logs)|upload|watch|fetch|init)\b|hubspot-cms-deploy-action/i,
    severity: "amber" as const,
  },
  {
    kind: "serverless",
    label: "HubSpot serverless function",
    regex: /exports\.main\s*=\s*async\s*context|serverless\.json|\.functions\b/i,
    severity: "amber" as const,
  },
  {
    kind: "cms",
    label: "HubL template syntax",
    regex:
      /{%\s*(?:module|include|extends|block|set|for|if)\b|{{\s*(?:standard_header_includes|standard_footer_includes)|@hubspot\//i,
    severity: "amber" as const,
  },
  {
    kind: "cms",
    label: "HubDB or CRM data in CMS",
    regex: /hubdb_table(?:_rows)?\s*\(|crm_objects?\s*\(/i,
    severity: "amber" as const,
  },
];

const documentationPatterns: ScanPattern[] = [
  {
    kind: "documentation",
    label: "HubSpot mention in documentation",
    regex: /\bhubspot\b/i,
    severity: "green" as const,
  },
  ...implementationPatterns,
];

export function scanRepositoryFiles(files: RepositoryFile[]): RepositoryScanResult {
  const signals = files.flatMap((file) => scanFile(file));
  const manifest = buildRepositoryManifest(files, signals);

  return {
    hasHubSpotUsage: signals.length > 0,
    signals,
    manifest,
  };
}

function scanFile(file: RepositoryFile): ScanSignal[] {
  if (file.path.endsWith("package.json")) {
    return [...scanPackageJson(file), ...scanImplementationPatterns(file)];
  }

  if (file.path.endsWith("requirements.txt")) {
    return [...scanRequirements(file), ...scanImplementationPatterns(file)];
  }

  if (file.path.endsWith("composer.json")) {
    return [...scanComposerJson(file), ...scanImplementationPatterns(file)];
  }

  if (file.path.endsWith("Gemfile")) {
    return [...scanGemfile(file), ...scanImplementationPatterns(file)];
  }

  if (isImplementationFile(file.path)) {
    return scanImplementationPatterns(file);
  }

  if (isDocumentationFile(file.path)) {
    return scanDocumentationPatterns(file);
  }

  return [];
}

function scanPackageJson(file: RepositoryFile): ScanSignal[] {
  try {
    const parsed = JSON.parse(file.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = {
      ...parsed.dependencies,
      ...parsed.devDependencies,
    };

    return Object.keys(dependencies)
      .filter((name) => name === "@hubspot/api-client" || name.includes("hubspot"))
      .map((name) => ({
        filePath: file.path,
        kind: "dependency" as const,
        label: `Detected npm package ${name}`,
        severity: "red" as const,
        line: findLineNumber(file.content, name),
      }));
  } catch {
    return [];
  }
}

function scanRequirements(file: RepositoryFile): ScanSignal[] {
  return file.content
    .split("\n")
    .flatMap((line, index) =>
      /hubspot-api-client|hubspot/i.test(line)
        ? [
            {
              filePath: file.path,
              kind: "dependency" as const,
              label: "Detected Python HubSpot dependency",
              severity: "red" as const,
              line: index + 1,
              excerpt: line.trim(),
            },
          ]
        : [],
    );
}

function scanComposerJson(file: RepositoryFile): ScanSignal[] {
  try {
    const parsed = JSON.parse(file.content) as {
      require?: Record<string, string>;
      "require-dev"?: Record<string, string>;
    };
    const dependencies = {
      ...parsed.require,
      ...parsed["require-dev"],
    };

    return Object.keys(dependencies)
      .filter((name) => name === "hubspot/api-client" || name.includes("hubspot"))
      .map((name) => ({
        filePath: file.path,
        kind: "dependency" as const,
        label: `Detected Composer package ${name}`,
        severity: "red" as const,
        line: findLineNumber(file.content, name),
      }));
  } catch {
    return [];
  }
}

function scanGemfile(file: RepositoryFile): ScanSignal[] {
  return file.content
    .split("\n")
    .flatMap((line, index) =>
      /hubspot-api-client|hubspot/i.test(line)
        ? [
            {
              filePath: file.path,
              kind: "dependency" as const,
              label: "Detected Ruby HubSpot dependency",
              severity: "red" as const,
              line: index + 1,
              excerpt: line.trim(),
            },
          ]
        : [],
    );
}

function scanImplementationPatterns(file: RepositoryFile): ScanSignal[] {
  return scanPatterns(file, implementationPatterns);
}

function scanDocumentationPatterns(file: RepositoryFile): ScanSignal[] {
  return scanPatterns(file, documentationPatterns);
}

function scanPatterns(file: RepositoryFile, patterns: ScanPattern[]): ScanSignal[] {
  return patterns.flatMap((pattern) => {
    const match = file.content.match(pattern.regex);

    if (!match) {
      return [];
    }

    return [
      {
        filePath: file.path,
        kind: pattern.kind,
        label: pattern.label,
        severity: pattern.severity,
        line: getLineNumber(file.content, match.index || 0),
        excerpt: extractExcerpt(file.content, match.index || 0),
      },
    ];
  });
}

function isImplementationFile(path: string) {
  return /\.(js|jsx|ts|tsx|py|php|rb|html|hubl|json|yml|yaml)$/i.test(path);
}

function isDocumentationFile(path: string) {
  return /(?:^|\/)readme(?:\.[^.]+)?$|\.(md|mdx)$/i.test(path);
}

function findLineNumber(content: string, searchValue: string) {
  const lineIndex = content
    .split("\n")
    .findIndex((line) => line.toLowerCase().includes(searchValue.toLowerCase()));

  return lineIndex === -1 ? undefined : lineIndex + 1;
}

function getLineNumber(content: string, index: number) {
  return content.slice(0, index).split("\n").length;
}

function extractExcerpt(content: string, index: number) {
  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + 120);

  return content.slice(start, end).replace(/\s+/g, " ").trim();
}

function buildRepositoryManifest(
  files: RepositoryFile[],
  signals: ScanSignal[],
): RepositoryManifest {
  const evidence: RepositoryManifestEvidence[] = [];
  const platformVersions = new Set<string>();
  const apiPaths = new Set<string>();
  const apiVersionSegments = new Set<string>();
  const sdkPackages = new Set<string>();
  const sdkSymbols = new Set<string>();
  const scopes = new Set<string>();
  const fileMarkers = new Set<string>();
  const productAreas = new Set<string>();

  for (const file of files) {
    collectFileMarkers(file, fileMarkers, evidence);
    collectPlatformVersions(file, platformVersions, evidence);
    collectApiPaths(file, apiPaths, apiVersionSegments, productAreas, evidence);
    collectSdkPackages(file, sdkPackages, productAreas, evidence);
    collectSdkSymbols(file, sdkSymbols, productAreas, evidence);
    collectScopes(file, scopes, productAreas, evidence);
  }

  for (const signal of signals) {
    collectProductAreaFromText(signal.kind, productAreas);
    collectProductAreaFromText(signal.label, productAreas);
    collectProductAreaFromText(signal.excerpt || "", productAreas);
  }

  return {
    platformVersions: sortUnique(platformVersions),
    apiPaths: sortUnique(apiPaths),
    apiVersionSegments: sortUnique(apiVersionSegments),
    sdkPackages: sortUnique(sdkPackages),
    sdkSymbols: sortUnique(sdkSymbols),
    scopes: sortUnique(scopes),
    fileMarkers: sortUnique(fileMarkers),
    productAreas: sortUnique(productAreas),
    evidence: dedupeEvidence(evidence),
  };
}

function collectFileMarkers(
  file: RepositoryFile,
  fileMarkers: Set<string>,
  evidence: RepositoryManifestEvidence[],
) {
  const markerPatterns = [
    /(?:^|\/)hsproject\.json$/i,
    /(?:^|\/)serverless\.json$/i,
    /(?:^|\/)[^/]+-hsmeta\.json$/i,
    /(?:^|\/)app-hsmeta\.json$/i,
    /(?:^|\/)hubspot\.config\.ya?ml$/i,
    /(?:^|\/)\.hsignore$/i,
    /\.functions(?:\/|$)/i,
  ];

  if (!markerPatterns.some((pattern) => pattern.test(file.path))) {
    return;
  }

  fileMarkers.add(file.path);
  evidence.push({
    kind: "file_marker",
    value: file.path,
    filePath: file.path,
  });
}

function collectPlatformVersions(
  file: RepositoryFile,
  platformVersions: Set<string>,
  evidence: RepositoryManifestEvidence[],
) {
  for (const match of file.content.matchAll(/"platformVersion"\s*:\s*"([^"]+)"/gi)) {
    const version = match[1];

    if (!version) {
      continue;
    }

    platformVersions.add(version);
    evidence.push({
      kind: "platform_version",
      value: version,
      filePath: file.path,
      line: getLineNumber(file.content, match.index || 0),
    });
  }
}

function collectApiPaths(
  file: RepositoryFile,
  apiPaths: Set<string>,
  apiVersionSegments: Set<string>,
  productAreas: Set<string>,
  evidence: RepositoryManifestEvidence[],
) {
  const apiPathPattern =
    /\/(?:crm|cms|oauth|automation|marketing|forms|files|events|webhooks|conversations|communication-preferences)\/(?:v\d+|\d{4}-\d{2}(?:-beta)?)(?:\/[^\s"'`<>)\]}]*)?/gi;

  for (const match of file.content.matchAll(apiPathPattern)) {
    const path = trimTrailingPunctuation(match[0]);
    const versionMatch = path.match(/\/(v\d+|\d{4}-\d{2}(?:-beta)?)(?:\/|$)/i);

    apiPaths.add(path);

    if (versionMatch?.[1]) {
      apiVersionSegments.add(versionMatch[1]);
    }

    collectProductAreaFromText(path, productAreas);
    evidence.push({
      kind: "api_path",
      value: path,
      filePath: file.path,
      line: getLineNumber(file.content, match.index || 0),
    });
  }
}

function collectSdkPackages(
  file: RepositoryFile,
  sdkPackages: Set<string>,
  productAreas: Set<string>,
  evidence: RepositoryManifestEvidence[],
) {
  if (!/(?:^|\/)(package|composer)\.json$|requirements\.txt$|Gemfile$/i.test(file.path)) {
    return;
  }

  for (const match of file.content.matchAll(/@hubspot\/api-client|hubspot-api-client|hubspot\/api-client/gi)) {
    sdkPackages.add(match[0]);
    collectProductAreaFromText(match[0], productAreas);
    evidence.push({
      kind: "package",
      value: match[0],
      filePath: file.path,
      line: getLineNumber(file.content, match.index || 0),
    });
  }
}

function collectSdkSymbols(
  file: RepositoryFile,
  sdkSymbols: Set<string>,
  productAreas: Set<string>,
  evidence: RepositoryManifestEvidence[],
) {
  const symbolPattern =
    /\b(?:hubspotClient|hubspot)\.(?:crm|cms|oauth|automation|marketing|files|settings|webhooks)(?:\.[A-Za-z0-9_]+){0,5}/g;

  for (const match of file.content.matchAll(symbolPattern)) {
    sdkSymbols.add(match[0]);
    collectProductAreaFromText(match[0], productAreas);
    evidence.push({
      kind: "function_call",
      value: match[0],
      filePath: file.path,
      line: getLineNumber(file.content, match.index || 0),
    });
  }
}

function collectScopes(
  file: RepositoryFile,
  scopes: Set<string>,
  productAreas: Set<string>,
  evidence: RepositoryManifestEvidence[],
) {
  const scopePattern =
    /\b(?:crm|cms|oauth|settings|timeline|automation|forms|files|tickets|contacts|companies|deals)\.[a-z0-9_.:-]+(?:\.[a-z]+)?\b/gi;

  for (const match of file.content.matchAll(scopePattern)) {
    const scope = trimTrailingPunctuation(match[0]);

    scopes.add(scope);
    collectProductAreaFromText(scope, productAreas);
    evidence.push({
      kind: "scope",
      value: scope,
      filePath: file.path,
      line: getLineNumber(file.content, match.index || 0),
    });
  }
}

function collectProductAreaFromText(text: string, productAreas: Set<string>) {
  const lowerText = text.toLowerCase();
  const mappings = [
    ["crm", /\bcrm\b|contacts?|companies|deals|tickets|owners|associations|objects|properties/],
    ["cms", /\bcms\b|hubl|hubdb|blog|page|theme|module|source-code/],
    ["oauth", /\boauth\b|authorization|access[-_\s]?token|refresh[-_\s]?token|scope/],
    ["webhooks", /webhook|subscription|x-hubspot-signature/],
    ["forms", /\bforms?\b/],
    ["serverless", /serverless|\.functions|exports\.main/],
    ["developer-platform", /platformversion|hsproject|hsmeta|hubspot\.config|project config/],
  ] as const;

  for (const [area, pattern] of mappings) {
    if (pattern.test(lowerText)) {
      productAreas.add(area);
    }
  }
}

function sortUnique(values: Set<string>) {
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function dedupeEvidence(evidence: RepositoryManifestEvidence[]) {
  const seen = new Set<string>();

  return evidence.filter((item) => {
    const key = `${item.kind}:${item.value}:${item.filePath}:${item.line || ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function trimTrailingPunctuation(value: string) {
  return value.replace(/[.,;:]+$/g, "");
}
