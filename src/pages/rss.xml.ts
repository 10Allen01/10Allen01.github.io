import rss from '@astrojs/rss';
import { getPublishedPosts } from '../lib/posts';
import { siteConfig, withBase } from '../config/site';

export async function GET(context: { site?: URL }) {
  const posts = await getPublishedPosts();

  return rss({
    title: `${siteConfig.title} RSS Feed`,
    description: siteConfig.description,
    site: context.site ?? 'http://localhost:4321',
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.excerpt,
      pubDate: post.data.publishedAt,
      link: withBase(`/blog/${post.slug}/`)
    }))
  });
}
