import { Command } from "@commander-js/extra-typings";
import { invoke } from "./executor";
import { v4 as uuidv4 } from "uuid";
import { log, setDebugLogging } from "./log";
import os from "node:os";
import express, { Request, Response } from "express";

const DEFAULT_PORT = 3002;

async function startServer(port: number, debug: boolean, tempdir: string) {
  setDebugLogging(debug);
  const app = express();
  app.use(express.json({ limit: "16mb" }));

  // Override os.tmpdir to use the provided tempdir
  os.tmpdir = () => tempdir;
  log(`Node executor using tempdir: ${tempdir}`);

  // Add health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.post("/invoke", async (req: Request, res: Response) => {
    try {
      const request = req.body;
      request.requestId = uuidv4();

      // Set up streaming response
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Transfer-Encoding", "chunked");

      await invoke(request, res);
    } catch (err: any) {
      // If we haven't written anything yet, send an error response
      if (!res.headersSent) {
        res.status(500).json({
          type: "error",
          message: err.message || "Internal server error",
        });
      } else {
        // If we've already started streaming, try to write an error line
        res.write(
          JSON.stringify({
            type: "error",
            message: err.message || "Internal server error",
          }) + "\n",
        );
      }
    } finally {
      res.end();
    }
  });

  app.listen(port, () => {
    log(`Node executor server listening on port ${port}`);
  });
}

const program = new Command();
program
  .name("node-executor")
  .description(
    "node-executor runs an HTTP server for executing actions locally",
  )
  .usage("command [options]")
  .option("--debug", "print debug output", false)
  .option("--port <number>", "port to listen on", DEFAULT_PORT.toString())
  .option(
    "--tempdir <path>",
    "temporary directory to use for downloading code and dependencies",
    "",
  )
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    await startServer(port, options.debug, options.tempdir);
  });

program.parseAsync(process.argv);
