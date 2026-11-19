import { AsyncLocalStorage } from 'node:async_hooks';

// One delivery context per Messenger event, including its asynchronous callbacks.
const runs = new AsyncLocalStorage();
export const currentRun = () => runs.getStore();
export const withBotRun = (run, work) => runs.run(run, work);
export class ConversationPaused extends Error {
  constructor() { super('Trạng thái trả lời tự động của khách đã thay đổi.'); }
}
export async function requireActive() {
  const run = currentRun();
  if (run && !await run.isActive()) throw new ConversationPaused();
}
