export const FOURBALL_CAPACITY = 4;

type GroupMember = { id: string; fourballId: string | null };

export function canScoreFor(actor: GroupMember, target: GroupMember) {
  return (
    actor.id === target.id ||
    (actor.fourballId !== null && actor.fourballId === target.fourballId)
  );
}

export function inTeeOrder<T extends { number: number }>(holes: T[], startingHole: number) {
  const ordered = [...holes].sort((a, b) => a.number - b.number);
  const start = ordered.findIndex((hole) => hole.number === startingHole);
  return start > 0 ? [...ordered.slice(start), ...ordered.slice(0, start)] : ordered;
}
