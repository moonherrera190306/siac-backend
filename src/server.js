import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import listEndpoints from "express-list-endpoints";

// 🔥 ROUTES
import adminRoutes from "./routes/admin.routes.js";
import authRoutes from "./routes/auth.routes.js";
import alumnoRoutes from "./routes/alumno.routes.js";
import pagoRoutes from "./routes/pago.routes.js";
import programaRoutes from "./routes/programa.routes.js";
import carreraRoutes from "./routes/carrera.routes.js";
import semestreRoutes from "./routes/semestre.routes.js";
import grupoRoutes from "./routes/grupo.routes.js";
import materiaRoutes from "./routes/materia.routes.js";
import docenteRoutes from "./routes/docente.routes.js";
import calificacionRoutes from "./routes/calificacion.routes.js";
import reportesRoutes from "./routes/reportes.routes.js";
import directorRoutes from "./routes/director.routes.js"; // 🔥 NUEVO

dotenv.config();

const app = express();

// 🔥 MIDDLEWARES
app.use(cors());
app.use(express.json());

// 🔥 RUTAS
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/alumnos", alumnoRoutes);
app.use("/api/pagos", pagoRoutes);
app.use("/api/programas", programaRoutes);
app.use("/api/carreras", carreraRoutes);
app.use("/api/semestres", semestreRoutes);
app.use("/api/grupos", grupoRoutes);
app.use("/api/materias", materiaRoutes);
app.use("/api/docentes", docenteRoutes);
app.use("/api/calificaciones", calificacionRoutes);
app.use("/api/reportes", reportesRoutes);
app.use("/api/director", directorRoutes); // 🔥 CLAVE

// 🔥 HEALTH CHECK
app.get("/", (req, res) => {
  res.json({ message: "SIAC Backend Running 🚀" });
});

// 🔥 PUERTO
const PORT = process.env.PORT || 4000;

// 🔥 START SERVER
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);

  // 🔥 DEBUG DE RUTAS (MUY IMPORTANTE)
  console.log("🔥 RUTAS DISPONIBLES:");
  console.log(listEndpoints(app));
});