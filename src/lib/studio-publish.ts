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

const githubRequest = async (config: RepoConfig, path: string, init: RequestInit = {}) => {
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

  return response.json();
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

const createCommit = async (config: RepoConfig, files: RepoFile[], message: string) => {
  const ref = await githubRequest(config, `/git/ref/heads/${encodePathSegments(config.branch)}`);
  const parentCommitSha = ref.object.sha as string;
  const parentCommit = await githubRequest(config, `/git/commits/${parentCommitSha}`);
  const baseTreeSha = parentCommit.tree.sha as string;

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
        sha: blob.sha as string
      };
    })
  );

  const tree = await githubRequest(config, '/git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: blobResults
    })
  });

  const commit = await githubRequest(config, '/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [parentCommitSha]
    })
  });

  await githubRequest(config, `/git/refs/heads/${encodePathSegments(config.branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      sha: commit.sha,
      force: false
    })
  });

  return commit.sha as string;
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

  if (!titleInput || !slugInput || !sectionInput || !publishedAtInput || !excerptInput || !tagsInput || !locationInput || !coverInput || !coverAltInput || !imageInput || !bodyInput || !featuredInput || !draftInput || !resetButton || !submitButton || !repoOwnerInput || !repoNameInput || !repoBranchInput || !repoTokenInput || !repoBadge || !previewSection || !previewDate || !previewCover || !previewTitle || !previewExcerpt || !previewTags || !previewBody || !previewGallery || !filePlan || !statusBox) {
    return;
  }

  const state = {
    coverFile: null as File | null,
    imageFiles: [] as File[],
    previewUrls: [] as string[]
  };

  const setStatus = (title: string, message: string, tone = '') => {
    statusBox.innerHTML = `<h2 class="title-2" style="font-size: 1.25rem;">${escapeHtml(title)}</h2><p class="${tone}" style="margin-top: 12px; color: var(--text-2);">${escapeHtml(message)}</p>`;
  };

  const setStatusHtml = (title: string, html: string) => {
    statusBox.innerHTML = `<h2 class="title-2" style="font-size: 1.25rem;">${escapeHtml(title)}</h2>${html}`;
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

      const commitSha = await createCommit(config, files, `Publish post: ${title}`);
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
