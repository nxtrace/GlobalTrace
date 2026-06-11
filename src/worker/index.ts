import { handleRequest } from "./app";
import type { WorkerEnv } from "./env";

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    return handleRequest(request, env, ctx);
  },
};
