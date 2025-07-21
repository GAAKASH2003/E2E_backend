import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import alertsRoutes from "./routes/alerts";
import tripRoutes from "./routes/trips";
const app = express();
app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/api/dashboard/alerts", alertsRoutes);
app.use("/api/trip", tripRoutes);
export default app;
