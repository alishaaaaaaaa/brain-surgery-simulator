import type { Camera, Group, Object3D, Scene, Vector3 } from 'three';
import type { Anatomy } from '../anatomy';
import type { AudioEngine } from '../audio/engine';
import type { StructureId, ToolId } from '../core/events';
import type { Fluids } from '../physics/fluids';
import type { I18nKey } from '../ui/i18n';
import type { Toasts } from '../ui/toast';

export interface PointerHit {
  point: Vector3;
  /** World-space surface normal, facing the camera. */
  normal: Vector3;
  object: Object3D;
  structure: StructureId;
  distance: number;
}

/** How a hovered structure relates to the active tool (drives the highlight colour). */
export type TargetClass = 'target' | 'caution' | null;

export interface ToolContext {
  scene: Scene;
  camera: Camera;
  anatomy: Anatomy;
  fluids: Fluids;
  audio: AudioEngine;
  toasts: Toasts;
  /** Container for objects tools leave in the field (clips, coagulation marks). */
  field: Group;
  /** Register/unregister extra pickable objects (e.g. placed clips). */
  addPickable(o: Object3D): void;
  removePickable(o: Object3D): void;
}

export interface Tool {
  readonly id: ToolId;
  /** Keyboard shortcut ('1'…'0'). */
  readonly key: string;
  readonly labelKey: I18nKey;
  readonly hintKey: I18nKey;
  /** The surgeon's hand holding it: instruments enter the field from that side. */
  readonly hand: 'left' | 'right';
  /** 3D cursor: tip at the origin, shaft along +Y. */
  readonly model: Object3D;
  /** Structures the tool reaches past when picking (e.g. the clip ignores adhesion strands). */
  readonly ignores?: ReadonlySet<StructureId>;
  /** Not fully functional until a later milestone (shown in the toolbar). */
  readonly comingIn?: 'M5';

  classify(hit: PointerHit): TargetClass;
  activate?(): void;
  deactivate?(): void;
  /** Left button pressed on the field. */
  down?(hit: PointerHit | null): void;
  /** Pointer moved while pressed. `moved` is the tip travel in mm since the last call. */
  drag?(hit: PointerHit | null, moved: number, dxPx: number, dyPx: number): void;
  up?(hit: PointerHit | null): void;
  /** Tool-specific keys; return true if handled. */
  keydown?(e: KeyboardEvent): boolean;
  /** Called every frame. */
  update?(dt: number, hit: PointerHit | null, pressed: boolean): void;
  /**
   * Custom cursor placement (e.g. clips align with the view instead of the surface).
   * Return false to hide the model.
   */
  placeModel?(hit: PointerHit | null, camera: Camera): boolean;
  /** Short live status line for the toolbar (e.g. clip rotation and depth). */
  status?(): string;
}
