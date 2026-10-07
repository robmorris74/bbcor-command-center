# BBCOR buyer research pipeline

The signed-in Buyer Center now combines private Firebase `notes` records with a public, source-backed research feed. It does not require a workbook to show initial prospects. Six organizations were checked against their official sites at initial recovery. These are research prospects, not confirmed buyers for BBCOR properties.

## Data boundaries and review

- Firebase remains the authority for private notes, property matches, priority, stages and approvals. Existing authentication and database rules are unchanged.
- `data/buyer-prospects.json` and `prospect-pipeline/sources.json` contain public business facts only. This repository is public. Never put property details, internal notes, workbooks, negotiations or credentials in either file.
- Feed records appear only inside the signed-in UI, but the underlying public company feed is public. Do not confuse the feed with Firebase's private records.
- Names, known aliases and official source domains are matched before adding candidates. Multiple matches block automatic attachment; resolve duplicate private records first.
- Feed changes are proposals. Clicking **Review and save source research** explicitly saves the displayed public research into Firebase with reviewer UID and timestamp. It preserves the latest private stage, notes, priority, all saved contacts, property match and other fields using a transaction.
- Source evidence alone does not establish funding, local interest, deal suitability or a confirmed sale list. All candidate matches start unconfirmed.
- The outreach hold is unchanged. There is no email, SMS, CRM sending or contact-provider integration. Neither workflow nor feed can approve or send outreach. Stage changes are internal recordkeeping.
- Failed checks retain last-known evidence and label it stale. Evidence older than 72 hours is also stale in the UI until rechecked. Stale research cannot be accepted using the source review button.

## Existing research recovered

The current `Fort_Scott_Buyer_Contacts_2026-10-01.xlsx` was recovered from the existing file collection. It contains 69 research rows; Sanders Capital Partners occurs twice, giving 68 company names. It was not published to this public repository. The Buyer Center workbook importer now merges repeated company rows, combines source URLs/property matches/qualification notes, matches existing identities and preserves internal workflow in transactions. The recovered workbook remains available for optional private historical import; it is no longer required for the live source feed.

Actual private Firebase records could not be inspected from repository access alone. Matching is performed against the signed-in user's live authorized records before source candidates are displayed or saved. No claim is made that the private database has been preloaded with all 68 historical organizations.

## Two-hour refresh

`.github/workflows/buyer-refresh.yml` runs at minute 17 every two hours (UTC), on manual dispatch, and initially when pipeline code reaches `main`. Scheduled GitHub runs are best effort and may be delayed. The workflow uses GitHub's automatically supplied `GITHUB_TOKEN`, with repository `contents: write`, to commit only public feed files. Concurrent updates never force push; a failed push is visible as a failed workflow and the next run starts from current `main`.

The dashboard fetches the current feed directly from `main` on raw.githubusercontent.com. This avoids relying on a GitHub Pages rebuild for bot-generated feed commits. **Refresh source feed** reloads it, and an open Buyer Center checks again every two hours. Authentication still comes from the existing Firebase app.

No Firebase service account, Firebase password, new database rules or hosting change is needed for this path. Background work never reads or writes private Firebase data; signed-in reviewers do that through existing permissions.

## Broader investor discovery: exact remaining secret

Add GitHub repository Actions secret **`BRAVE_SEARCH_API_KEY`**, containing an active Brave Search API subscription token. With that one optional secret, each run makes three bounded searches covering nationwide industrial buyers and Kansas/Missouri adaptive reuse developers. Results go into `data/buyer-discovery.json` and the dashboard's **Discovery review queue**. This queue is unverified and excluded from verified prospect counts.

To promote a discovery, verify that the URL is the company's official acquisition/strategy page, then add a registry entry in `prospect-pipeline/sources.json` with company, canonical domain, aliases where needed, buyer type, source URL, a short exact acquisition evidence phrase (under 25 words per source), a paraphrased fit reason, and qualification caveat. Keep all contact emails and phone numbers in private Firebase records; never publish them in the registry or feed. The next successful refresh adds the company to the source prospect feed. Search snippets never become verified profiles automatically; contact emails and phone numbers are never published.

If GitHub Actions is disabled, enable it for this repository. If organization policy disallows `contents: write`, allow that workflow permission or publish the generated feed manually; no personal token is required by design. Source sites that block the GitHub runner remain stale until their source entry is repaired or reviewed. The scheduler's first live run must be checked before treating recurring refresh as operational.

## Validation

```
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/buyer-core.test.cjs
node --check buyers.js
python3 prospect-pipeline/refresh.py
```

The first two commands use isolated fixtures. The final command performs live network checks and retains stale evidence on failure. Public source pages were independently reviewed during recovery; container HTTP fetching was blocked, so successful live fetches need confirmation in GitHub Actions. Unit checks cover identity reuse, explicit source review logic, preservation of concurrent notes/stages and source failure handling. The live sign-in page was inspected; authenticated UI testing requires an approved BBCOR session.
