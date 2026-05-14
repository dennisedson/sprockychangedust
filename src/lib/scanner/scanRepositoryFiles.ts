import type { RepositoryFile, RepositoryScanResult, ScanSignal } from "@/lib/scanner/types";

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

  return {
    hasHubSpotUsage: signals.length > 0,
    signals,
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
