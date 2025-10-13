type CB = (payload: any) => void;

export class EventBus {
  private map = new Map<string, CB[]>();

  on(event: string, cb: CB) {
    if (!this.map.has(event)) this.map.set(event, []);
    this.map.get(event)!.push(cb);
  }

  emit(event: string, payload?: any) {
    const cbs = this.map.get(event) ?? [];
    for (const cb of cbs) cb(payload);
  }

  off(event: string, cb: CB) {
    const cbs = this.map.get(event);
    if (!cbs) return;
    const index = cbs.indexOf(cb);
    if (index > -1) cbs.splice(index, 1);
  }

  clear() {
    this.map.clear();
  }
}
