import { defineConfig } from 'astro/config';

const repository = process.env.GITHUB_REPOSITORY ?? '';
const [owner = 'your-github-name', repo = 'your-repository'] = repository.split('/');
const isUserSite = repo.endsWith('.github.io');
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const base = process.env.PUBLIC_BASE_PATH ?? (isGitHubActions ? (isUserSite ? '/' : `/${repo}/`) : '/');
const site = process.env.PUBLIC_SITE_URL ?? (isGitHubActions ? `https://${owner}.github.io` : 'http://localhost:4321');

export default defineConfig({
  site,
  base,
  markdown: {
    shikiConfig: {
      theme: 'github-dark'
    }
  }
});
