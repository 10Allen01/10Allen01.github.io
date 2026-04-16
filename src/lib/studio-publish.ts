import { POST_EXCERPT_MAX_LEN, POST_EXCERPT_MIN_LEN } from './post-excerpt-limits';

type StudioInitOptions = {
  starterBody: string;
};

type RepoConfig = {
  owner: string;
  repo: string;
  branch: string;
  token: string;
};

type RepoFile = {
  path: string;
  content: string;
  encoding: 'utf-8' | 'base64';
};

type ExistingStudioPost = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  section: string;
  draft: boolean;
  featured: boolean;
  markdownPath: string;
  localAssetPaths: string[];
};

type DeletePlan = {
  slug: string;
  markdownPath: string;
  autoDeletePaths: string[];
  folderAssetPaths: string[];
  linkedUniqueAssetPaths: string[];
  sharedLinkedAssetPaths: string[];
  missingLinkedAssetPaths: string[];
};

type GithubContentItem = {
  type: 'file' | 'dir';
  name: string;
  path: string;
  sha: string;
  content?: string;
  encoding?: string;
};

type PublishImageEntry = {
  src: string;
  alt: string;
};

const SECTION_LABELS: Record<string, string> = {
  ai: 'AI',
  security: 'Cyber Security',
  programming: 'Programming',
  daily: 'Daily',
  tools: 'Tools'
};

const VALID_SECTION_KEYS = new Set(Object.keys(SECTION_LABELS));
const IMAGE_PATH_RE = /\.(avif|bmp|gif|ico|jpe?g|png|svg|tiff|webp)$/i;

const STORAGE_KEYS = {
  owner: 'allen.studio.repo.owner',
  repo: 'allen.studio.repo.name',
  branch: 'allen.studio.repo.branch',
  token: 'allen.studio.repo.token'
} as const;

const today = new Date().toISOString().slice(0, 10);

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const yamlString = (value: string) => JSON.stringify(value || '');

const slugify = (value: string) => {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled-post';
};

const toBase64 = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
};

const encodePathSegments = (value: string) => value.split('/').map((segment) => encodeURIComponent(segment)).join('/');

const decodeBase64 = (value: string) => atob(value.replace(/\s+/g, ''));

const stripYamlValue = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (typeof parsed === 'string') {
      return parsed;
    }

    if (typeof parsed === 'number' || typeof parsed === 'boolean') {
      return String(parsed);
    }

    return trimmed;
  } catch {
    return trimmed.replace(/^['"]|['"]$/g, '');
  }
};

const readFrontmatterValue = (frontmatter: string, key: string) => {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match ? stripYamlValue(match[1]) : '';
};

const readFrontmatterBoolean = (frontmatter: string, key: string) => {
  const value = readFrontmatterValue(frontmatter, key).toLowerCase();
  return value === 'true';
};

const dedupeStrings = (values: string[]) => {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
};

const normalizeLocalAssetPath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const unquoted = trimmed.replace(/^['"]|['"]$/g, '');
  const unwrapped = unquoted.startsWith('<') && unquoted.endsWith('>') ? unquoted.slice(1, -1) : unquoted;
  const cleaned = unwrapped.split('#')[0]?.split('?')[0]?.trim() || '';

  if (!cleaned || /^(https?:|data:|mailto:|tel:)/i.test(cleaned)) {
    return '';
  }

  let repoPath = '';

  if (cleaned.startsWith('public/')) {
    repoPath = cleaned;
  } else if (cleaned.startsWith('/')) {
    repoPath = `public${cleaned}`;
  } else if (cleaned.startsWith('images/')) {
    repoPath = `public/${cleaned}`;
  }

  return IMAGE_PATH_RE.test(repoPath) ? repoPath : '';
};

const readFrontmatterImagePaths = (frontmatter: string) => {
  const lines = frontmatter.split(/\r?\n/);
  const paths: string[] = [];
  let inImagesBlock = false;

  for (const line of lines) {
    if (!inImagesBlock) {
      if (/^images:\s*(?:\[\])?\s*$/.test(line)) {
        inImagesBlock = /^images:\s*$/.test(line);
      }
      continue;
    }

    if (/^[^\s]/.test(line)) {
      break;
    }

    const match = line.match(/^\s*[-]?\s*src:\s*(.+)$/);
    if (match?.[1]) {
      paths.push(match[1]);
    }
  }

  return paths;
};

const readMarkdownImagePaths = (markdownBody: string) => {
  const paths: string[] = [];
  const markdownImageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = markdownImageRegex.exec(markdownBody)) !== null) {
    paths.push(match[1]);
  }

  while ((match = htmlImageRegex.exec(markdownBody)) !== null) {
    paths.push(match[1]);
  }

  return paths;
};

const parseStoredPostMarkdown = (path: string, markdown: string): ExistingStudioPost | null => {
  const slug = path.split('/').pop()?.replace(/\.md$/i, '') || 'untitled-post';
  const frontmatterMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) {
    return null;
  }

  const frontmatter = frontmatterMatch[1] ?? '';
  const title = readFrontmatterValue(frontmatter, 'title').trim();
  const excerpt = readFrontmatterValue(frontmatter, 'excerpt');
  const publishedAt = readFrontmatterValue(frontmatter, 'publishedAt').trim();
  const section = readFrontmatterValue(frontmatter, 'section').trim();

  if (!title || !publishedAt || !VALID_SECTION_KEYS.has(section)) {
    return null;
  }

  const parsedDate = new Date(publishedAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  const body = markdown.slice(frontmatterMatch[0].length);
  const localAssetPaths = dedupeStrings([
    normalizeLocalAssetPath(readFrontmatterValue(frontmatter, 'cover')),
    ...readFrontmatterImagePaths(frontmatter).map(normalizeLocalAssetPath),
    ...readMarkdownImagePaths(body).map(normalizeLocalAssetPath)
  ]);

  return {
    slug,
    title,
    excerpt,
    publishedAt,
    section,
    draft: readFrontmatterBoolean(frontmatter, 'draft'),
    featured: readFrontmatterBoolean(frontmatter, 'featured'),
    markdownPath: path,
    localAssetPaths
  };
};

