#!/usr/bin/env python3
"""
Placeholder ingest worker.
- Uses the Launch Library dev endpoint by default (no rate limits).
- Replace with staged bulk import and DB COPY for production imports.
"""
import os
import requests

LL_API = os.environ.get("LL_API_URL", "https://lldev.thespacedevs.com/2.3.0")

def fetch_launches_page(url):
    r = requests.get(url)
    r.raise_for_status()
    return r.json()


def main():
    launches_url = f"{LL_API}/launch/"
    print("Ingest placeholder: fetching sample page from LL dev endpoint ->", launches_url)
    try:
        data = fetch_launches_page(launches_url)
        print("Keys on response:", list(data.keys()))
        print("Results sample count:", len(data.get("results", [])))
    except Exception as e:
        print("Error fetching launches:", e)

if __name__ == '__main__':
    main()
