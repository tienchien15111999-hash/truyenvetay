// Deadline covers connection + response body. Abort cancels the losing request.
export function timeoutSetting(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n >= 100 && n <= 60000 ? n : fallback;
}

export async function withDeadline(ms, task) {
  const controller = new AbortController();
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`AI vượt thời gian chờ ${ms}ms`);
      error.name = 'TimeoutError';
      controller.abort(error);
      reject(error);
    }, ms);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => task(controller.signal)), expired]);
  } finally {
    clearTimeout(timer);
  }
}
