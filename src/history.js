// Rückgängig/Wiederholen über Schnappschüsse. Aufeinanderfolgende Änderungen mit gleichem Schlüssel
// (z. B. Tippen in einem Feld) werden zu einem Schritt zusammengefasst.

export class History {
  constructor({ limit = 100, window = 1200 } = {}) {
    this.limit = limit;
    this.window = window;
    this.stack = [];
    this.index = -1;
    this.lastKey = null;
    this.lastTime = 0;
  }

  reset(state) {
    this.stack = [structuredClone(state)];
    this.index = 0;
    this.lastKey = null;
    this.lastTime = 0;
  }

  push(state, key = null, now = Date.now()) {
    const snapshot = structuredClone(state);
    const merge = key !== null && key === this.lastKey && now - this.lastTime < this.window && this.index > 0;
    this.stack.length = this.index + 1; // Wiederholen-Zweig verwerfen
    if (merge) {
      this.stack[this.index] = snapshot;
    } else {
      this.stack.push(snapshot);
      if (this.stack.length > this.limit) this.stack.shift();
      this.index = this.stack.length - 1;
    }
    this.lastKey = key;
    this.lastTime = now;
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.stack.length - 1;
  }

  undo() {
    if (!this.canUndo) return null;
    this.index -= 1;
    this.lastKey = null;
    return structuredClone(this.stack[this.index]);
  }

  redo() {
    if (!this.canRedo) return null;
    this.index += 1;
    this.lastKey = null;
    return structuredClone(this.stack[this.index]);
  }
}
