const demoVideos = new Set([
  "/demo/walkthroughs/electronics-walkthrough.mp4",
  "/demo/walkthroughs/secondhand-walkthrough.mp4",
]);

export const isDemoVideo = (path: string) => demoVideos.has(path);

type ByteRange = { start: number; end: number };

function parseRange(value: string, size: number): ByteRange | null | false {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  // Multipart and malformed ranges can be ignored in favor of the full file.
  if (!match || (!match[1] && !match[2])) return null;
  if (size === 0) return false;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (suffix === 0) return false;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start >= size || start > end ? false : { start, end };
}

function matchesIfRange(value: string | null, headers: Headers): boolean {
  if (value === null) return true;
  if (value.startsWith('"')) return value === headers.get("ETag");
  if (value.startsWith("W/")) return false;
  const modified = headers.get("Last-Modified");
  const modifiedAt = Date.parse(modified ?? "");
  const servedAt = Date.parse(headers.get("Date") ?? "");
  // A modification date is usable as a strong validator only when old enough.
  return value === modified && servedAt - modifiedAt >= 60_000;
}

function sliceBytes(
  body: ReadableStream<Uint8Array>,
  { start, end }: ByteRange,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let offset = 0;
  const slice = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done)
              throw new Error("Demo video ended before its declared length.");
            const chunkStart = offset;
            offset += value.byteLength;
            if (offset <= start) continue;
            const bytes = value.subarray(
              Math.max(0, start - chunkStart),
              Math.min(value.byteLength, end + 1 - chunkStart),
            );
            controller.enqueue(bytes);
            if (offset > end) {
              await reader.cancel();
              controller.close();
            }
            return;
          }
        } catch (error) {
          controller.error(error);
          await reader.cancel(error).catch(() => {});
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
  // Workers derives Content-Length from the stream, not a manually set header.
  const fixed = new FixedLengthStream(end - start + 1);
  // pipeTo propagates failures and consumer cancellation to both streams.
  void slice.pipeTo(fixed.writable).catch(() => {});
  return fixed.readable;
}

export async function serveDemoVideo(
  request: Request,
  assets: Pick<Fetcher, "fetch">,
  fixtureByteLength?: number,
): Promise<Response> {
  if (!isDemoVideo(new URL(request.url).pathname))
    return new Response(null, { status: 404 });
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("Range");
  requestHeaders.delete("If-Range");
  requestHeaders.set("Accept-Encoding", "identity");
  const asset = await assets.fetch(
    new Request(request, { headers: requestHeaders }),
  );
  const headers = new Headers(asset.headers);
  if (asset.status === 200 || asset.status === 304)
    headers.set("Cache-Control", "public, max-age=3600");
  if (asset.status !== 200)
    return new Response(asset.body, { status: asset.status, headers });

  const length = headers.get("Content-Length");
  // ASSETS can omit this header internally even when its body has a known size.
  // Bundled fixture lengths are checked against the MP4 files in integration tests.
  const size =
    length === null
      ? (fixtureByteLength ?? NaN)
      : /^\d+$/.test(length)
        ? Number(length)
        : NaN;
  const encoding = headers.get("Content-Encoding");
  const canRange =
    size >= 0 &&
    Number.isSafeInteger(size) &&
    (!encoding || encoding === "identity");
  headers.set("Accept-Ranges", canRange ? "bytes" : "none");
  if (canRange) headers.set("Content-Length", String(size));
  const rangeHeader = request.headers.get("Range");
  const range =
    request.method === "GET" &&
    canRange &&
    rangeHeader &&
    matchesIfRange(request.headers.get("If-Range"), headers)
      ? parseRange(rangeHeader, size)
      : null;

  if (range === false) {
    await asset.body?.cancel();
    headers.set("Content-Range", `bytes */${size}`);
    headers.set("Content-Length", "0");
    headers.set("Cache-Control", "no-store");
    return new Response(null, { status: 416, headers });
  }
  if (!range || !asset.body)
    return new Response(asset.body, { status: 200, headers });

  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  headers.set("Content-Length", String(range.end - range.start + 1));
  return new Response(sliceBytes(asset.body, range), { status: 206, headers });
}
