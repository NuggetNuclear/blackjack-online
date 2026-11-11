export type EntryAction = 'solo' | 'create' | 'join';
export type RoomErrorCode = 'nameRequired' | 'invalidRoomCode' | 'createFailed' | 'joinFailed' | 'roomNotFound' | 'hostLeft';
export type RoomError = { field: 'name' | 'roomCode' | 'connection'; code: RoomErrorCode };
export type ConnectionStatus = '' | 'connecting' | 'waitingForPlayers' | 'waitingForHost' | 'spectating' | 'joiningNextRound';

/** Acquired synchronously, before React commits the disabled button state. */
export class EntryGate {
  private generation = 0;
  private current: number | null = null;

  begin(): number | null {
    if (this.current !== null) return null;
    this.current = ++this.generation;
    return this.current;
  }

  isCurrent(attempt: number): boolean { return this.current === attempt; }

  finish(attempt: number): boolean {
    if (!this.isCurrent(attempt)) return false;
    this.current = null;
    return true;
  }

  cancel(): void { this.current = null; }
}
