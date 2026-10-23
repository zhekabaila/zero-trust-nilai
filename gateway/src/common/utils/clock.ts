export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export class FixedClock implements Clock {
  constructor(private readonly at: Date) {}
  now(): Date {
    return new Date(this.at.getTime());
  }
}

export function offsetClock(base: Clock, offsetMs: number): Clock {
  return { now: () => new Date(base.now().getTime() + offsetMs) };
}
