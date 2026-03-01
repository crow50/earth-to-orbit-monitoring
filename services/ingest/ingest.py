#!/usr/bin/env python3
import os
import requests
import psycopg2
from psycopg2.extras import execute_values
import time

LL_API = os.environ.get("LL_API_URL", "https://lldev.thespacedevs.com/2.3.0/launches/")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://rl:rlpass@db:5432/rocket_launch")

def init_db(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS launches (
                id TEXT PRIMARY KEY,
                name TEXT,
                net TIMESTAMPTZ,
                status TEXT,
                pad TEXT,
                location_id INTEGER,
                last_updated TIMESTAMPTZ,
                notified_24h BOOLEAN DEFAULT FALSE,
                notified_1h BOOLEAN DEFAULT FALSE,
                notified_15m BOOLEAN DEFAULT FALSE
            );
        """)
    conn.commit()

def fetch_launches(url):
    print(f"Fetching from {url}...")
    r = requests.get(url)
    r.raise_for_status()
    return r.json()

def upsert_launches(conn, launches):
    with conn.cursor() as cur:
        data = []
        for l in launches:
            data.append((
                l['id'],
                l['name'],
                l['net'],
                l['status']['name'] if l.get('status') else None,
                l['pad']['name'] if l.get('pad') else None,
                l['pad']['location']['id'] if l.get('pad') and l['pad'].get('location') else None,
                l['last_updated']
            ))
        
        execute_values(cur, """
            INSERT INTO launches (id, name, net, status, pad, location_id, last_updated)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                net = EXCLUDED.net,
                status = EXCLUDED.status,
                pad = EXCLUDED.pad,
                location_id = EXCLUDED.location_id,
                last_updated = EXCLUDED.last_updated;
        """, data)
    conn.commit()

def main():
    print("Starting ingest service...")
    
    # Wait for DB
    conn = None
    for i in range(10):
        try:
            conn = psycopg2.connect(DATABASE_URL)
            break
        except Exception as e:
            print(f"Waiting for DB... {e}")
            time.sleep(2)
    
    if not conn:
        print("Could not connect to DB")
        return

    init_db(conn)

    url = LL_API
    pages_to_fetch = 2
    for _ in range(pages_to_fetch):
        if not url:
            break
        data = fetch_launches(url)
        results = data.get("results", [])
        print(f"Upserting {len(results)} launches...")
        upsert_launches(conn, results)
        url = data.get("next")
        # Small delay to be nice to the dev API
        time.sleep(1)

    print("Ingest complete.")
    conn.close()

if __name__ == '__main__':
    main()
