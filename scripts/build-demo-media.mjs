import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../public/demo/", import.meta.url);
const scenes = [
  [
    "electronics-shelf",
    "The first shelf",
    "Portrait · gentle drift",
    "Labelled electronics",
    8,
    false,
    "drift",
  ],
  [
    "electronics-wide",
    "Across the aisle",
    "Landscape · return pass",
    "Repeat-product deduplication",
    16,
    true,
    "return",
  ],
  [
    "headphone-variants",
    "Almost the same",
    "Portrait · slow push",
    "Model variants and accessory confusion",
    12,
    false,
    "push",
  ],
  [
    "thrift-camera",
    "Secondhand find",
    "Portrait · close look",
    "Used item and body-only condition",
    12,
    false,
    "push",
  ],
  [
    "kitchen-appliances",
    "The home store",
    "Landscape · left to right",
    "Two products with shelf prices",
    16,
    true,
    "lateral",
  ],
  [
    "sneaker-shop",
    "A different fit",
    "Portrait · label detail",
    "Exact apparel SKU and size",
    12,
    false,
    "vertical",
  ],
  [
    "clothing-tag",
    "Read the tag",
    "Portrait · slow push",
    "Fictional garment; do not invent an exact match",
    12,
    false,
    "push",
  ],
  [
    "hardware-aisle",
    "Tools of the trade",
    "Landscape · left to right",
    "Kit versus tool accessories",
    16,
    true,
    "lateral",
  ],
  [
    "gaming-shelf",
    "Choose your console",
    "Landscape · right to left",
    "Console variants and nearby accessories",
    16,
    true,
    "reverse",
  ],
  [
    "unlabeled-objects",
    "No label, no guess",
    "Portrait · gentle drift",
    "Negative case: unknown exact product identity",
    12,
    false,
    "drift",
  ],
];
const clips = [];
for (const [
  id,
  title,
  description,
  scenario,
  seconds,
  wide,
  motion,
] of scenes) {
  const size = wide ? "1280x720" : "720x1280",
    frames = seconds * 24;
  const video =
    id === "electronics-shelf" ? "electronics-shelf-pan.mp4" : `${id}.mp4`;
  const x =
    motion === "lateral"
      ? `(iw-iw/zoom)*on/${frames - 1}`
      : motion === "reverse"
        ? `(iw-iw/zoom)*(1-on/${frames - 1})`
        : motion === "return"
          ? `(iw-iw/zoom)*(0.5-0.5*cos(2*PI*on/${frames}))`
          : "(iw-iw/zoom)/2";
  const y =
    motion === "vertical"
      ? `(ih-ih/zoom)*(0.2+0.6*on/${frames - 1})`
      : motion === "drift"
        ? `(ih-ih/zoom)*(0.5+0.2*sin(2*PI*on/${frames}))`
        : "(ih-ih/zoom)/2";
  const z =
    motion === "push"
      ? `1.04+0.12*on/${frames - 1}`
      : motion === "return"
        ? "1.22"
        : motion === "drift"
          ? `1.08+0.02*sin(2*PI*on/${frames})`
          : "1.16";
  if (id !== "electronics-shelf")
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      new URL(`${id}.png`, root).pathname,
      "-vf",
      `scale=2560:-2,zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${size}:fps=24,setsar=1,format=yuv420p`,
      "-frames:v",
      String(frames),
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-profile:v",
      "main",
      "-crf",
      "22",
      "-preset",
      "medium",
      "-movflags",
      "+faststart",
      "-an",
      new URL(video, root).pathname,
    ]);
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    new URL(video, root).pathname,
    "-frames:v",
    "1",
    "-vf",
    "scale=800:-2",
    "-q:v",
    "3",
    new URL(`${id}-poster.jpg`, root).pathname,
  ]);
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        new URL(video, root).pathname,
      ],
      { encoding: "utf8" },
    ),
  );
  const stream = probe.streams[0];
  if (
    stream.codec_name !== "h264" ||
    stream.pix_fmt !== "yuv420p" ||
    probe.streams.length !== 1 ||
    Math.abs(Number(probe.format.duration) - seconds) > 0.1
  )
    throw new Error(`Invalid clip: ${id}`);
  const bytes = readFileSync(new URL(video, root));
  if (bytes.indexOf("moov") > bytes.indexOf("mdat"))
    throw new Error(`Missing fast start: ${id}`);
  clips.push({
    id,
    title,
    description,
    scenario,
    image: `/demo/${id}.png`,
    poster: `/demo/${id}-poster.jpg`,
    video: `/demo/${video}`,
    seconds,
    width: stream.width,
    height: stream.height,
    fps: 24,
    audio: false,
    motion,
  });
  console.log(
    `${id}: ${stream.width}x${stream.height}, ${seconds}s, ${(bytes.length / 1048576).toFixed(2)} MB`,
  );
}
writeFileSync(
  new URL("manifest.json", root),
  JSON.stringify(
    {
      version: 2,
      synthetic: true,
      priceData:
        "All visible prices are fictional shelf labels, not live offers or verified market prices.",
      usage:
        "Display the synthetic-footage label. Feed frames through the real scanner. Scene descriptions are test cases, never recognition output or price evidence.",
      limitations: [
        "Packaging, product forms and printed text are synthetic approximations; inspect before using as an evaluation reference.",
        "These clips animate single generated stills with deterministic image-plane pans and zooms, not true handheld recordings or temporally generated scenes.",
        "No independent object motion, changing viewpoint, autofocus or real occlusion. Real camera and iPhone Safari validation is still required.",
        "These assets do not demonstrate recognition accuracy or current prices.",
      ],
      clips,
    },
    null,
    2,
  ) + "\n",
);
