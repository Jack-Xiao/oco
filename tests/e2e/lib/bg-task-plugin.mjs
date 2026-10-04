// E2E-only OpenCode plugin (oco, runtime view M4 batch 2): gives a background `task` call the shape
// oh-my-openagent produces (metadata.backgroundTaskId + a `background_task_id:` output line) and adds a
// `background_output` tool that "retrieves" it. Loaded only by the mock test server config.
import crypto from "node:crypto";
// The vendored plugin package's zod (a workspace symlink, so it follows the lockfile's version).
import { z } from "../../../vendor/opencode/packages/plugin/node_modules/zod/index.js";

// In-memory store for dispatched background tasks
const bgTasks = new Map();

export default async function bgTaskPlugin(input, options) {
  return {
    tool: {
      background_output: {
        description: "Retrieve output from a background subagent task",
        args: {
          task_id: z.string().describe("The ID of the background task to retrieve"),
        },
        async execute(args, context) {
          const info = bgTasks.get(args.task_id) ?? {
            backgroundTaskId: args.task_id,
          };
          const meta = {
            backgroundTaskId: args.task_id,
            ...(info.agent ? { agent: info.agent } : {}),
            ...(info.description ? { description: info.description } : {}),
            ...(info.sessionId ? { sessionId: info.sessionId } : {}),
          };
          if (typeof context?.metadata === "function") {
            context.metadata({ metadata: meta });
          }
          return {
            // Same opening as oh-my-openagent's formatTaskResult; the runtime view counts only this as retrieved.
            output: "Task Result\n\nsubagent-ok",
            metadata: meta,
          };
        },
      },
    },
    "tool.execute.after": async (event, output) => {
      if (event.tool === "task" && event.args?.run_in_background === true) {
        const bgId = "bg_" + crypto.randomBytes(4).toString("hex");
        const sessionId = output.metadata?.sessionId;
        const agent = event.args.subagent_type;
        const description = event.args.description;

        output.metadata = {
          ...output.metadata,
          backgroundTaskId: bgId,
          ...(sessionId ? { sessionId } : {}),
          ...(agent ? { agent } : {}),
          ...(description ? { description } : {}),
          run_in_background: true,
        };

        output.output = (output.output ? output.output + "\n" : "") + `background_task_id: ${bgId}`;

        bgTasks.set(bgId, {
          backgroundTaskId: bgId,
          agent,
          description,
          sessionId,
        });
      }
    },
  };
}

export const server = bgTaskPlugin;
