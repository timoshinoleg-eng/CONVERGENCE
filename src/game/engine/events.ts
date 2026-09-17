/**
 * Adapted from ciefa/idle-game-template (MIT), src/game/events/bus.ts.
 * Kept intentionally tiny: domain events are collected during a mutation and
 * drained afterwards so UI/logging remain outside the simulation step.
 */
export interface DomainEvent {
  type: string;
  payload?: Record<string, unknown>;
}

export function createEventBuffer(): {
  emit: (event: DomainEvent) => void;
  drain: () => DomainEvent[];
} {
  const events: DomainEvent[] = [];
  return {
    emit(event) {
      events.push(event);
    },
    drain() {
      return events.splice(0, events.length);
    },
  };
}