const renderPreviewBody = (markdown: string) => {
  return markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((block) => {
      if (block.startsWith('### ')) {
        return `<h4>${escapeHtml(block.slice(4))}</h4>`;
      }

      if (block.startsWith('## ')) {
        return `<h3>${escapeHtml(block.slice(3))}</h3>`;
      }

      if (block.startsWith('# ')) {
        return `<h3>${escapeHtml(block.slice(2))}</h3>`;
      }

      if (block === '{{images}}') {
        return '<p>[Uploaded images will be inserted here after publishing]</p>';
      }

      return `<p>${escapeHtml(block)}</p>`;
    })
    .join('');
};

const parseTags = (raw: string) => {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff'
};

const getFileExtension = (file: Pick<File, 'name' | 'type'>) => {
  const match = file.name.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (match?.[1]) {
    return match[1];
  }

  return MIME_EXTENSION_MAP[file.type] || 'jpg';
};

const createImageMarkdown = (entries: PublishImageEntry[]) => {
  return entries.map((entry) => `![${entry.alt}](${entry.src})`).join('\n\n');
};

const buildMarkdown = (input: {
  title: string;
  excerpt: string;
  publishedAt: string;
  section: string;
  featured: boolean;
  draft: boolean;
  tags: string[];
  coverPath: string;
  coverAlt: string;
  location: string;
  body: string;
  imageEntries: PublishImageEntry[];
}) => {
  const imageMarkdown = createImageMarkdown(input.imageEntries);
  const mergedBody = imageMarkdown
    ? input.body.includes('{{images}}')
      ? input.body.replaceAll('{{images}}', imageMarkdown)
      : `${input.body}\n\n${imageMarkdown}`
    : input.body;

  const lines = [
    '---',
    `title: ${yamlString(input.title)}`,
    `excerpt: ${yamlString(input.excerpt)}`,
    `publishedAt: ${yamlString(input.publishedAt)}`,
    `section: ${yamlString(input.section)}`,
    `featured: ${input.featured ? 'true' : 'false'}`,
    `draft: ${input.draft ? 'true' : 'false'}`,
    'tags:'
  ];

  if (input.tags.length > 0) {
    input.tags.forEach((tag) => {
      lines.push(`  - ${yamlString(tag)}`);
    });
  } else {
    lines.push('  - "untagged"');
  }

  if (input.coverPath) {
    lines.push(`cover: ${yamlString(input.coverPath)}`);
    lines.push(`coverAlt: ${yamlString(input.coverAlt || input.title)}`);
  }

  if (input.location) {
    lines.push(`location: ${yamlString(input.location)}`);
  }

  if (input.imageEntries.length > 0) {
    lines.push('images:');
    input.imageEntries.forEach((entry) => {
      lines.push(`  - src: ${yamlString(entry.src)}`);
      lines.push(`    alt: ${yamlString(entry.alt)}`);
    });
  } else {
    lines.push('images: []');
  }

  lines.push('---', '', mergedBody);
  return lines.join('\n');
};

const parseGithubErrorMessage = async (response: Response) => {
  const rawMessage = await response.text();

  try {
    const parsed = JSON.parse(rawMessage) as { message?: string; errors?: Array<{ message?: string }> };
    const extra = parsed.errors?.map((item) => item.message).filter(Boolean).join('; ');
    return [parsed.message, extra].filter(Boolean).join(' | ') || rawMessage;
  } catch {
    return rawMessage;
  }
};

const githubRequestRaw = async (config: RepoConfig, path: string, init: RequestInit = {}) => {
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const message = await parseGithubErrorMessage(response);
    throw new Error(`GitHub API error ${response.status}: ${message}`);
  }

  return response;
};

const githubRequest = async (config: RepoConfig, path: string, init: RequestInit = {}) => {
  const response = await githubRequestRaw(config, path, init);
  const rawBody = await response.text();

  if (!rawBody) {
    return null;
  }

  return JSON.parse(rawBody) as unknown;
};

const githubRequestOptional = async (config: RepoConfig, path: string, init: RequestInit = {}) => {
  try {
    return await githubRequest(config, path, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('GitHub API error 404')) {
      return null;
    }

    throw error;
  }
};

const validateRepoAccess = async (config: RepoConfig) => {
  await githubRequest(config, '');
  await githubRequest(config, `/branches/${encodePathSegments(config.branch)}`);
};

const formatPublishError = (error: unknown, config: RepoConfig | null) => {
  const message = error instanceof Error ? error.message : 'Publishing failed.';

  if (message.includes('GitHub API error 401')) {
    return 'GitHub Token 无效，已过期，或没有访问仓库的权限。请重新生成 Token，并确认它能访问这个仓库。';
  }

  if (message.includes('GitHub API error 403')) {
    return 'GitHub 拒绝了这次请求。通常是 Token 权限不足。请确认 Token 对 10Allen01.github.io 具有 Contents: Read and write 权限。';
  }

  if (message.includes('GitHub API error 404')) {
    const repoLabel = config ? `${config.owner}/${config.repo}` : '当前仓库';
    return `${repoLabel} 或分支 ${config?.branch ?? 'main'} 不存在，或者 Token 没有访问这个仓库的权限。`;
  }

  if (message.includes('Failed to fetch')) {
    return '无法连接到 GitHub API。请检查网络连接，然后重试。';
  }

  return message;
};

