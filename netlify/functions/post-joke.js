import { getStore } from "@netlify/blobs";

const MAX_JOKES = 5000;
const KEY = "all";

function isLive(j) {
  return j && j.deleted !== true && typeof j.text === "string" && j.text.trim().length > 0;
}

function pickPruneTarget(entries) {
  const live = entries.filter(([_, j]) => isLive(j));
  const zero = live
    .filter(([_, j]) => (j.score || 0) === 0)
    .sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
  if (zero[0]) return zero[0][0];

  const lowest = live
    .sort((a, b) => {
      const sa = a[1].score || 0;
      const sb = b[1].score || 0;
      if (sa !== sb) return sa - sb;
      return (a[1].ts || 0) - (b[1].ts || 0);
    })[0];

  return lowest ? lowest[0] : null;
}

async function updateWithRetry(store, mutator, tries = 8) {
  let lastError = null;

  for (let i = 0; i < tries; i++) {
    const current = await store.getWithMetadata(KEY, { type: "json" });
    const data = (current && current.data) || {};
    const etag = current && current.etag;

    const next = mutator(structuredClone(data));
    if (!next) return { ok: false };

    try {
      if (etag) {
        await store.set(KEY, JSON.stringify(next), { onlyIfMatch: etag });
      } else {
        await store.set(KEY, JSON.stringify(next), { onlyIfNew: true });
      }
      return { ok: true };
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error("Failed to update store");
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 2500) return new Response("Bad Request", { status: 400 });

  const id =
    (globalThis.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    `j_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;

  const store = getStore("joke-repo");

  await updateWithRetry(store, (all) => {
    const entries = Object.entries(all);
    const liveCount = entries.filter(([_, j]) => isLive(j)).length;

    if (liveCount >= MAX_JOKES) {
      const pruneId = pickPruneTarget(entries);
      if (pruneId) {
        all[pruneId] = { ...(all[pruneId] || {}), deleted: true, deletedAt: Date.now() };
      }
    }

    all[id] = { text, score: 0, ts: Date.now() };
    return all;
  });

  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
};