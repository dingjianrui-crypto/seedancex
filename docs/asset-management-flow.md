# Managed Asset Flow

The application uses one deployment-level Volcengine Asset Group. The group is
created manually and configured through server-only environment variables.

## Required Configuration

```env
VOLCENGINE_ACCESS_KEY_ID=
VOLCENGINE_SECRET_ACCESS_KEY=
VOLCENGINE_ASSET_GROUP_ID=
VOLCENGINE_PROJECT_NAME=default
VOLCENGINE_ASSET_HOST=ark.cn-beijing.volcengineapi.com
VOLCENGINE_ASSET_REGION=cn-beijing
```

`VOLCENGINE_PROJECT_NAME` must match the configured Asset Group and the project
used by the Seedance generation API key.

## Upload Flow

1. The user uploads an authorized image, video, or audio file from `/assets`.
2. `POST /api/assets` uploads the file to public blob storage.
3. The route calls Volcengine `CreateAsset` with the configured group and
   project.
4. The application stores the remote asset ID in PostgreSQL and returns only a
   local asset DTO to the browser.
5. The asset page polls while visible and calls `GetAsset` to reconcile
   `Processing`, `Active`, and `Failed` states.

The blob is intentionally retained for previews and creation-history snapshots.

## Generation Flow

The generation studio can mix direct URLs with managed assets. The browser
submits a local managed-asset ID. The server verifies ownership and `Active`
status, then resolves the value to the Volcengine URI format:

```text
asset://<remote-asset-id>
```

Remote asset IDs are not exposed to the browser.

## Portable Background Reconciliation

The application remains correct without a deployment-specific scheduler because
visible asset pages refresh processing records. Deployments that need proactive
reconciliation can invoke:

```text
POST /api/internal/assets/reconcile
Authorization: Bearer <ASSET_RECONCILE_SECRET>
```

Any scheduler can call this endpoint, including Linux cron, Kubernetes CronJob,
GitHub Actions, cloud schedulers, or Vercel Cron.
