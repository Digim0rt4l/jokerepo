import { getStore } from "@netlify/blobs";

export default async () => {
  const store = getStore("joke-repo");
  const all = (await store.get("all", { type: "json" })) || {};
  return new Response(JSON.stringify({ jokes: all, serverTime: Date.now() }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
};