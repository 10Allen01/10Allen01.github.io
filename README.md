# Allen

Allen is a cool-toned personal blog built with Astro. It includes a visual publishing Studio that writes markdown and images directly into your local repository, so you get a CMS-like workflow without introducing a backend.

## What this project includes

- A refined static blog with a calm ocean-inspired visual system
- Three content lanes: `journal`, `notes`, and `gallery`
- Content collections with strict frontmatter validation
- A local visual publishing Studio at `/studio/`
- Automatic section placement based on frontmatter
- RSS, static export support, and optional dual clearnet + onion hosting

## Why this architecture fits dual hosting

This site builds to static files. That means you can keep a simple public clearnet presence on GitHub Pages while also serving the same site from infrastructure you control through a Tor hidden service.

This project solves that by separating concerns cleanly:

- The **public site** is purely static and can be deployed to GitHub Pages for clearnet access
- The **private-controlled mirror** can be served separately as an onion service
- The **Studio** is a browser-based local tool that writes content files into the repo using the File System Access API
- After publishing locally, you **commit and push** the generated files to make them live

That gives you strong maintainability, portable content, and flexible hosting: public discoverability on clearnet, plus a privacy-oriented onion entry point for users who want it.

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

## Environment variables

Create a local `.env` file from `.env.example`.

For example:

```bash
PUBLIC_SITE_URL=http://localhost:4321
PUBLIC_BASE_PATH=/
PUBLIC_ONION_URL=
PUBLIC_ONION_LABEL=Onion Access
```

For GitHub Pages, `PUBLIC_SITE_URL` can be left to workflow auto-detection.

If you want the clearnet GitHub Pages site to expose a direct onion link, set `PUBLIC_ONION_URL` to your final `.onion` address.

If you want a custom button label, change `PUBLIC_ONION_LABEL`.

## Deployment to GitHub Pages

This repo includes `.github/workflows/deploy.yml`.

To deploy the clearnet site:

1. Push this project to GitHub
2. In GitHub, enable **Pages** and choose **GitHub Actions** as the source
3. Push to the `main` branch
4. GitHub Actions will build and publish the site automatically

The Astro config auto-detects whether the repository is a user site like `username.github.io` or a project site and sets the base path correctly during GitHub Actions.

## Build for onion self-hosting

Build a separate onion-targeted static site:

```bash
npm run build
```

After that, serve the generated `dist/` directory from your own server.

## Onion self-hosting

This repo includes example files under `deploy/onion/`:

- `deploy/onion/nginx.conf`
- `deploy/onion/torrc.example`

### What you need

- A Linux server, VPS, or always-on personal machine
- Nginx installed
- Tor installed
- This repo built with `npm run build`

### Step 1: Build the onion version of the site

Run:

```bash
npm install
set PUBLIC_SITE_URL=http://your-generated-address.onion
set PUBLIC_BASE_PATH=/
npm run build
```

### Step 2: Copy the built site to your server

Place the built files at:

```text
/var/www/allen/dist
```

### Step 3: Install the provided Nginx config

Use `deploy/onion/nginx.conf` as the server block.

It listens only on:

```text
127.0.0.1:8080
```

That means the web server is not publicly exposed by default. Tor will connect to it locally.

### Step 4: Install the provided Tor hidden service config

Use `deploy/onion/torrc.example` as the basis for your Tor config.

Important lines:

```text
HiddenServiceDir /var/lib/tor/allen_site/
HiddenServiceVersion 3
HiddenServicePort 80 127.0.0.1:8080
```

This tells Tor to:

- create a v3 onion service
- keep its keys in `/var/lib/tor/allen_site/`
- forward onion traffic to your local Nginx instance

### Step 5: Restart Tor and read your onion address

After Tor starts, it will create a hostname file such as:

```text
/var/lib/tor/allen_site/hostname
```

Read that file to get your `.onion` address.

This ensures canonical links, RSS, and metadata point at the onion address instead of the clearnet host.

## Dual clearnet + onion setup

If you want a setup more like a major service that offers both normal access and Tor access, do this:

1. Keep GitHub Pages for the public clearnet site
2. Build a second static output for the onion host using `PUBLIC_SITE_URL=http://your-address.onion`
3. Serve that second build from your own server through Tor
4. Set `PUBLIC_ONION_URL=http://your-address.onion` so the GitHub Pages site automatically shows the onion entry point

In practice, that means maintaining two builds if you want metadata and canonical URLs to match each host exactly.

### Enabling the onion link on GitHub Pages

In your GitHub repository settings, add these Actions variables:

- `PUBLIC_ONION_URL`
- `PUBLIC_ONION_LABEL`

After the next GitHub Pages build, the footer will automatically show the onion link if `PUBLIC_ONION_URL` is set.

## Minimizing GitHub Pages exposure without breaking features

This repo now keeps GitHub Pages support while also reducing avoidable browser-side leakage where possible without breaking normal site behavior.

Included hardening measures:

- strict `Referrer-Policy: no-referrer`
- restrictive CSP in the page head
- automatic stripping of common tracking query parameters
- automatic hardening of external links with `noopener` and `noreferrer`
- reduced visitor-side persistence for non-essential runtime state

These steps do not eliminate what a hosting provider can observe at the infrastructure layer, but they do reduce unnecessary browser-side disclosure and passive leakage.

## Important security note

An onion service can improve privacy and reduce trust in third-party hosting platforms, but it does not automatically make every part of the experience anonymous or safe.

You still need to manage:

- server hardening
- Tor service key protection
- update hygiene
- access logs
- admin access security
- local machine security if self-hosting from home

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
- Push to GitHub and let the action deploy the clearnet site
- Create your onion host separately and then set `PUBLIC_ONION_URL` so the clearnet site exposes the onion entry
