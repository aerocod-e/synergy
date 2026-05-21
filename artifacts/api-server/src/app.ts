import express, { type Express, type Request, type Response } from "express";

const app: Express = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Only route in scope for this task
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date() });
});

export default app;
