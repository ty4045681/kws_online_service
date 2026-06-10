import { useEffect, useRef } from "react";
import type {
  WaveHistorySnapshot,
  WaveSlice,
  WaveSliceState,
} from "../audio/waveHistory";

interface WaveformCanvasProps {
  history: WaveHistorySnapshot;
  label: string;
}

const visuals: Record<
  WaveSliceState,
  { alpha: number; saturation: number; glow: number }
> = {
  idle: { alpha: 0.38, saturation: 0.72, glow: 0 },
  partial: { alpha: 1, saturation: 1.1, glow: 10 },
  expired: { alpha: 0.13, saturation: 0.1, glow: 0 },
  detected: { alpha: 1, saturation: 1.18, glow: 16 },
};

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function centroidHue(centroid: number): number {
  const normalized = clamp(
    (Math.log2(Math.max(80, centroid)) - Math.log2(80)) /
      (Math.log2(8000) - Math.log2(80)),
  );
  return (260 - normalized * 290 + 360) % 360;
}

function amplitudeHeight(rms: number, height: number): number {
  const decibels = 20 * Math.log10(Math.max(0.0001, rms));
  const normalized = clamp((decibels + 60) / 54);
  return 8 + Math.pow(normalized, 0.7) * height * 0.7;
}

function visualFor(slice: WaveSlice, now: number) {
  if (slice.state !== "expired") {
    return visuals[slice.state];
  }
  const amount = clamp((now - slice.stateChangedAt) / 430);
  return {
    alpha: 1 + (visuals.expired.alpha - 1) * amount,
    saturation: 1.1 + (visuals.expired.saturation - 1.1) * amount,
    glow: 10 * (1 - amount),
  };
}

export function WaveformCanvas({ history, label }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef(history);
  historyRef.current = history;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    let lastReducedDraw = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      if (!reducedMotion.matches || now - lastReducedDraw > 120) {
        lastReducedDraw = now;
        drawWaveform(context, width, height, historyRef.current, now, reducedMotion.matches);
      }
      animationFrame = window.requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div className="waveform-shell">
      <div className="waveform-grid" />
      <span className="frequency-label frequency-label--high">HIGH</span>
      <span className="frequency-label frequency-label--mid">MID</span>
      <span className="frequency-label frequency-label--low">LOW</span>
      <canvas ref={canvasRef} role="img" aria-label={label} />
      <div className="waveform-legend">
        <span>12 秒历史</span>
        <div className="spectrum-gradient" aria-hidden="true" />
        <span>频谱质心</span>
      </div>
    </div>
  );
}

function drawWaveform(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  history: WaveHistorySnapshot,
  now: number,
  reducedMotion: boolean,
): void {
  context.clearRect(0, 0, width, height);
  const center = height / 2;
  const drawableHeight = Math.max(20, height - 28);
  const spacing = width < 600 ? 4 : 5;
  const barWidth = width < 600 ? 2 : 2.5;
  const barCount = Math.max(1, Math.floor(width / spacing));
  const slices = history.slices;
  const latestEnd = slices.at(-1)?.endSample ?? history.sampleRate * history.durationSeconds;
  const earliestSample = latestEnd - history.sampleRate * history.durationSeconds;
  const sampleSpan = history.sampleRate * history.durationSeconds;
  const detectedSlices = slices.filter((slice) => slice.state === "detected");
  const detectedStart = detectedSlices[0]?.startSample ?? 0;
  const detectedEnd = detectedSlices.at(-1)?.endSample ?? 1;
  let sliceIndex = 0;

  context.save();
  context.beginPath();
  context.moveTo(0, center + 0.5);
  context.lineTo(width, center + 0.5);
  context.strokeStyle = "rgba(148, 180, 225, 0.1)";
  context.stroke();

  for (let index = 0; index < barCount; index += 1) {
    const progress = index / Math.max(1, barCount - 1);
    const sample = earliestSample + sampleSpan * progress;
    while (sliceIndex < slices.length - 1 && slices[sliceIndex].endSample < sample) {
      sliceIndex += 1;
    }
    const slice = slices[sliceIndex];
    const hasFrame =
      slice !== undefined && sample >= slice.startSample && sample <= slice.endSample;
    const idleMotion = reducedMotion ? 0 : Math.sin(now / 430 + index * 0.29) * 0.5 + 0.5;
    const rms = hasFrame ? slice.rms : 0.0018 + idleMotion * 0.0014;
    const centroid = hasFrame ? slice.centroid : 140 + progress * 5200;
    const state = hasFrame ? slice.state : "idle";
    const visual = hasFrame ? visualFor(slice, now) : visuals.idle;
    const hue = centroidHue(centroid);
    const barHeight = amplitudeHeight(rms, drawableHeight);
    const x = index * spacing + (spacing - barWidth) / 2;
    let lightness = 61;
    let alpha = visual.alpha;
    let saturation = Math.round(88 * visual.saturation);
    let glow = visual.glow;

    if (state === "detected" && hasFrame) {
      const rangeProgress =
        (slice.startSample - detectedStart) / Math.max(1, detectedEnd - detectedStart);
      const sweep = reducedMotion
        ? 0.5
        : clamp((now - slice.stateChangedAt) / 900) * 1.35 - 0.18;
      const distance = Math.abs(rangeProgress - sweep);
      if (distance < 0.09) {
        const intensity = 1 - distance / 0.09;
        lightness = 68 + intensity * 26;
        saturation = Math.max(28, saturation - intensity * 72);
        glow = 16 + intensity * 12;
        alpha = 1;
      }
    }

    context.shadowBlur = glow;
    context.shadowColor = `hsla(${hue} ${Math.min(100, saturation)}% 64% / ${alpha})`;
    const gradient = context.createLinearGradient(0, center - barHeight / 2, 0, center + barHeight / 2);
    gradient.addColorStop(
      0,
      `hsla(${(hue + 24) % 360} ${Math.min(100, saturation + 6)}% ${Math.min(96, lightness + 8)}% / ${alpha})`,
    );
    gradient.addColorStop(
      1,
      `hsla(${hue} ${Math.min(100, saturation)}% ${lightness}% / ${alpha})`,
    );
    context.fillStyle = gradient;
    context.beginPath();
    context.roundRect(x, center - barHeight / 2, barWidth, barHeight, barWidth);
    context.fill();
  }
  context.restore();
}
