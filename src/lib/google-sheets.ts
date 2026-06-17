// Pushes the production order export to a Google Sheet via an Apps Script web
// app bound to that sheet. Server-only. We POST the full grid + a shared secret;
// the script verifies the secret and full-replaces the data + "Sync status" tabs
// (so all the sheet mechanics live in the script). Config is read lazily so an
// un-set integration never breaks the build or unrelated requests.
//
// Reliability: transient failures (network, 429/5xx) are retried with backoff.
// Each push is a full replace, so a failed run is fully corrected by the next.

import "server-only";

export type Cell = string | number;

type Config = { url: string; secret: string };

// The data tab name is configurable; the freshness tab is fixed in the script.
export function sheetsTabName(): string {
  return process.env.GOOGLE_SHEETS_TAB?.trim() || "Orders";
}

function readConfig(): Config | null {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  const secret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET?.trim();
  if (!url || !secret) return null;
  return { url, secret };
}

export function sheetsConfigured(): boolean {
  return readConfig() !== null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Send the full export to the sheet's Apps Script web app. Returns the row count
// the script reports written. Throws on a non-retriable error / exhausted retries.
export async function pushToSheet(payload: {
  tab: string;
  values: Cell[][]; // header row + data rows
  syncedAt: string; // ISO timestamp, stamped into the sheet's Sync status tab
}): Promise<{ rows: number }> {
  const cfg = readConfig();
  if (!cfg) {
    throw new Error(
      "Google Sheets is not configured (set GOOGLE_SHEETS_WEBHOOK_URL + GOOGLE_SHEETS_WEBHOOK_SECRET).",
    );
  }

  const backoff = [400, 1200, 3000];
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: cfg.secret, ...payload }),
        // Apps Script /exec 302-redirects to googleusercontent.com to serve the
        // response — follow it to read the script's JSON result.
        redirect: "follow",
      });
    } catch (err) {
      if (attempt < backoff.length) {
        await sleep(backoff[attempt]);
        continue;
      }
      throw err instanceof Error ? err : new Error("Network error calling the Sheet.");
    }

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      const retriable = res.status === 429 || res.status >= 500;
      if (retriable && attempt < backoff.length) {
        await sleep(backoff[attempt]);
        continue;
      }
      throw new Error(`Sheet web app ${res.status}: ${text.slice(0, 300)}`);
    }

    let parsed: { ok?: boolean; rows?: number; error?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON 200 — treat as success (older script versions), fall through.
    }
    if (parsed.ok === false) {
      throw new Error(parsed.error || "The Sheet script rejected the request.");
    }
    return {
      rows:
        typeof parsed.rows === "number"
          ? parsed.rows
          : Math.max(0, payload.values.length - 1),
    };
  }
}
