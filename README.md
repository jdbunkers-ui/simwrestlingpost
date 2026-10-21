# The SimWrestling Post — Classic Post website v1.0.0

Complete static HTML/CSS/JavaScript website for its own GitHub repository and
Vercel project. Requires the installed SimWrestling Post database v1.1.0.
The game website and game engine are unchanged. This archive contains real-data
application code, not the earlier sample-data design carousel.

## Deploy

1. Unzip this archive. Put the **contents** of its website folder at the root of
   a new GitHub repository, suggested name `simwrestling-post`. `index.html`,
   `vercel.json`, `css/`, `js/`, and `assets/` belong directly in the repository
   root. Avoid an extra nested folder unless you set Vercel's Root Directory to it.
2. Edit `js/config.js`. Copy the **values** of `supabaseUrl` and
   `supabasePublishableKey` from your currently deployed Sim Wrestling site's
   `js/config.js`. Keep this new file's `window.POST_CONFIG` object name.
   The archived v4.4.6 deployment supplied earlier contains placeholders, so this
   package cannot recover your actual live settings from that archive.
3. In your Supabase project, open its Data API settings / Exposed schemas list.
   **Add `public_simwrestlingpost` while retaining all existing entries.**
   Do not add `private_simwrestlingpost`. Your completed database installation
   already supplies the object permissions. No further database migration is
   required for this website.
4. In Vercel, create a **new project** and import the new repository. Use the
   **Other** framework preset, no build command, and output directory **`.`**.
   The included `vercel.json` selects this static output. Deploy from the folder
   containing `index.html`. No npm install, framework, or server is required.
5. Open the Vercel URL and check Rankings, Results, Schedule, Recruiting, and
   Opinion. Check a published article and leave a real comment only when you
   intend to publish that comment. Real submissions are approved immediately.

Use only your browser-safe Supabase publishable key or legacy **anon** key.
Never include a secret key, service-role key, or database password. Browser code
rejects known secret/service-role key formats. No private credentials are included.
For a custom Supabase API domain, also allow that exact HTTPS host in the
`connect-src` policy in `vercel.json`; the default permits `*.supabase.co`.

## Included experience

- Classic newspaper masthead, serif headlines, restrained navy/cream styling,
  responsive layout, and a dark-appearance counterpart.
- National college team Top 25, pound-for-pound Top 25, and independent Top 25
  weight-class lists. No regional/state/high-school ranking controls.
- Completed dual meets and dual team tournament results, with pagination.
- Individual tournament wrestler placements and final team standings.
- College season schedule, optionally filtered by week.
- Recruiting class rankings: **Coming Soon**.
- Frank Mercer, Marcus Bennett, and Eddie Callahan: approved portraits, writer
  profiles, prior publications and accomplishments supplied by the database.
- Writer archives in descending in-game publication order. Expand an article
  to fetch its text and comments; collapse it to return to the archive.
- Guest comments with optional display name, approved immediately by the
  installed database endpoint. Latest comments appear first; earlier comments
  remain accessible with the Earlier comments control.
- Existing team, wrestler, dual, tournament, and event detail pages open on
  `mainSiteUrl`, normally `https://simwrestling.com`.

The homepage is Rankings. The names in writer biographies are fictional game
characters. The website contains no seeded/sample rankings, articles, or comments.
If no articles are published, writer profiles appear with an empty archive message.
Before configuration, visitors see a preparation message and no backend calls run.

## Updates and comments

Every read targets `public_simwrestlingpost`, using the Data API schema headers.
The only write is `submit_editorial_comment`, accepting article ID, comment text,
and optional guest display name. Visitors cannot write articles, approve/hide
comments, or access private tables. Guest names are unverified display labels.

Coverage revalidates every 60 seconds while the page is visible, and on tab focus.
Comment submission refreshes the article's comment list immediately. Open articles
and comments refresh without destroying an unfinished reply. Database changes do
not require a GitHub commit or Vercel redeployment; code/config changes do.
Any refresh behavior of existing source views/caches still applies.

Moderate through `06_comment_moderation_examples.sql` in the database package:
`private_simwrestlingpost.f_set_comment_approval(comment_guid, false, reason)`
hides a comment; `true` restores it. The public website has no owner credentials
or moderation controls. A moderation action becomes visible on the next query
or the normal page refresh cycle. A withdrawn article cannot accept new comments.

Article text supports safely escaped paragraphs, headings, bold/italic text,
inline code, bullet lists, and block quotes. Raw HTML, embeds, images, and active
links in article Markdown are deliberately disabled. Guest comments are plain text.

## Verify after deployment

1. Edition date agrees with the current league clock.
2. Rankings agree with the installed publication views; ranking modifiers are
   still the neutral baseline selected for the foundation.
3. Recruiting reads Coming Soon.
4. All three portrait files load, including Marcus's black jacket/tie and Eddie's
   red pullover.
5. A saved DRAFT is absent; a PUBLISHED article appears under its writer.
6. A guest comment appears after successful submission.
7. Unapproving that comment removes it on refresh; reapproving restores it.

`VERIFICATION.json` records **36 passing DOM/API integration checks with simulated
publication responses**. They include filtering, pagination, article safety,
guest posting, moderation visibility, and preservation of unfinished replies.
The live Supabase connection and pixel layout in a real browser have not been
verified because the actual public project settings were not available here.

If you see the preparation message, finish `js/config.js`. If coverage fails,
check the browser console/network panel: `PGRST106` commonly indicates that the
publication schema has not been exposed; 401/403 indicates configuration or
permissions; timeouts require inspecting the underlying live publication query.
The site does not replace a failure with fabricated coverage.

Official setup references:
- https://supabase.com/docs/guides/api/using-custom-schemas
- https://vercel.com/docs/builds/configure-a-build

## Files

- `index.html`: publication shell and section navigation
- `css/post.css`: Classic Post layout and responsive styling
- `js/config.js`: public project settings
- `js/api.js`: read requests and guest comment submission
- `js/app.js`: live pages, articles, comments, and refresh behavior
- `assets/writers/`: the three approved fictional writer portraits
- `assets/favicon.svg`: typographic Post icon
- `vercel.json`: static deployment, cache, and security headers
- `VERIFICATION.json`: verification scope and passing checks

This package does not publish AI-written content automatically. Your existing
article-save workflow supplies editorials to the installed private schema.
