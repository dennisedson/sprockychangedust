import type { RepositoryFile, RepositoryScanResult, ScanSignal } from "@/lib/scanner/types";

const sourcePatterns = [
  {
    label: "HubSpot API host",
    regex: /api\.hubapi\.com/i,
    severity: "red" as const,
  },
  {
    label: "HubSpot JavaScript client",
    regex: /(?:new\s+Hubspot|hubspotClient|@hubspot\/api-client|hubspot-api-client)/i,
    severity: "amber" as const,
  },
  {
    label: "HubSpot OAuth endpoint",
    regex: /app\.hubspot\.com\/oauth|oauth\/v\d+\/token/i,
    severity: "amber" as const,
  },
  {
    label: "HubSpot webhook handling",
    regex: /hubspot.*webhook|webhook.*hubspot/i,
    severity: "green" as const,
  },
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
    return scanPackageJson(file);
  }

  if (file.path.endsWith("requirements.txt")) {
    return scanRequirements(file);
  }

  if (file.path.endsWith("composer.json")) {
    return scanComposerJson(file);
  }

  if (file.path.endsWith("Gemfile")) {
    return scanGemfile(file);
  }

  if (/\.(js|jsx|ts|tsx|py|php|rb)$/.test(file.path)) {
    return scanSourcePatterns(file);
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

function scanSourcePatterns(file: RepositoryFile): ScanSignal[] {
  return sourcePatterns.flatMap((pattern) => {
    const match = file.content.match(pattern.regex);

    if (!match) {
      return [];
    }

    return [
      {
        filePath: file.path,
        kind: "source-pattern" as const,
        label: pattern.label,
        severity: pattern.severity,
        line: getLineNumber(file.content, match.index || 0),
        excerpt: extractExcerpt(file.content, match.index || 0),
      },
    ];
  });
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
