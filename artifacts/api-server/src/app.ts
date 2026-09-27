import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { loadSession } from "./lib/auth";
import { errorHandler, notFound } from "./lib/http";
import { sameOriginWrites, securityHeaders } from "./middlewares/security";

const app: Express = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(securityHeaders);
const origins = (process.env["CORS_ORIGIN"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : false, credentials: true }));
app.use(express.json({ limit: "200kb" }));
app.use(cookieParser());
app.use(sameOriginWrites);
app.use("/api", loadSession, router);
app.use("/api", notFound);
app.use(errorHandler);

export default app;
