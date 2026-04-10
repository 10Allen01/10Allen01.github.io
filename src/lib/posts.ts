import { getCollection, type CollectionEntry } from 'astro:content';

export type PostEntry = CollectionEntry<'posts'>;
export type PostSection = PostEntry['data']['section'];
type PostTag = PostEntry['data']['tags'][number];

const toDate = (value: Date | string | number) => {
  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Invalid date value: ${String(value)}`);
  }

  return parsed;
};

const getPostTimestamp = (post: PostEntry, key: 'publishedAt' | 'updatedAt' = 'publishedAt') => {
  const value = post.data[key];

  if (!value) {
    return 0;
  }

  return toDate(value).getTime();
};

export const sortPostsByDate = (posts: PostEntry[]) => {
  return [...posts].sort((left, right) => {
    return getPostTimestamp(right) - getPostTimestamp(left);
  });
};

export const getPublishedPosts = async () => {
  const posts = await getCollection('posts', ({ data }: { data: PostEntry['data'] }) => !data.draft);
  return sortPostsByDate(posts);
};

export const getFeaturedPosts = (posts: PostEntry[], limit?: number) => {
  const filtered = posts.filter((post) => post.data.featured);
  return typeof limit === 'number' ? filtered.slice(0, limit) : filtered;
};

export const getSectionPosts = (posts: PostEntry[], section: PostSection, limit?: number) => {
  const filtered = posts.filter((post) => post.data.section === section);
  return typeof limit === 'number' ? filtered.slice(0, limit) : filtered;
};

export const getReadingTime = (post: PostEntry) => {
  const words = post.body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
};

export const getAllTags = (posts: PostEntry[]) => {
  return Array.from(
    new Set(posts.flatMap((post) => post.data.tags.map((tag: PostTag) => tag.trim())).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right));
};

export const getRelatedPosts = (posts: PostEntry[], currentPost: PostEntry, limit = 3) => {
  const currentTags = new Set(currentPost.data.tags);

  return posts
    .filter((post) => post.id !== currentPost.id)
    .map((post) => ({
      post,
      score:
        post.data.tags.reduce((score: number, tag: PostTag) => score + (currentTags.has(tag) ? 2 : 0), 0) +
        (post.data.section === currentPost.data.section ? 1 : 0)
    }))
    .sort((left, right) => {
      if (right.score === left.score) {
        return getPostTimestamp(right.post) - getPostTimestamp(left.post);
      }

      return right.score - left.score;
    })
    .slice(0, limit)
    .map((item) => item.post);
};

export const formatDate = (date: Date | string | number) => {
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(toDate(date));
};
