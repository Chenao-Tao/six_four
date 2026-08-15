export function createUndoHistory({ cloneState, limit = 100 }) {
  if (typeof cloneState !== 'function') {
    throw new TypeError('cloneState 必须是函数');
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('limit 必须是正整数');
  }

  const entries = [];

  return {
    push(state) {
      entries.push(cloneState(state));
      if (entries.length > limit) entries.shift();
    },
    undo() {
      const previousState = entries.pop();
      return previousState === undefined ? null : cloneState(previousState);
    },
    clear() {
      entries.length = 0;
    },
    get canUndo() {
      return entries.length > 0;
    },
    get size() {
      return entries.length;
    }
  };
}
