/** YouTube watch URL ?v=… → videoId. Titles show on the site player (edit freely). */
export type BackgroundMusicTrack = { title: string; src: string };

/** Bottom bar player: hidden YouTube engine + on-site controls. Set enabled: false to remove. */
export type BackgroundMusicConfig =
  | { enabled: false }
  | {
      enabled: true;
      /** Shown above the song title (e.g. station name). */
      label?: string;
      /** Order = play order; after the last track ends, the first plays again. */
      tracks: [BackgroundMusicTrack, ...BackgroundMusicTrack[]];
    };

export const siteConfig = {
  title: 'Allen',
  tagline: 'Technical Notes',
  description: 'A personal archive focusing on AI, Cyber Security, Programming, and practical tools.',
  author: 'Allen',
  location: 'Global',
  hero: {
    eyebrow: 'Welcome',
    title: 'Code, Security, and Life.',
    summary: 'Documenting my technical journey, sharing practical tools, and exploring everyday reflections.'
  },
  socialLinks: [
    {
      label: 'GitHub',
      href: 'https://github.com/10Allen01'
    },
    {
      label: 'Instagram',
      href: 'https://www.instagram.com/sore.nvoss/'
    }
  ],
  /**
   * Bottom “now playing” bar (YouTube-only). Shipped in the static build — it runs on GitHub Pages the same as locally
   * after you push and the workflow deploys. If playback fails on *.github.io, try another video (embedding must be allowed)
   * and ensure the browser is not blocking third-party cookies/storage for youtube.com.
   */
  backgroundMusic: {
    enabled: true,
    label: 'Now playing',
    tracks: [{ title: 'Featured track', src: '/audio/background.mp3' }]
  } satisfies BackgroundMusicConfig
} as const;

export const navigation = [
  { label: 'Home', href: '/' },
  { label: 'Archive', href: '/blog/' },
  { label: 'About', href: '/about/' }
] as const;

export const sectionMeta = {
  ai: {
    label: 'AI',
    description: 'Artificial Intelligence and machine learning.'
  },
  security: {
    label: 'Cyber Security',
    description: 'Security research, vulnerability analysis, and best practices.'
  },
  programming: {
    label: 'Programming',
    description: 'Software development, engineering, and architecture.'
  },
  daily: {
    label: 'Daily',
    description: 'Life, reading, and personal reflections.'
  },
  tools: {
    label: 'Tools',
    description: 'Practical utilities and software sharing.'
  }
} as const;

const normalizePathname = (value: string) => {
  if (!value || value === '/') {
    return '/';
  }

  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const normalizeBase = (value: string) => {
  if (!value || value === '/') {
    return '';
  }

  return value.endsWith('/') ? value.slice(0, -1) : value;
};

export const withBase = (path = '/') => {
  const base = normalizeBase(import.meta.env.BASE_URL ?? '/');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}` || '/';
};

export const stripBase = (pathname: string) => {
  const base = normalizeBase(import.meta.env.BASE_URL ?? '/');
  if (!base) {
    return normalizePathname(pathname || '/');
  }

  return normalizePathname(pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname || '/');
};
