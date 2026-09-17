# Releases

## Publish an update

Complete the one-time setup below and merge the workflows before your first release.
Use Node.js 24, Git, `zip`, and `unzip`. Start with committed changes on `main`,
already pushed to `origin/main`, then run one of:

```sh
./scripts/release.sh patch  # 1.0.0 -> 1.0.1
./scripts/release.sh minor  # 1.0.0 -> 1.1.0
./scripts/release.sh major  # 1.0.0 -> 2.0.0
```

The script fetches tags, checks the working tree and remote branch, runs tests,
commits the manifest version bump, creates an annotated `vX.Y.Z` tag, and pushes
the commit and tag atomically. It never force-pushes. Direct pushes to `main`
must be allowed for the releasing user.

The **Publish** workflow validates the tag and its ancestry on `main`, runs tests,
packages the extension, retains the ZIP as an Actions artifact, and submits it to
Chrome Web Store. A green workflow means submission succeeded, not necessarily
that review is complete. Chrome publishes after approval. Check the workflow
summary and the [developer dashboard](https://chrome.google.com/webstore/devconsole)
for review status. Avoid starting another release while one is under review.
GitHub serializes publishing jobs, but may replace older pending runs if multiple
tags are pushed while a release is running; rerun the desired run if needed.

## One-time service account setup

1. In [Google Cloud Console](https://console.cloud.google.com/), select a project
   you administer and enable **Chrome Web Store API** and **IAM Service Account
   Credentials API**.
2. Under **IAM & Admin → Service Accounts**, create `xchange-publisher` (or reuse
   the service account already linked to your Chrome publisher). It does not need
   project-wide editor or owner roles.
3. Grant the service account **Service Account Token Creator** on itself. This is
   required by the authentication action to generate an OAuth access token from
   the JSON key. In Google Cloud Shell, replace the project ID and run:

   ```sh
   RELEASE_PROJECT_ID='your-google-cloud-project-id'
   RELEASE_ACCOUNT="xchange-publisher@${RELEASE_PROJECT_ID}.iam.gserviceaccount.com"
   gcloud iam service-accounts add-iam-policy-binding "$RELEASE_ACCOUNT" \
     --project="$RELEASE_PROJECT_ID" \
     --member="serviceAccount:${RELEASE_ACCOUNT}" \
     --role=roles/iam.serviceAccountTokenCreator
   ```

4. Open that service account → **Keys → Add key → Create new key → JSON**.
   Download the key outside this repository.
5. In the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole),
   look for **Service account** in your publisher settings (**Publisher → Settings**;
   Google's service-account guide uses the older **Account** label). Link the
   email from the downloaded JSON key's **`client_email`** field, for example:

   ```json
   "client_email": "xchange-publisher@your-project.iam.gserviceaccount.com"
   ```

   You can also copy it from the **Email** column in
   [Google Cloud → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts).
   Paste only the email into this dashboard field. Chrome currently allows one
   linked service account per publisher; inspect any existing link first.
6. Copy the publisher ID from the publisher settings and the extension ID from the
   existing listing URL. Verify the published version: the repository starts at
   `1.0.0`; if the store is ahead, update and commit the manifest to that baseline
   before releasing. Resolve any pending review or staged update first.

In `ayeganyan/xchange` → **Settings → Secrets and variables → Actions**, configure:

| Setting | Name | Value |
| --- | --- | --- |
| Repository secret | `GCP_SERVICE_ACCOUNT_KEY` | Entire contents of the downloaded JSON key |
| Repository variable | `CWS_PUBLISHER_ID` | Chrome Web Store publisher ID |
| Repository variable | `CWS_EXTENSION_ID` | Existing extension ID |

Paste the JSON into the GitHub secret, not into a source file or workflow. You can
also upload it from a local file with GitHub CLI without printing the key:

```sh
gh secret set GCP_SERVICE_ACCOUNT_KEY --repo ayeganyan/xchange < /absolute/path/to/downloaded-key.json
```

The workflow obtains a temporary OAuth access token from this key, scoped to
`https://www.googleapis.com/auth/chromewebstore`. The service account email is read
from the JSON. No identity provider, `GCP_SERVICE_ACCOUNT` variable, or GitHub
`id-token` permission is needed. Allow a few minutes for IAM changes to propagate.

To rotate the key, create a new JSON key, replace the GitHub secret, then delete
its predecessor in Google Cloud after verifying authentication with the new key.
If you previously configured Workload Identity Federation solely for this release
workflow, its provider, service account binding, and GitHub variables are no longer
used; remove those dedicated resources when you no longer need them.

References: [Google's GitHub authentication action](https://github.com/google-github-actions/auth),
[Chrome service accounts](https://developer.chrome.com/docs/webstore/service-accounts),
[Chrome publishing API](https://developer.chrome.com/docs/webstore/using-api).

## Recovery

- **Local push failed:** the script retains the release commit and tag and prints
  the exact atomic push command to retry. Resolve network or branch permissions,
  then retry that command; do not run another version bump or move the tag.
- **Tests, packaging, or authentication failed:** fix the cause and rerun the failed
  workflow if the tagged source is correct. Source changes require a new version.
- **Upload/submission response was lost:** rerun the workflow. It skips a version
  already published or awaiting review. If only a draft was uploaded, it uploads
  the same tagged package again before submitting. The API does not reveal draft
  versions, so it cannot safely infer which draft to publish. If Google rejects
  re-uploading, inspect the draft in the dashboard rather than bypassing the check.
- **Upload still processing:** wait for it to finish, then rerun. Processing polls
  are bounded; failed or unknown states never proceed to submission.
- **A different submission, rejected/staged/cancelled submission, or newer published
  version exists:** inspect the developer dashboard. The workflow never cancels a
  review, publishes a staged item, or replaces an active submission automatically.

The workflows do not create GitHub Releases or change store listing metadata.
Keep release tags immutable. CI also runs tests and packaging on pull requests and
pushes to `main`, without publishing credentials.
