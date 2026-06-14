import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import { apiLimiter } from "./middleware/rateLimiter.js";
import authRouter         from "./routes/auth.js";
import tripsRouter        from "./routes/trips.js";
import walletsRouter      from "./routes/wallets.js";
import lookupRouter       from "./routes/lookup.js";
import usersRouter        from "./routes/users.js";
import statesRouter       from "./routes/states.js";
import stakeholdersRouter from "./routes/stakeholders.js";
import pricingRouter      from "./routes/pricing.js";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date() });
});

app.use("/api", apiLimiter);
app.use("/api/auth",         authRouter);
app.use("/api/trips",        tripsRouter);
app.use("/api/wallets",      walletsRouter);
app.use("/api/lookup",       lookupRouter);
app.use("/api/users",        usersRouter);
app.use("/api/states",       statesRouter);
app.use("/api/stakeholders", stakeholdersRouter);
app.use("/api/pricing",      pricingRouter);

export default app;
