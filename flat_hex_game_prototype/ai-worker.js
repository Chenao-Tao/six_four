import { iterativeGameSearch } from './game.js?v=queen-step-3';

self.addEventListener('message', event => {
  const request = event.data;
  if (request?.type !== 'search' || !Number.isInteger(request.searchId)) return;
  const { searchId, state, options } = request;
  let finalResult = null;
  try {
    for (const result of iterativeGameSearch(state, options)) {
      finalResult = result;
      self.postMessage({ type: 'progress', searchId, result });
    }
    self.postMessage({ type: 'complete', searchId, result: finalResult });
  } catch (error) {
    self.postMessage({
      type: 'error',
      searchId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});
