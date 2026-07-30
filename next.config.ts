import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const githubPagesBasePath =
  process.env.GITHUB_PAGES_CUSTOM_DOMAIN === "true"
    ? ""
    : "/sbs-invoice-site";

const nextConfig: NextConfig = {
  ...(isGitHubPages
    ? {
        output: "export",
        basePath: githubPagesBasePath,
        assetPrefix: githubPagesBasePath,
        trailingSlash: true,
        typescript: {
          // Cloudflare-only helper files are not part of the static Pages app.
          ignoreBuildErrors: true,
        },
      }
    : {}),
};

export default nextConfig;
