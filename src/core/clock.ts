/** Operation clock: seconds since the user pressed Start. */
export const clock = {
  running: false,
  elapsed: 0,
  tick(dt: number): void {
    if (this.running) this.elapsed += dt;
  },
};

/** mm:ss (or h:mm:ss) for the operation time. */
export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return hh ? `${hh}:${two(mm)}:${two(ss)}` : `${two(mm)}:${two(ss)}`;
}
