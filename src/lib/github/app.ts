import { App } from "@octokit/app";
import { env, requireEnv } from "@/lib/env";

export function createGitHubApp() {
  return new App({
    appId: requireEnv("GITHUB_APP_ID"),
    privateKey: requireEnv("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n"),
    oauth: {
      clientId: requireEnv("GITHUB_APP_CLIENT_ID"),
      clientSecret: requireEnv("GITHUB_APP_CLIENT_SECRET"),
    },
  });
}

export function getGitHubInstallUrl() {
  return env.GITHUB_APP_INSTALL_URL || "https://github.com/apps";
}
