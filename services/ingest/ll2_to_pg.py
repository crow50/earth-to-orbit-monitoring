#!/usr/bin/env python3
import os
import sys
import json
import argparse
import requests
import psycopg2
import time
import csv
from datetime import datetime, timezone

def main():
    parser = argparse.ArgumentParser(description="Ingest LL2 launches to Postgres via staging + COPY")
    parser.add_argument("--dev", action="store_true", help="Use lldev endpoint")
    parser.add_argument("--dry-run", action="store_true", help="Write files, don't touch DB")
    parser.add_argument("--batch-size", type=int, default=50, help="Items per batch")
    args = parser.parse_args()

    api_url = os.environ.get("LL_API_URL")
    if not api_url:
        api_url = "https://lldev.thespacedevs.com/2.3.0" if args.dev else "https://ll.thespacedevs.com/2.3.0"
    
    db_url = os.environ.get("DATABASE_URL", "postgres://rl:rlpass@localhost:5432/rocket_launch")
    
    # Setup DB
    conn = None
    cur = None
    if not args.dry_run:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        with open(os.path.join(os.path.dirname(__file__), "sql", "create_staging.sql")) as f:
            cur.execute(f.read())
        conn.commit()
        
    next_url = f"{api_url}/launches/?limit={args.batch_size}"
    fetched_at = datetime.now(timezone.utc).isoformat()
    
    batch = []
    
    while next_url:
        print(f"Fetching {next_url}")
        retry = 0
        while retry < 3:
            try:
                resp = requests.get(next_url, timeout=10)
                resp.raise_for_status()
                data = resp.json()
                break
            except Exception as e:
                print(f"Error fetching: {e}")
                retry += 1
                time.sleep(2 ** retry)
        else:
            print("Max retries exceeded")
            sys.exit(1)
            
        results = data.get("results", [])
        if not results:
            break
            
        ndjson_file = f"/tmp/ll2_batch_{int(time.time())}.csv"
        with open(ndjson_file, "w", newline="") as f:
            writer = csv.writer(f)
            for item in results:
                raw_json = json.dumps(item)
                writer.writerow([raw_json, item['id'], fetched_at])
                batch.append(item)
                
        if not args.dry_run:
            cur.execute("TRUNCATE staging_launches;")
            with open(ndjson_file, "r") as f:
                cur.copy_expert("COPY staging_launches (raw, external_id, fetched_at) FROM STDIN WITH (FORMAT csv)", f)
            conn.commit()
            
            # Insert into launches
            # Assuming raw has 'id', 'name', 'net', 'status'->'name', 'pad'->'name', 'pad'->'location'->'id', 'last_updated'
            insert_sql = """
            INSERT INTO launches (id, name, net, status, pad, location_id, last_updated, notified_24h, notified_1h, notified_15m)
            SELECT 
                external_id,
                raw->>'name',
                (raw->>'net')::timestamptz,
                raw->'status'->>'name',
                raw->'pad'->>'name',
                (raw->'pad'->'location'->>'id')::int,
                (raw->>'last_updated')::timestamptz,
                false,
                false,
                false
            FROM staging_launches
            ON CONFLICT (id) DO NOTHING;
            """
            cur.execute(insert_sql)
            conn.commit()
            print(f"Processed batch of {len(results)} items")
            
            # Clean up staging table for next batch (optional, but good for pure staging)
            cur.execute("TRUNCATE staging_launches;")
            conn.commit()
            
        # For testing purposes, just do one page
        break
        # next_url = data.get("next")
        
    if cur:
        cur.close()
    if conn:
        conn.close()

if __name__ == "__main__":
    main()
