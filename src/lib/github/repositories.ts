import { createGitHubApp } from "@/lib/github/app";
import type { RepositoryFile } from "@/lib/scanner/types";

const candidatePaths = [
  "README.md",
  "README.mdx",
  "README",
  "hsproject.json",
  "hubspot.config.yml",
  "hubspot.config.yaml",
  ".hsignore",
  ".github/workflows",
  "package.json",
  "requirements.txt",
  "composer.json",
  "Gemfile",
  "docs",
  "documentation",
  "src",
  "src/app",
  "app",
  "pages",
  "lib",
  "api",
];

const scannableDirectoryFilePattern =
  /(?:^|\/)readme(?:\.[^.]+)?$|\.(js|jsx|ts|tsx|py|php|rb|md|mdx|html|hubl|json|yml|yaml)$/i;
const scannableDirectoryPattern =
  /(?:^|\/)(app|api|components|docs|documentation|functions|lib|pages|routes|src|webhooks)$|\.functions$/i;

type InstallationOctokit = Awaited<ReturnType<ReturnType<typeof createGitHubApp>["getInstallationOctokit"]>>;
type GitHubContentItem = {
  type: string;
  path: string;
  content?: string;
};

export type GitHubInstallationRepository = {
  id: number;
  full_name: string;
  private: boolean;
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

export async function listInstallationRepositories(
  installationId: number,
): Promise<GitHubInstallationRepository[]> {
  const octokit = await getInstallationOctokit(installationId);
  const repositories: GitHubInstallationRepository[] = [];
  let page = 1;

  while (page < 11) {
    const response = await octokit.request("GET /installation/repositories", {
      per_page: 100,
      page,
    });
    const pageRepositories = response.data.repositories.map((repository) => ({
      id: repository.id,
      full_name: repository.full_name,
      private: repository.private,
    }));

    repositories.push(...pageRepositories);

    if (pageRepositories.length < 100) {
      break;
    }

    page += 1;
  }

  return repositories;
}

async function fetchPath(
  octokit: InstallationOctokit,
  owner: string,
  repo: string,
  path: string,
  maxSourceFiles: number,
  depth = 0,
): Promise<RepositoryFile[]> {
  try {
    const response = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path,
    });
    const data = response.data as GitHubContentItem | GitHubContentItem[];

    if (Array.isArray(data)) {
      const sourceFiles = data.filter(
        (item) => item.type === "file" && scannableDirectoryFilePattern.test(item.path),
      );
      const files: RepositoryFile[] = [];

      for (const item of sourceFiles.slice(0, maxSourceFiles)) {
        files.push(...(await fetchPath(octokit, owner, repo, item.path, 1, depth)));
      }

      if (depth < 2 && files.length < maxSourceFiles) {
        const directories = data.filter(
          (item) => item.type === "dir" && scannableDirectoryPattern.test(item.path),
        );

        for (const item of directories) {
          if (files.length >= maxSourceFiles) {
            break;
          }

          const remainingFileCount = maxSourceFiles - files.length;
          files.push(
            ...(await fetchPath(octokit, owner, repo, item.path, remainingFileCount, depth + 1)),
          );
        }
      }

      return files;
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
