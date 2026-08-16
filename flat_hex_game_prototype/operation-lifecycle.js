export function createOperationLifecycle() {
  let generation = 0;

  return {
    begin() {
      const operationGeneration = generation;
      return {
        isCurrent() {
          return operationGeneration === generation;
        }
      };
    },
    invalidate() {
      generation += 1;
    }
  };
}

export async function commitWhenCurrent(operation, pending, commit) {
  if (!operation || typeof operation.isCurrent !== 'function') {
    throw new TypeError('operation must provide isCurrent()');
  }
  if (typeof commit !== 'function') throw new TypeError('commit must be a function');
  await pending;
  if (!operation.isCurrent()) return false;
  commit();
  return true;
}
