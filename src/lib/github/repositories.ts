import { createGitHubApp } from "@/lib/github/app";
import type { RepositoryFile } from "@/lib/scanner/types";

const candidatePaths = [
  "package.json",
  "requirements.txt",
  "composer.json",
  "Gemfile",
  "src",
  "app",
  "pages",
  "lib",
  "api",
];

const sourceFilePattern = /\.(js|jsx|ts|tsx|py|php|rb)$/;

type InstallationOctokit = Awaited<ReturnType<ReturnType<typeof createGitHubApp>["getInstallationOctokit"]>>;
type GitHubContentItem = {
  type: string;
  path: string;
  content?: string;
};

export async function getInstallationOctokit(installationId: number) {
  const app = createGitHubApp();
  return app.getInstallationOctokit(installationId);
}

export async function fetchRepositoryScanFiles(input: {
  installationId: number;
  owner: string;
  repo: string;
  maxSourceFiles?: number;
}): Promise<RepositoryFile[]> {
  const octokit = await getInstallationOctokit(input.installationId);
  const files: RepositoryFile[] = [];
  const maxSourceFiles = input.maxSourceFiles ?? 35;

  for (const path of candidatePaths) {
    const content = await fetchPath(octokit, input.owner, input.repo, path, maxSourceFiles);
    files.push(...content);
  }

  const unique = new Map(files.map((file) => [file.path, file]));
  return Array.from(unique.values());
}

async function fetchPath(
  octokit: InstallationOctokit,
  owner: string,
  repo: string,
  path: string,
  maxSourceFiles: number,
): Promise<RepositoryFile[]> {
  try {
    const response = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path,
    });
    const data = response.data as GitHubContentItem | GitHubContentItem[];

    if (Array.isArray(data)) {
      const sourceFiles = data.filter((item) => item.type === "file" && sourceFilePattern.test(item.path));
      const files = await Promise.all(
        sourceFiles
          .slice(0, maxSourceFiles)
          .map((item) => fetchPath(octokit, owner, repo, item.path, 1)),
      );

      return files.flat();
    }

    if (data.type !== "file" || !data.content) {
      return [];
    }

    const content = Buffer.from(data.content, "base64").toString("utf8");

    return [{ path: data.path, content }];
  } catch {
    return [];
  }
}

export async function createRepositoryIssue(input: {
  installationId: number;
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels?: string[];
}) {
  const octokit = await getInstallationOctokit(input.installationId);

  return octokit.request("POST /repos/{owner}/{repo}/issues", {
    owner: input.owner,
    repo: input.repo,
    title: input.title,
    body: input.body,
    labels: input.labels,
  });
}
