import express, { type Express, type Request, type Response } from "express";
import { apiLimiter } from "./middleware/rateLimiter.js";
import authRouter    from "./routes/auth.js";
import tripsRouter   from "./routes/trips.js";
import walletsRouter from "./routes/wallets.js";
import lookupRouter  from "./routes/lookup.js";

const app: Express = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date() });
});

app.use("/api", apiLimiter);
app.use("/api/auth",    authRouter);
app.use("/api/trips",   tripsRouter);
app.use("/api/wallets", walletsRouter);
app.use("/api/lookup",  lookupRouter);

export default app;
