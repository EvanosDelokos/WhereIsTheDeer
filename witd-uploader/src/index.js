export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.pathname.slice(1);

    if (request.method === 'POST') {
      const data = await request.arrayBuffer();
      await env.WITD_BUCKET.put(key, data, {
        httpMetadata: { contentType: request.headers.get("content-type") || "application/octet-stream" }
      });
      return new Response("Upload complete", { status: 200 });
    }

    // GET = download
    const object = await env.WITD_BUCKET.get(key);
    if (!object) return new Response("File not found", { status: 404 });

    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000"
      }
    });
  }
};
