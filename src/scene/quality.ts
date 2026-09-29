/**
 * Adaptive resolution. Post-processing (depth of field, bloom) costs scale with pixel count,
 * so on slower GPUs the render resolution steps down until frames are smooth again, and
 * steps back up when there is headroom.
 */
export class AdaptiveQuality {
  private readonly levels: number[];
  private level: number;
  private avg = 16;
  private slowFor = 0;
  private fastFor = 0;

  constructor(
    private readonly apply: (pixelRatio: number) => void,
    maxRatio = Math.min(window.devicePixelRatio || 1, 2),
  ) {
    this.levels = [maxRatio, 1.5, 1.25, 1, 0.8].filter((r, i, a) => r <= maxRatio && a.indexOf(r) === i);
    this.level = 0;
  }

  get pixelRatio(): number {
    return this.levels[this.level];
  }

  /** `frameMs` is the wall-clock time of the last frame. */
  update(frameMs: number): void {
    // Ignore hitches (tab switches, shader compiles).
    if (frameMs > 250) return;
    this.avg += (frameMs - this.avg) * 0.05;
    const secs = frameMs / 1000;
    if (this.avg > 24) {
      this.slowFor += secs;
      this.fastFor = 0;
    } else if (this.avg < 13) {
      this.fastFor += secs;
      this.slowFor = 0;
    } else {
      this.slowFor = this.fastFor = 0;
    }
    if (this.slowFor > 2 && this.level < this.levels.length - 1) {
      this.level++;
      this.slowFor = 0;
      this.apply(this.pixelRatio);
    } else if (this.fastFor > 8 && this.level > 0) {
      this.level--;
      this.fastFor = 0;
      this.apply(this.pixelRatio);
    }
  }
}
