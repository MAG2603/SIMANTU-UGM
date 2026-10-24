import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  if (process.env.NODE_ENV === "production" && process.env.SIMANTU_EMBEDDED_ELECTRON === "1") {
    return;
  }

  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function startServer(): Promise<number> {
  const app = express();
  const httpServer = createServer(app);

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    const start = Date.now();
    const reqPath = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (reqPath.startsWith("/api")) {
        let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        log(logLine);
      }
    });

    next();
  });

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (!(process.env.NODE_ENV === "production" && process.env.SIMANTU_EMBEDDED_ELECTRON === "1")) {
      console.error("Internal Server Error:", err);
    }

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const configuredPort = parseInt(process.env.PORT || "5000", 10);

  const listenOnPort = (port: number) => {
    return new Promise<number>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => {
        reject(error);
      };

      httpServer.once("error", onError);
      httpServer.listen(
        {
          port,
          host: "127.0.0.1",
        },
        () => {
          httpServer.off("error", onError);
          const address = httpServer.address();
          const activePort = typeof address === "object" && address ? address.port : port;
          log(`serving on port ${activePort}`);
          resolve(activePort);
        },
      );
    });
  };

  try {
    return await listenOnPort(configuredPort);
  } catch (error) {
    const shouldFallbackToRandomPort =
      process.env.SIMANTU_EMBEDDED_ELECTRON === "1" &&
      (error as NodeJS.ErrnoException)?.code === "EADDRINUSE";

    if (shouldFallbackToRandomPort) {
      log(`port ${configuredPort} in use, retrying with a random free port`, "express");
      return listenOnPort(0);
    }

    throw error;
  }
}

// Standalone server entry should auto-start, but the Electron main process
// manages embedded startup explicitly after wiring production environment vars.
if (process.env.SIMANTU_EMBEDDED_ELECTRON !== "1") {
  void startServer();
}
