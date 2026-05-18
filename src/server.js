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
import directorRoutes from "./routes/director.routes.js";
import asistenciaRoutes from "./routes/asistencia.routes.js"
import documentoRoutes
from "./routes/documento.routes.js";
import cicloRoutes
from "./routes/ciclo.routes.js";
import asignacionRoutes
from "./routes/asignacion.routes.js";

dotenv.config();

const app = express();

// 🔥 CORS SEGURO PRODUCCIÓN
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://TU-FRONTEND.vercel.app",
    ],
    credentials: true,
  })
);

// 🔥 BODY PARSER
app.use(express.json());

// 🔥 RUTAS API
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
app.use("/api/director", directorRoutes);
app.use(
  "/api/documentos",
  documentoRoutes
);
app.use(
  "/api/ciclos",
  cicloRoutes
);
app.use(
  "/api/asignaciones",
  asignacionRoutes
);

//app.use("/api/secretaria", secretariaRoutes);
//app.use("/api/caja", cajaRoutes);
app.use("/api/asistencias", asistenciaRoutes);

// 🔥 HEALTH CHECK
app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "SIAC Backend Running 🚀",
  });
});

// 🔥 404 HANDLER
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "Endpoint no encontrado",
  });
});

// 🔥 GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error("🔥 ERROR GLOBAL:", err);

  return res.status(500).json({
    success: false,
    message: "Error interno del servidor",
  });
});

// 🔥 PUERTO
const PORT = process.env.PORT || 4000;

// 🔥 START SERVER
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);

  // 🔥 DEBUG SOLO EN DESARROLLO
  if (process.env.NODE_ENV !== "production") {
    console.log("🔥 RUTAS DISPONIBLES:");
    console.log(listEndpoints(app));
  }
});