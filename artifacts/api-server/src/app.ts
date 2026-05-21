import express, { type Express, type Request, type Response } from "express";
import authRouter from "./routes/auth.js";

const app: Express = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date() });
});

app.use("/api/auth", authRouter);

export default app;
