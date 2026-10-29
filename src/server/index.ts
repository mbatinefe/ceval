export default {
  fetch(): Response {
    return new Response("Ceval is being prepared.\n", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  },
} satisfies ExportedHandler<Env>;