const createCommit = async (config: RepoConfig, files: RepoFile[], deletedPaths: string[], message: string) => {
  const ref = await githubRequest(config, `/git/ref/heads/${encodePathSegments(config.branch)}`);
  const parentCommitSha = (ref as { object: { sha: string } }).object.sha;
  const parentCommit = await githubRequest(config, `/git/commits/${parentCommitSha}`);
  const baseTreeSha = (parentCommit as { tree: { sha: string } }).tree.sha;

  const blobResults = await Promise.all(
    files.map(async (file) => {
      const blob = await githubRequest(config, '/git/blobs', {
        method: 'POST',
        body: JSON.stringify({
          content: file.content,
          encoding: file.encoding
        })
      });

      return {
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: (blob as { sha: string }).sha
      };
    })
  );

  const deleteEntries = deletedPaths.map((path) => ({
    path,
    mode: '100644',
    type: 'blob',
    sha: null
  }));

  const tree = await githubRequest(config, '/git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [...blobResults, ...deleteEntries]
    })
  });

  const commit = await githubRequest(config, '/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: (tree as { sha: string }).sha,
      parents: [parentCommitSha]
    })
  });

  await githubRequest(config, `/git/refs/heads/${encodePathSegments(config.branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      sha: (commit as { sha: string }).sha,
      force: false
    })
  });

  return (commit as { sha: string }).sha;
};

export const initStudioPublisher = ({ starterBody }: StudioInitOptions) => {
  const form = document.querySelector<HTMLFormElement>('#studio-form');
  if (!form) {
    return;
  }

  const titleInput = document.querySelector<HTMLInputElement>('#title');
  const slugInput = document.querySelector<HTMLInputElement>('#slug');
  const sectionInput = document.querySelector<HTMLSelectElement>('#section');
  const publishedAtInput = document.querySelector<HTMLInputElement>('#publishedAt');
  const excerptInput = document.querySelector<HTMLTextAreaElement>('#excerpt');
  const tagsInput = document.querySelector<HTMLInputElement>('#tags');
  const locationInput = document.querySelector<HTMLInputElement>('#location');
  const coverInput = document.querySelector<HTMLInputElement>('#cover');
  const coverAltInput = document.querySelector<HTMLInputElement>('#coverAlt');
  const imageInput = document.querySelector<HTMLInputElement>('#post-images');
  const bodyInput = document.querySelector<HTMLTextAreaElement>('#body');
  const featuredInput = document.querySelector<HTMLInputElement>('#featured');
  const draftInput = document.querySelector<HTMLInputElement>('#draft');
  const resetButton = document.querySelector<HTMLButtonElement>('#reset-form');
  const submitButton = document.querySelector<HTMLButtonElement>('#submit-button');

  const repoOwnerInput = document.querySelector<HTMLInputElement>('#repo-owner');
  const repoNameInput = document.querySelector<HTMLInputElement>('#repo-name');
  const repoBranchInput = document.querySelector<HTMLInputElement>('#repo-branch');
  const repoTokenInput = document.querySelector<HTMLInputElement>('#repo-token');
  const repoBadge = document.querySelector<HTMLElement>('#repo-badge');
  const loadPostsButton = document.querySelector<HTMLButtonElement>('#load-posts');
  const existingPostCount = document.querySelector<HTMLElement>('#existing-post-count');
  const existingPostsSelect = document.querySelector<HTMLSelectElement>('#existing-posts');
  const deleteSummary = document.querySelector<HTMLElement>('#delete-summary');
  const deleteConfirmSlugInput = document.querySelector<HTMLInputElement>('#delete-confirm-slug');
  const deletePostButton = document.querySelector<HTMLButtonElement>('#delete-post');

  const previewSection = document.querySelector<HTMLElement>('#preview-section');
  const previewDate = document.querySelector<HTMLElement>('#preview-date');
  const previewCover = document.querySelector<HTMLElement>('#preview-cover');
  const previewTitle = document.querySelector<HTMLElement>('#preview-title');
  const previewExcerpt = document.querySelector<HTMLElement>('#preview-excerpt');
  const previewTags = document.querySelector<HTMLElement>('#preview-tags');
  const previewBody = document.querySelector<HTMLElement>('#preview-body');
  const previewGallery = document.querySelector<HTMLElement>('#preview-gallery');
  const filePlan = document.querySelector<HTMLElement>('#file-plan');
  const statusBox = document.querySelector<HTMLElement>('#studio-status');

  if (!titleInput || !slugInput || !sectionInput || !publishedAtInput || !excerptInput || !tagsInput || !locationInput || !coverInput || !coverAltInput || !imageInput || !bodyInput || !featuredInput || !draftInput || !resetButton || !submitButton || !repoOwnerInput || !repoNameInput || !repoBranchInput || !repoTokenInput || !repoBadge || !loadPostsButton || !existingPostCount || !existingPostsSelect || !deleteSummary || !deleteConfirmSlugInput || !deletePostButton || !previewSection || !previewDate || !previewCover || !previewTitle || !previewExcerpt || !previewTags || !previewBody || !previewGallery || !filePlan || !statusBox) {
    return;
  }

  const state = {
    coverFile: null as File | null,
    imageFiles: [] as File[],
    previewUrls: [] as string[],
    existingPosts: [] as ExistingStudioPost[],
    deletePlan: null as DeletePlan | null,
    deleteLookupRequest: 0
  };

  const setStatus = (title: string, message: string, tone = '') => {
    statusBox.innerHTML = `<h2 class="title-2" style="font-size: 1.25rem;">${escapeHtml(title)}</h2><p class="${tone}" style="margin-top: 12px; color: var(--text-2);">${escapeHtml(message)}</p>`;
  };

  const setStatusHtml = (title: string, html: string) => {
    statusBox.innerHTML = `<h2 class="title-2" style="font-size: 1.25rem;">${escapeHtml(title)}</h2>${html}`;
  };

  const getSelectedExistingPost = () => {
    const slug = existingPostsSelect.value;
    return state.existingPosts.find((post) => post.slug === slug) ?? null;
  };

  const formatStudioDate = (value: string) => {
    if (!value) {
      return 'Unknown date';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(parsed);
  };

  const renderExistingPostOptions = () => {
    existingPostCount.textContent = state.existingPosts.length > 0 ? `${state.existingPosts.length} posts loaded` : 'No posts found';
    existingPostsSelect.innerHTML = ['<option value="">Select a post…</option>', ...state.existingPosts.map((post) => {
      const labelParts = [formatStudioDate(post.publishedAt), SECTION_LABELS[post.section] ?? post.section];
      if (post.draft) {
        labelParts.push('Draft');
      }

      return `<option value="${escapeHtml(post.slug)}">${escapeHtml(`${labelParts.join(' · ')} · ${post.title}`)}</option>`;
    })].join('');
    existingPostsSelect.disabled = state.existingPosts.length === 0;
  };

  const getAssetUsageCounts = () => {
    const counts = new Map<string, number>();

    state.existingPosts.forEach((post) => {
      post.localAssetPaths.forEach((path) => {
        counts.set(path, (counts.get(path) ?? 0) + 1);
      });
    });

    return counts;
  };

  const repositoryPathExists = async (config: RepoConfig, path: string) => {
    const payload = await githubRequestOptional(config, `/contents/${encodePathSegments(path)}?ref=${encodeURIComponent(config.branch)}`) as GithubContentItem | GithubContentItem[] | null;

    if (!payload) {
      return false;
    }

    if (Array.isArray(payload)) {
      return payload.length > 0;
    }

    return payload.type === 'file';
  };

  const buildDeletePlan = async (config: RepoConfig, post: ExistingStudioPost): Promise<DeletePlan> => {
    const assetUsageCounts = getAssetUsageCounts();
    const postFolderPath = `public/images/posts/${post.slug}`;
    const postFolderPrefix = `${postFolderPath}/`;
    const folderAssetPaths = await fetchRepositoryFiles(config, postFolderPath);
    const folderAssetSet = new Set(folderAssetPaths);
    const externalLinkedAssets = post.localAssetPaths.filter((path) => !path.startsWith(postFolderPrefix));
    const externalExistenceEntries = await Promise.all(externalLinkedAssets.map(async (path) => {
      return [path, await repositoryPathExists(config, path)] as const;
    }));
    const externalExistenceMap = new Map(externalExistenceEntries);

    const linkedUniqueAssetPaths: string[] = [];
    const sharedLinkedAssetPaths: string[] = [];
    const missingLinkedAssetPaths: string[] = [];

    post.localAssetPaths.forEach((assetPath) => {
      const usageCount = assetUsageCounts.get(assetPath) ?? 0;
      const exists = assetPath.startsWith(postFolderPrefix)
        ? folderAssetSet.has(assetPath)
        : externalExistenceMap.get(assetPath) === true;

      if (!exists) {
        missingLinkedAssetPaths.push(assetPath);
        return;
      }

      if (usageCount > 1) {
        sharedLinkedAssetPaths.push(assetPath);
        return;
      }

      if (!assetPath.startsWith(postFolderPrefix)) {
        linkedUniqueAssetPaths.push(assetPath);
      }
    });

    const sharedAssetSet = new Set(sharedLinkedAssetPaths);
    const autoDeletePaths = dedupeStrings([
      post.markdownPath,
      ...folderAssetPaths.filter((path) => !sharedAssetSet.has(path)),
      ...linkedUniqueAssetPaths
    ]);

    return {
      slug: post.slug,
      markdownPath: post.markdownPath,
      autoDeletePaths,
      folderAssetPaths,
      linkedUniqueAssetPaths: dedupeStrings(linkedUniqueAssetPaths),
      sharedLinkedAssetPaths: dedupeStrings(sharedLinkedAssetPaths),
      missingLinkedAssetPaths: dedupeStrings(missingLinkedAssetPaths)
    };
  };

  const renderDeleteSummary = (post: ExistingStudioPost | null, plan: DeletePlan | null = null) => {
    if (!post) {
      deleteSummary.innerHTML = 'Load posts to manage deletions.';
      return;
    }

    const sectionLabel = SECTION_LABELS[post.section] ?? post.section;
    const flags = [post.draft ? 'Draft' : 'Published', post.featured ? 'Featured' : 'Standard'];
    const renderItems = (items: string[], emptyMessage: string) => {
      return items.length > 0
        ? `<ul class="info-list" style="margin: 0; padding-left: 18px;">${items.map((path) => `<li style="padding: 4px 0; word-break: break-all;">${escapeHtml(path)}</li>`).join('')}</ul>`
        : `<p style="margin: 0; color: var(--text-3);">${escapeHtml(emptyMessage)}</p>`;
    };

    const autoDeletePaths = plan?.autoDeletePaths ?? [];
    const sharedLinkedAssetPaths = plan?.sharedLinkedAssetPaths ?? [];
    const missingLinkedAssetPaths = plan?.missingLinkedAssetPaths ?? [];
    const linkedUniqueAssetPaths = plan?.linkedUniqueAssetPaths ?? [];
    const folderAssetPaths = plan?.folderAssetPaths ?? [];

    deleteSummary.innerHTML = `<div style="display: grid; gap: 10px;">
      <div><strong>Title:</strong> ${escapeHtml(post.title)}</div>
      <div><strong>Slug:</strong> ${escapeHtml(post.slug)}</div>
      <div><strong>Section:</strong> ${escapeHtml(sectionLabel)}</div>
      <div><strong>Date:</strong> ${escapeHtml(formatStudioDate(post.publishedAt))}</div>
      <div><strong>Status:</strong> ${escapeHtml(flags.join(' · '))}</div>
      <div><strong>Excerpt:</strong> ${escapeHtml(post.excerpt || 'No excerpt available.')}</div>
      <div><strong>Referenced local assets:</strong> ${escapeHtml(String(post.localAssetPaths.length))}</div>
      <div><strong>Files that will be deleted automatically:</strong> ${escapeHtml(String(autoDeletePaths.length))}</div>
      ${renderItems(autoDeletePaths, 'No delete plan loaded yet.')}
      <div><strong>Post folder assets discovered:</strong> ${escapeHtml(String(folderAssetPaths.length))}</div>
      ${renderItems(folderAssetPaths, 'No dedicated post folder assets were found.')}
      <div><strong>Unique linked assets outside the post folder:</strong> ${escapeHtml(String(linkedUniqueAssetPaths.length))}</div>
      ${renderItems(linkedUniqueAssetPaths, 'No extra linked assets will be deleted outside the post folder.')}
      <div><strong>Shared linked assets that will be kept:</strong> ${escapeHtml(String(sharedLinkedAssetPaths.length))}</div>
      ${renderItems(sharedLinkedAssetPaths, 'No shared assets need to be preserved.')}
      <div><strong>Referenced assets missing from the repository:</strong> ${escapeHtml(String(missingLinkedAssetPaths.length))}</div>
      ${renderItems(missingLinkedAssetPaths, 'No missing referenced assets were detected.')}
    </div>`;
  };

  const updateDeleteButtonState = () => {
    const post = getSelectedExistingPost();
    const confirmed = !!post && deleteConfirmSlugInput.value.trim() === post.slug;
    const deleteFileCount = state.deletePlan && post && state.deletePlan.slug === post.slug ? state.deletePlan.autoDeletePaths.length : 0;

    deletePostButton.textContent = deleteFileCount > 0 ? `Delete selected post (${deleteFileCount} files)` : 'Delete selected post';

    const hasLoadedFiles = !!post && !!state.deletePlan && state.deletePlan.slug === post.slug && deleteFileCount > 0;

    deletePostButton.disabled = !(confirmed && hasLoadedFiles);
  };

  const resetExistingPosts = (countLabel = 'No posts loaded', summaryMessage = 'Load posts to manage deletions.') => {
    state.existingPosts = [];
    state.deletePlan = null;
    state.deleteLookupRequest += 1;

    existingPostCount.textContent = countLabel;
    existingPostsSelect.innerHTML = '<option value="">Select a post…</option>';
    existingPostsSelect.disabled = true;
    deleteConfirmSlugInput.value = '';
    deleteConfirmSlugInput.disabled = true;
    deletePostButton.disabled = true;
    deleteSummary.innerHTML = summaryMessage;
  };

  const fetchRepositoryFiles = async (config: RepoConfig, path: string): Promise<string[]> => {
    const payload = await githubRequestOptional(config, `/contents/${encodePathSegments(path)}?ref=${encodeURIComponent(config.branch)}`) as GithubContentItem[] | GithubContentItem | null;

    if (!payload) {
      return [];
    }

    if (Array.isArray(payload)) {
      const nestedResults = await Promise.all(payload.map(async (entry) => {
        if (entry.type === 'dir') {
          return fetchRepositoryFiles(config, entry.path);
        }

        return [entry.path];
      }));

      return nestedResults.flat().sort((left, right) => left.localeCompare(right));
    }

    if (payload.type === 'dir') {
      return fetchRepositoryFiles(config, payload.path);
    }

    return [payload.path];
  };

  const loadDeleteFilesForSelection = async () => {
    const post = getSelectedExistingPost();

    deleteConfirmSlugInput.value = '';
    state.deletePlan = null;

    if (!post) {
      deleteConfirmSlugInput.disabled = true;
      renderDeleteSummary(null);
      updateDeleteButtonState();
      return;
    }

    deleteConfirmSlugInput.disabled = false;
    deleteSummary.innerHTML = 'Loading files for the selected post…';
    updateDeleteButtonState();

    let config: RepoConfig;

    try {
      config = getRepoConfig();
    } catch {
      deleteSummary.innerHTML = 'Repository configuration is required before delete details can be loaded.';
      updateDeleteButtonState();
      return;
    }

    const requestId = ++state.deleteLookupRequest;

    try {
      const plan = await buildDeletePlan(config, post);
      if (requestId !== state.deleteLookupRequest || existingPostsSelect.value !== post.slug) {
        return;
      }

      state.deletePlan = plan;
      renderDeleteSummary(post, plan);
      updateDeleteButtonState();
    } catch (error) {
      if (requestId !== state.deleteLookupRequest || existingPostsSelect.value !== post.slug) {
        return;
      }

      state.deletePlan = null;
      deleteSummary.innerHTML = escapeHtml(formatPublishError(error, config));
      updateDeleteButtonState();
    }
  };

  const loadRepoConfig = () => {
    repoOwnerInput.value = localStorage.getItem(STORAGE_KEYS.owner) ?? '';
    repoNameInput.value = localStorage.getItem(STORAGE_KEYS.repo) ?? '';
    repoBranchInput.value = localStorage.getItem(STORAGE_KEYS.branch) ?? 'main';
    repoTokenInput.value = localStorage.getItem(STORAGE_KEYS.token) ?? '';
  };

  const persistRepoConfig = () => {
    localStorage.setItem(STORAGE_KEYS.owner, repoOwnerInput.value.trim());
    localStorage.setItem(STORAGE_KEYS.repo, repoNameInput.value.trim());
    localStorage.setItem(STORAGE_KEYS.branch, repoBranchInput.value.trim() || 'main');
    localStorage.setItem(STORAGE_KEYS.token, repoTokenInput.value.trim());

    const owner = repoOwnerInput.value.trim();
    const repo = repoNameInput.value.trim();
    repoBadge.textContent = owner && repo ? `${owner}/${repo}` : 'Not configured';
  };

  const getRepoConfig = (): RepoConfig => {
    const owner = repoOwnerInput.value.trim();
    const repo = repoNameInput.value.trim();
    const branch = repoBranchInput.value.trim() || 'main';
    const token = repoTokenInput.value.trim();

    if (!owner || !repo || !token) {
      throw new Error('Repository owner, repository name, and token are required.');
    }

    return { owner, repo, branch, token };
  };

  const clearPreviewUrls = () => {
    state.previewUrls.forEach((url) => URL.revokeObjectURL(url));
    state.previewUrls = [];
  };

  const ensureSlug = () => {
    if (!slugInput.value.trim()) {
      slugInput.value = slugify(titleInput.value);
    }

    slugInput.value = slugify(slugInput.value);
    return slugInput.value;
  };

  const updateFilePlan = () => {
    const slug = ensureSlug();
    const owner = repoOwnerInput.value.trim() || 'owner';
    const repo = repoNameInput.value.trim() || 'repo';
    const branch = repoBranchInput.value.trim() || 'main';
    const coverName = state.coverFile
      ? `${slug}/${sanitizeImageName(state.coverFile)}`
      : `${slug}/[no cover selected]`;
    const imageLines = state.imageFiles.length > 0
      ? state.imageFiles.map((file, index) => `public/images/posts/${slug}/${sanitizeImageName(file, `${String(index + 1).padStart(2, '0')}-`)}`).join('\n')
      : `public/images/posts/${slug}/[no post images selected]`;

    filePlan.textContent = `${owner}/${repo}@${branch}\nsrc/content/posts/${slug}.md\npublic/images/posts/${coverName}\n${imageLines}`;
  };

  const sanitizeImageName = (file: Pick<File, 'name' | 'type'>, prefix = '') => {
    const extension = getFileExtension(file);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    const normalizedBaseName = `${prefix}${baseName}`;
    return `${slugify(normalizedBaseName)}.${extension}`;
  };

  const updatePreview = () => {
    const slug = ensureSlug();
    const tags = parseTags(tagsInput.value);
    const sectionValue = sectionInput.value;
    const sectionLabel = SECTION_LABELS[sectionValue] ?? sectionValue;

    clearPreviewUrls();

    previewSection.textContent = sectionLabel;
    previewDate.textContent = publishedAtInput.value || today;
    previewTitle.textContent = titleInput.value.trim() || 'Preview title';
    previewExcerpt.textContent = excerptInput.value.trim() || 'The excerpt appears here as you type.';

    const excerptCount = document.querySelector<HTMLElement>('#excerpt-count');
    if (excerptCount) {
      const len = excerptInput.value.trim().length;
      excerptCount.textContent = `${len} / ${POST_EXCERPT_MAX_LEN}`;
      const inRange = len >= POST_EXCERPT_MIN_LEN && len <= POST_EXCERPT_MAX_LEN;
      excerptCount.style.color = len === 0 ? 'var(--text-3)' : inRange ? 'var(--text-3)' : '#c96';
    }
    previewBody.innerHTML = bodyInput.value.trim() ? renderPreviewBody(bodyInput.value.trim()) : '<p>Body preview appears here.</p>';
    previewTags.innerHTML = tags.length > 0
      ? tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')
      : `<span class="tag">#${escapeHtml(slug)}</span>`;

    if (state.coverFile) {
      const coverUrl = URL.createObjectURL(state.coverFile);
      state.previewUrls.push(coverUrl);
      previewCover.innerHTML = `<img src="${coverUrl}" alt="Cover preview" style="width: 100%; height: 100%; object-fit: contain; display: block;" />`;
      previewCover.classList.remove('preview-cover--empty');
    } else {
      previewCover.textContent = 'No cover selected';
      previewCover.classList.add('preview-cover--empty');
    }

    previewGallery.innerHTML = state.imageFiles.length > 0
      ? state.imageFiles.map((file) => {
          const url = URL.createObjectURL(file);
          state.previewUrls.push(url);
          return `<img src="${url}" alt="${escapeHtml(file.name)}" style="width: 100%; height: 88px; object-fit: cover; border-radius: 4px;" />`;
        }).join('')
      : '';

    updateFilePlan();
  };

  const resetForm = () => {
    form.reset();
    state.coverFile = null;
    state.imageFiles = [];
    publishedAtInput.value = today;
    bodyInput.value = starterBody;
    clearPreviewUrls();
    setStatus('Status', 'Ready to publish.');
    updatePreview();
  };

  loadRepoConfig();
  publishedAtInput.value = today;
  bodyInput.value = starterBody;
  persistRepoConfig();

  [repoOwnerInput, repoNameInput, repoBranchInput, repoTokenInput].forEach((element) => {
    element.addEventListener('input', () => {
      persistRepoConfig();
      updateFilePlan();
      resetExistingPosts('Posts need reload', 'Repository settings changed. Reload posts before deleting anything.');
    });
  });

  titleInput.addEventListener('input', () => {
    slugInput.value = slugify(titleInput.value);
    updatePreview();
  });

  slugInput.addEventListener('input', updatePreview);
  [sectionInput, publishedAtInput, excerptInput, tagsInput, locationInput, coverAltInput, bodyInput, featuredInput, draftInput].forEach((element) => {
    element.addEventListener('input', updatePreview);
    element.addEventListener('change', updatePreview);
  });

  coverInput.addEventListener('change', () => {
    state.coverFile = coverInput.files?.[0] ?? null;
    updatePreview();
  });

  imageInput.addEventListener('change', () => {
    state.imageFiles = imageInput.files ? Array.from(imageInput.files) : [];
    updatePreview();
  });

  resetButton.addEventListener('click', resetForm);

  existingPostsSelect.addEventListener('change', () => {
    void loadDeleteFilesForSelection();
  });

  deleteConfirmSlugInput.addEventListener('input', updateDeleteButtonState);

  loadPostsButton.addEventListener('click', async () => {
    let config: RepoConfig;

    try {
      config = getRepoConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid repository configuration.';
      setStatus('Configuration required', message, 'status-error');
      resetExistingPosts('No posts loaded', 'Repository configuration is required before loading posts.');
      return;
    }

    loadPostsButton.disabled = true;
    loadPostsButton.textContent = 'Loading...';
    resetExistingPosts('Loading posts...', 'Loading post metadata from the repository...');
    setStatus('Loading posts', 'Fetching current posts from the repository source...');

    try {
      await validateRepoAccess(config);

      const payload = await githubRequestOptional(config, `/contents/${encodePathSegments('src/content/posts')}?ref=${encodeURIComponent(config.branch)}`) as GithubContentItem[] | null;
      const markdownEntries = Array.isArray(payload)
        ? payload.filter((entry) => entry.type === 'file' && entry.name.endsWith('.md'))
        : [];

      const existingPosts: ExistingStudioPost[] = [];
      const loadWarnings: string[] = [];

      for (const entry of markdownEntries) {
        try {
          const filePayload = await githubRequest(config, `/contents/${encodePathSegments(entry.path)}?ref=${encodeURIComponent(config.branch)}`) as GithubContentItem | null;

          if (!filePayload?.content) {
            loadWarnings.push(`${entry.name}: skipped because file content was unavailable.`);
            continue;
          }

          const markdown = decodeBase64(filePayload.content);
          const parsedPost = parseStoredPostMarkdown(entry.path, markdown);

          if (!parsedPost) {
            loadWarnings.push(`${entry.name}: skipped because it does not match the post frontmatter schema.`);
            continue;
          }

          existingPosts.push(parsedPost);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          loadWarnings.push(`${entry.name}: skipped because it could not be parsed (${message}).`);
        }
      }

      existingPosts.sort((left, right) => {
        return new Date(right.publishedAt || 0).getTime() - new Date(left.publishedAt || 0).getTime();
      });

      state.existingPosts = existingPosts;
      renderExistingPostOptions();
      deleteSummary.innerHTML = existingPosts.length > 0 ? 'Select a post to inspect its delete plan.' : 'No markdown posts were found in src/content/posts.';

      if (loadWarnings.length > 0) {
        setStatusHtml(
          'Posts loaded with warnings',
          `<p style="margin-top: 12px; color: var(--text-2);">${escapeHtml(existingPosts.length > 0 ? 'The delete list is available, but some repository files were skipped because they are not valid posts or could not be parsed.' : 'No valid posts were found in the configured repository branch.')}</p>
           <ul class="info-list" style="margin-top: 16px;">
             ${loadWarnings.slice(0, 6).map((warning) => `<li style="padding: 8px 0; color: var(--text-2);">${escapeHtml(warning)}</li>`).join('')}
             ${loadWarnings.length > 6 ? `<li style="padding: 8px 0; color: var(--text-2);">${escapeHtml(`And ${String(loadWarnings.length - 6)} more warnings...`)}</li>` : ''}
           </ul>`
        );
      } else {
        setStatus('Posts loaded', existingPosts.length > 0 ? 'Select a post to inspect and delete it.' : 'No posts were found in the configured repository branch.');
      }
    } catch (error) {
      resetExistingPosts('Load failed', 'Unable to load posts from the configured repository.');
      setStatus('Load failed', formatPublishError(error, config), 'status-error');
    } finally {
      loadPostsButton.disabled = false;
      loadPostsButton.textContent = 'Load posts';
    }
  });

  deletePostButton.addEventListener('click', async () => {
    const post = getSelectedExistingPost();

    if (!post) {
      setStatus('Select a post', 'Choose an existing post before attempting deletion.', 'status-error');
      return;
    }

    if (deleteConfirmSlugInput.value.trim() !== post.slug) {
      setStatus('Confirmation required', `Type ${post.slug} exactly to confirm deletion.`, 'status-error');
      return;
    }

    const deletePlan = state.deletePlan;

    if (!deletePlan || deletePlan.slug !== post.slug || deletePlan.autoDeletePaths.length === 0) {
      setStatus('Delete plan missing', 'Load the selected post details before deleting it.', 'status-error');
      return;
    }

    if (!window.confirm(`Delete ${post.title} (${post.slug}) and all associated files? This cannot be undone.`)) {
      return;
    }

    let config: RepoConfig;

    try {
      config = getRepoConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid repository configuration.';
      setStatus('Configuration required', message, 'status-error');
      return;
    }

    loadPostsButton.disabled = true;
    existingPostsSelect.disabled = true;
    deleteConfirmSlugInput.disabled = true;
    deletePostButton.disabled = true;
    deletePostButton.textContent = 'Deleting...';
    setStatus('Deleting', `Removing ${post.slug} from the repository source...`);

    try {
      await validateRepoAccess(config);
      const commitSha = await createCommit(config, [], deletePlan.autoDeletePaths, `Delete post: ${post.title}`);
      const actionsUrl = `https://github.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions`;
      const commitUrl = `https://github.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/commit/${commitSha}`;

      state.existingPosts = state.existingPosts.filter((entry) => entry.slug !== post.slug);
      state.deletePlan = null;

      renderExistingPostOptions();
      existingPostsSelect.value = '';
      deleteConfirmSlugInput.value = '';
      deleteConfirmSlugInput.disabled = state.existingPosts.length === 0;
      renderDeleteSummary(null);
      updateDeleteButtonState();

      setStatusHtml(
        'Deleted',
        `<p style="margin-top: 12px; color: var(--text-2);">The selected post and its associated files were removed from the deployment source.</p>
         <ul class="info-list" style="margin-top: 16px;">
           <li style="padding: 8px 0;"><a href="${commitUrl}" target="_blank" rel="noreferrer">View commit</a></li>
           <li style="padding: 8px 0;"><a href="${actionsUrl}" target="_blank" rel="noreferrer">View deployment workflow</a></li>
           <li style="padding: 8px 0;">Deleted slug: ${escapeHtml(post.slug)}</li>
           <li style="padding: 8px 0;">Deleted files: ${escapeHtml(String(deletePlan.autoDeletePaths.length))}</li>
         </ul>`
      );
    } catch (error) {
      setStatus('Delete failed', formatPublishError(error, config), 'status-error');
      deleteConfirmSlugInput.disabled = false;
      updateDeleteButtonState();
    } finally {
      loadPostsButton.disabled = false;
      existingPostsSelect.disabled = state.existingPosts.length === 0;
      deletePostButton.textContent = 'Delete selected post';
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const title = titleInput.value.trim();
    const excerpt = excerptInput.value.trim();
    const body = bodyInput.value.trim();
    const slug = ensureSlug();

    if (!title || !excerpt || !body) {
      setStatus('Missing fields', 'Title, excerpt, and body are required.', 'status-error');
      return;
    }

    if (excerpt.length < POST_EXCERPT_MIN_LEN || excerpt.length > POST_EXCERPT_MAX_LEN) {
      setStatus(
        'Excerpt length',
        `Excerpt must be between ${POST_EXCERPT_MIN_LEN} and ${POST_EXCERPT_MAX_LEN} characters (current: ${excerpt.length}).`,
        'status-error'
      );
      return;
    }

    let config: RepoConfig;

    try {
      config = getRepoConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid repository configuration.';
      setStatus('Configuration required', message, 'status-error');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Publishing...';
    setStatus('Checking configuration', 'Verifying repository access before publishing...');

    try {
      await validateRepoAccess(config);
      setStatus('Publishing', 'Sending content to the live site source...');

      const imageEntries: PublishImageEntry[] = [];
      const files: RepoFile[] = [];

      let coverPath = '';
      if (state.coverFile) {
        const coverFileName = sanitizeImageName(state.coverFile);
        coverPath = `/images/posts/${slug}/${coverFileName}`;
        files.push({
          path: `public/images/posts/${slug}/${coverFileName}`,
          content: await toBase64(state.coverFile),
          encoding: 'base64'
        });
      }

      for (const [index, file] of state.imageFiles.entries()) {
        const imageFileName = sanitizeImageName(file, `${String(index + 1).padStart(2, '0')}-`);
        const imagePath = `/images/posts/${slug}/${imageFileName}`;
        imageEntries.push({
          src: imagePath,
          alt: `${title} ${index + 1}`
        });
        files.push({
          path: `public/images/posts/${slug}/${imageFileName}`,
          content: await toBase64(file),
          encoding: 'base64'
        });
      }

      const markdown = buildMarkdown({
        title,
        excerpt,
        publishedAt: publishedAtInput.value || today,
        section: sectionInput.value,
        featured: featuredInput.checked,
        draft: draftInput.checked,
        tags: parseTags(tagsInput.value),
        coverPath,
        coverAlt: coverAltInput.value.trim(),
        location: locationInput.value.trim(),
        body,
        imageEntries
      });

      files.push({
        path: `src/content/posts/${slug}.md`,
        content: markdown,
        encoding: 'utf-8'
      });

      const commitSha = await createCommit(config, files, [], `Publish post: ${title}`);
      const actionsUrl = `https://github.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions`;
      const commitUrl = `https://github.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/commit/${commitSha}`;

      setStatusHtml(
        'Published',
        `<p style="margin-top: 12px; color: var(--text-2);">The post was published to the site's deployment source. GitHub Pages will rebuild automatically.</p>
         <ul class="info-list" style="margin-top: 16px;">
           <li style="padding: 8px 0;"><a href="${commitUrl}" target="_blank" rel="noreferrer">View commit</a></li>
           <li style="padding: 8px 0;"><a href="${actionsUrl}" target="_blank" rel="noreferrer">View deployment workflow</a></li>
           <li style="padding: 8px 0;">Post slug: ${escapeHtml(slug)}</li>
         </ul>`
      );
    } catch (error) {
      setStatus('Publish failed', formatPublishError(error, config), 'status-error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Publish to site';
    }
  });

  updatePreview();
};
