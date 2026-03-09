# Database Schema

## launches

| Column | Type | Notes |
| --- | --- | --- |
| `id` | string | Launch Library 2 launch ID (primary key) |
| `name` | string | Mission name |
| `net` | timestamp | Launch date/time (NET) |
| `status` | string | Launch status name |
| `pad` | string | Launch pad name (denormalized, backward compat) |
| `pad_id` | integer | Launch Library 2 pad ID (normalized join to `pads`) |
| `location_id` | integer | Launch Library 2 location ID (join to `locations`) |
| `last_updated` | timestamp | Last update time from Launch Library 2 |
| `pad_location_name` | string | Raw location name from Launch Library (fallback) |
| `rocket_name` | string | Full rocket configuration name |
| `mission_description` | text | Mission summary text |
| `mission_type` | string | Mission type category |
| `notified_24h` | boolean | Porch alert sent at T-24h |
| `notified_1h` | boolean | Porch alert sent at T-1h |
| `notified_15m` | boolean | Porch alert sent at T-15m |

## locations

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer | Launch Library 2 location ID (primary key) |
| `name` | string | Spaceport / location name |
| `country_code` | string | Country code (if provided by LL2) |

## pads

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer | Launch Library 2 pad ID (primary key) |
| `name` | string | Pad name |
| `location_id` | integer | FK → `locations.id` |
| `latitude` | float | Pad latitude |
| `longitude` | float | Pad longitude |


## Ingest pattern (recommended)

The ingestion pipeline should follow a safe, idempotent pattern for bulk-loading historical data from LaunchLibrary (LL2):

1. Staging table (write buffer)
   - Create a permissive staging table without a UNIQUE constraint on `external_id`.
   - Example DDL (services/ingest/sql/create_staging.sql):
     ```sql
     CREATE TABLE IF NOT EXISTS staging_launches (
       raw JSONB,
       external_id TEXT,
       fetched_at TIMESTAMPTZ
     );
     ```
   - Optionally create a non-unique index for lookup performance:
     ```sql
     CREATE INDEX IF NOT EXISTS staging_launches_external_id_idx ON staging_launches(external_id);
     ```

2. Bulk load via COPY (CSV)
   - Postgres does not support `COPY ... WITH (FORMAT json)`. Instead, write each row as CSV where the first field is the JSON payload (properly escaped) and use:
     ```sql
     COPY staging_launches (raw, external_id, fetched_at) FROM STDIN WITH (FORMAT csv);
     ```
   - Use `psycopg2.copy_expert` to stream CSV data into Postgres without intermediate files for performance.

3. Deduplicate and insert into canonical table
   - After COPY completes, insert distinct rows into `launches` and use `ON CONFLICT DO NOTHING` to avoid duplicates:
     ```sql
     INSERT INTO launches (id, name, net, status, pad, location_id, last_updated, notified_24h, notified_1h, notified_15m)
     SELECT DISTINCT ON (external_id)
       external_id,
       raw->>'name',
       (raw->>'net')::timestamptz,
       raw->'status'->>'name',
       raw->'pad'->>'name',
       (raw->'pad'->'location'->>'id')::int,
       (raw->>'last_updated')::timestamptz,
       false, false, false
     FROM staging_launches
     ORDER BY external_id, fetched_at DESC
     ON CONFLICT (id) DO NOTHING;
     ```
   - This prefers the newest row per external_id and ensures idempotency.

4. Cleanup
   - Optionally truncate staging table between batches if you prefer per-batch processing:
     ```sql
     TRUNCATE staging_launches;
     ```
   - Alternatively, append batches and use time-windowed insertion.


## Migration ownership & conventions

- Owner: `services/poller` currently owns the `launches` schema migrations and contains Alembic versions related to the `launches` table.
- Add migrations: all schema changes to shared tables must be added as Alembic migrations under the owning service and applied with `alembic upgrade head` before running ingestion in an environment.
- Column naming: standardize on `notified_15m` (and `notified_1h`, `notified_24h`) for notification flags across services. If other code references `notified_5m`, update those references to the canonical name.


## Notes

- Use the LL2 development endpoint (`https://lldev.thespacedevs.com/2.3.0`) during development to avoid production rate limits.
- For very large historical imports, consider S3 staging of NDJSON and server-side COPY from files for performance and repeatability.

