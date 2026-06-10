export type WaveSliceState = "idle" | "partial" | "expired" | "detected";

export interface AnalysisFrame {
  startSample: number;
  endSample: number;
  rms: number;
  centroid: number;
}

export interface WaveSlice extends AnalysisFrame {
  state: WaveSliceState;
  revision: number;
  stateChangedAt: number;
}

export interface WaveHistorySnapshot {
  revision: number;
  durationSeconds: number;
  sampleRate: number;
  slices: readonly WaveSlice[];
}

interface RangeMark {
  startSample: number;
  endSample: number;
  state: Exclude<WaveSliceState, "idle">;
  revision: number;
  stateChangedAt: number;
}

const statePriority: Record<WaveSliceState, number> = {
  idle: 0,
  expired: 1,
  partial: 2,
  detected: 3,
};

export class WaveHistory {
  private readonly durationSeconds: number;
  private sampleRate: number;
  private marks: RangeMark[] = [];
  private snapshot: WaveHistorySnapshot;

  constructor(sampleRate = 16_000, durationSeconds = 12) {
    this.sampleRate = sampleRate;
    this.durationSeconds = durationSeconds;
    this.snapshot = {
      revision: 0,
      durationSeconds,
      sampleRate,
      slices: [],
    };
  }

  getSnapshot(): WaveHistorySnapshot {
    return this.snapshot;
  }

  setSampleRate(sampleRate: number): void {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0 || sampleRate === this.sampleRate) {
      return;
    }
    this.sampleRate = sampleRate;
    this.publish([...this.snapshot.slices]);
  }

  addAnalysisFrame(frame: AnalysisFrame, now = performance.now()): WaveHistorySnapshot {
    if (
      !Number.isFinite(frame.startSample) ||
      !Number.isFinite(frame.endSample) ||
      frame.endSample <= frame.startSample
    ) {
      return this.snapshot;
    }

    const latestEnd = Math.max(
      frame.endSample,
      this.snapshot.slices.at(-1)?.endSample ?? frame.endSample,
    );
    const minimumSample = latestEnd - this.sampleRate * this.durationSeconds;
    this.marks = this.marks.filter((mark) => mark.endSample >= minimumSample);

    const matchingMark = this.findMark(frame.startSample, frame.endSample);
    const slice: WaveSlice = {
      startSample: frame.startSample,
      endSample: frame.endSample,
      rms: Math.max(0, Number.isFinite(frame.rms) ? frame.rms : 0),
      centroid: Math.max(0, Number.isFinite(frame.centroid) ? frame.centroid : 0),
      state: matchingMark?.state ?? "idle",
      revision: matchingMark?.revision ?? 0,
      stateChangedAt: matchingMark?.stateChangedAt ?? now,
    };

    const slices = this.snapshot.slices
      .filter((existing) => existing.endSample >= minimumSample)
      .filter(
        (existing) =>
          existing.startSample !== slice.startSample || existing.endSample !== slice.endSample,
      );
    slices.push(slice);
    slices.sort((left, right) => left.startSample - right.startSample);
    return this.publish(slices);
  }

  markMatchingRange(
    startSample: number,
    endSample: number,
    state: Exclude<WaveSliceState, "idle">,
    revision: number,
    now = performance.now(),
  ): WaveHistorySnapshot {
    if (!Number.isFinite(startSample) || !Number.isFinite(endSample) || endSample <= startSample) {
      return this.snapshot;
    }

    const mark: RangeMark = {
      startSample,
      endSample,
      state,
      revision,
      stateChangedAt: now,
    };
    this.marks = [
      ...this.marks.filter(
        (existing) =>
          existing.revision !== revision ||
          existing.state === "detected" ||
          state === "detected",
      ),
      mark,
    ];

    const slices = this.snapshot.slices.map((slice) => {
      if (!rangesOverlap(slice.startSample, slice.endSample, startSample, endSample)) {
        return slice;
      }
      if (statePriority[state] < statePriority[slice.state] && state !== "expired") {
        return slice;
      }
      return { ...slice, state, revision, stateChangedAt: now };
    });
    return this.publish(slices);
  }

  expireActivePartial(now = performance.now()): WaveHistorySnapshot {
    const activeRevisions = new Set(
      this.snapshot.slices
        .filter((slice) => slice.state === "partial")
        .map((slice) => slice.revision),
    );
    if (activeRevisions.size === 0) {
      return this.snapshot;
    }

    const slices = this.snapshot.slices.map((slice) =>
      slice.state === "partial" && activeRevisions.has(slice.revision)
        ? { ...slice, state: "expired" as const, stateChangedAt: now }
        : slice,
    );
    this.marks = this.marks.map((mark) =>
      mark.state === "partial" && activeRevisions.has(mark.revision)
        ? { ...mark, state: "expired", stateChangedAt: now }
        : mark,
    );
    return this.publish(slices);
  }

  clear(): WaveHistorySnapshot {
    this.marks = [];
    return this.publish([]);
  }

  private findMark(startSample: number, endSample: number): RangeMark | undefined {
    return this.marks
      .filter((mark) => rangesOverlap(startSample, endSample, mark.startSample, mark.endSample))
      .sort((left, right) => {
        const priority = statePriority[right.state] - statePriority[left.state];
        return priority === 0 ? right.stateChangedAt - left.stateChangedAt : priority;
      })[0];
  }

  private publish(slices: WaveSlice[]): WaveHistorySnapshot {
    this.snapshot = {
      revision: this.snapshot.revision + 1,
      durationSeconds: this.durationSeconds,
      sampleRate: this.sampleRate,
      slices,
    };
    return this.snapshot;
  }
}

function rangesOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}
