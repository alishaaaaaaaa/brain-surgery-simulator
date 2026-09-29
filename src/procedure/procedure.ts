import { sim } from '../config/sim';
import { events } from '../core/events';
import { STAGES, type Facts, type StageDef } from './stages';

export type StageStatus = 'locked' | 'current' | 'done';

export interface StageState {
  def: StageDef;
  status: StageStatus;
  /** Operation time (s) when the stage was completed. */
  completedAt: number | null;
  /** Per-subtask progress 0..1 (sticky subtasks never go back down). */
  progress: number[];
}

/**
 * Stage machine: evaluates the current stage's subtasks against the facts every frame.
 * When every subtask is done, the stage completes and — after a short pause — the next
 * stage unlocks. Only the current stage can complete; later goals already achieved
 * (e.g. arachnoid cut early) count as soon as their stage is reached.
 */
export class Procedure {
  readonly stages: StageState[];
  current = 0;
  private advanceTimer = -1;

  constructor(defs: StageDef[] = STAGES) {
    this.stages = defs.map((def, i) => ({
      def,
      status: i === 0 ? 'current' : 'locked',
      completedAt: null,
      progress: def.subtasks.map(() => 0),
    }));
  }

  get finished(): boolean {
    return this.current >= this.stages.length;
  }

  get currentStage(): StageState | null {
    return this.stages[this.current] ?? null;
  }

  /** Progress (0..1) of a stage: the mean of its subtasks. */
  stageProgress(i: number): number {
    const p = this.stages[i].progress;
    return p.reduce((a, b) => a + b, 0) / p.length;
  }

  /** Whole-procedure progress 0..1. */
  get overallProgress(): number {
    const done = this.stages.filter((s) => s.status === 'done').length;
    // A stage that just finished (waiting to advance) is already counted as done.
    const cur = this.currentStage;
    const partial = cur && cur.status === 'current' ? this.stageProgress(this.current) : 0;
    return (done + partial) / this.stages.length;
  }

  update(dt: number, facts: Facts, now: number): void {
    const stage = this.currentStage;
    if (!stage) return;

    if (this.advanceTimer >= 0) {
      this.advanceTimer -= dt;
      if (this.advanceTimer < 0) this.advance();
      return;
    }

    stage.def.subtasks.forEach((task, i) => {
      const p = Math.max(0, Math.min(1, task.progress(facts)));
      stage.progress[i] = task.live ? p : Math.max(stage.progress[i], p);
    });

    if (stage.progress.every((p) => p >= 1)) {
      stage.status = 'done';
      stage.completedAt = now;
      const next = this.current + 1 < this.stages.length ? this.current + 1 : null;
      events.emit('stageCompleted', { index: this.current, id: stage.def.id, time: now, next });
      this.advanceTimer = sim.procedure.advanceDelay;
    }
  }

  private advance(): void {
    this.current++;
    this.advanceTimer = -1;
    const next = this.currentStage;
    if (next) next.status = 'current';
  }
}
