/**
 * Small typed event bus. Modules (tools, procedure, vitals, audio, UI) communicate
 * through events so they stay decoupled. New events are added as milestones land.
 */
export interface SimEvents {
  started: void;
  languageChanged: { lang: string };
  heartbeat: { rate: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus<E> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, ...payload: E[K] extends void ? [] : [E[K]]): void {
    this.handlers.get(type)?.forEach((h) => (h as Handler<E[K]>)(payload[0] as E[K]));
  }
}

export const events = new EventBus<SimEvents>();
