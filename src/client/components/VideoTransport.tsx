import { useEffect, useState, type RefObject } from "react";
import { RotateCcw, SkipBack, SkipForward } from "lucide-react";

const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function VideoTransport({
  video,
  sourceKey,
  onPlay,
}: {
  video: RefObject<HTMLVideoElement | null>;
  sourceKey: string;
  onPlay: () => void;
}) {
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const update = () => {
      setPosition(element.currentTime || 0);
      setDuration(Number.isFinite(element.duration) ? element.duration : 0);
    };
    const events = [
      "timeupdate",
      "loadedmetadata",
      "durationchange",
      "emptied",
    ];
    events.forEach((event) => element.addEventListener(event, update));
    update();
    return () =>
      events.forEach((event) => element.removeEventListener(event, update));
  }, [video, sourceKey]);
  function seek(value: number) {
    if (!video.current || !duration) return;
    video.current.currentTime = Math.max(0, Math.min(duration, value));
    setPosition(video.current.currentTime);
  }
  return (
    <div className="video-transport" role="group" aria-label="Video playback">
      <button
        aria-label="Back 10 seconds"
        onClick={() => seek(position - 10)}
        disabled={!duration}
      >
        <SkipBack aria-hidden="true" />
      </button>
      <label className="video-timeline">
        <span className="sr-only">Video position</span>
        <input
          aria-label="Video position"
          type="range"
          min="0"
          max={duration || 1}
          step="0.1"
          value={Math.min(position, duration)}
          disabled={!duration}
          onChange={(event) => seek(event.currentTarget.valueAsNumber)}
          aria-valuetext={`${time(position)} of ${time(duration)}`}
        />
        <span aria-hidden="true">
          {time(position)} / {time(duration)}
        </span>
      </label>
      <button
        aria-label="Forward 10 seconds"
        onClick={() => seek(position + 10)}
        disabled={!duration}
      >
        <SkipForward aria-hidden="true" />
      </button>
      <button
        aria-label="Replay video"
        onClick={() => {
          seek(0);
          onPlay();
        }}
        disabled={!duration}
      >
        <RotateCcw aria-hidden="true" />
      </button>
    </div>
  );
}
