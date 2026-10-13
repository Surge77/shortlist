// A stand-in for the supabase-js client: every query-builder call is recorded, and the
// awaited query resolves to whatever the test queued for that table (or RPC/storage call).

export interface Reply {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

export interface Call {
  table: string;
  steps: [string, unknown[]][];
}

export function fakeSupabase() {
  const replies = new Map<string, Reply[]>();
  const calls: Call[] = [];

  function next(key: string): Required<Reply> {
    const queue = replies.get(key) ?? [];
    const reply = queue.shift() ?? {};
    return { data: reply.data ?? null, error: reply.error ?? null };
  }

  function builder(table: string) {
    const call: Call = { table, steps: [] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "insert", "update", "maybeSingle", "single"]) {
      chain[method] = (...args: unknown[]) => {
        call.steps.push([method, args]);
        return chain;
      };
    }
    chain.then = (resolve: (value: Required<Reply>) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(next(table)).then(resolve, reject);
    return chain;
  }

  const client = {
    from: builder,
    rpc: (name: string, args: unknown) => {
      calls.push({ table: `rpc:${name}`, steps: [["rpc", [args]]] });
      return Promise.resolve(next(`rpc:${name}`));
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (path: string, seconds: number) => {
          calls.push({ table: `storage:${bucket}`, steps: [["createSignedUrl", [path, seconds]]] });
          return Promise.resolve(next(`storage:${bucket}`));
        },
      }),
    },
  };

  return {
    client,
    calls,
    reply(key: string, reply: Reply) {
      replies.set(key, [...(replies.get(key) ?? []), reply]);
    },
  };
}
