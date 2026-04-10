# Allen

Allen is a cool-toned personal blog built with Astro for GitHub Pages. It includes a visual publishing Studio that writes markdown and images directly into your local repository, so you get a CMS-like workflow without introducing a backend.

## What this project includes

- A refined static blog with a calm ocean-inspired visual system
- Three content lanes: `journal`, `notes`, and `gallery`
- Content collections with strict frontmatter validation
- A local visual publishing Studio at `/studio/`
- Automatic section placement based on frontmatter
- RSS, sitemap support, and GitHub Pages deployment workflow

## Why this architecture fits GitHub Pages

GitHub Pages is static hosting. That makes it reliable and simple, but it does not provide a secure writable backend for a traditional CMS.

This project solves that by separating concerns cleanly:

- The **public site** is purely static and deploys cleanly to `github.io`
- The **Studio** is a browser-based local tool that writes content files into the repo using the File System Access API
- After publishing locally, you **commit and push** the generated files to make them live

That gives you strong maintainability, portable content, and low operational risk.

## Local development

Install dependencies:

```bash
npm install
```

Start the site:

```bash
npm run dev
```

Then open the local site and visit:

- `/` for the homepage
- `/blog/` for the archive
- `/gallery/` for image-led entries
- `/studio/` for the publishing tool

## Using the Studio

Open `/studio/` in a Chromium-based browser such as Chrome or Edge.

1. Click `Pick repository folder`
2. Select the root of this repo
3. Fill in title, excerpt, section, tags, body, and images
4. Click `Publish into repository`
5. Commit and push the generated files

The Studio writes content to:

- `src/content/posts/<slug>.md`
- `public/images/posts/<slug>/...`

Once pushed, the new post will automatically appear in the correct site section.

## Content model

Each post belongs to one of these sections:

- `journal`
- `notes`
- `gallery`

The section determines how the homepage and archive surface the content.

## Customize site identity

Update `src/config/site.ts` to set:

- social links
- contact email
- tagline and hero copy
- author metadata

## Deployment to GitHub Pages

This repo includes `.github/workflows/deploy.yml`.

To deploy:

1. Push this project to GitHub
2. In GitHub, enable **Pages** and choose **GitHub Actions** as the source
3. Push to the `main` branch
4. GitHub Actions will build and publish the site automatically

The Astro config auto-detects whether the repository is a user site like `username.github.io` or a project site like `my-blog`, and sets the correct base path during GitHub Actions.

## Notes on robustness

This project is designed to stay maintainable over time:

- content is file-based and version-controlled
- public delivery stays static
- the Studio avoids backend lock-in
- section routing is data-driven
- visual design is centralized in one global stylesheet

## Recommended next steps

- Replace placeholder social links in `src/config/site.ts`
- Run `npm install`
- Run `npm run dev`
- Test the Studio by publishing a sample post
- Push to GitHub and let the action deploy it
