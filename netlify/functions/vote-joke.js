import { getStore } from "@netlify/blobs";

const KEY = "all";

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

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return new Response("Bad Request", { status: 400 });

  const store = getStore("joke-repo");

  await updateWithRetry(store, (all) => {
    const j = all[id];
    if (!j || j.deleted === true) return all;
    all[id] = { ...j, score: (j.score || 0) + 1 };
    return all;
  });

  return new Response("OK", { status: 200 });
};