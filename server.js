require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");

const app = express();
app.use(cors());
app.use(express.json());

cloudinary.config({
  cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
  api_key: (process.env.CLOUDINARY_API_KEY || "").trim(),
  api_secret: (process.env.CLOUDINARY_API_SECRET || "").trim()
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

const libroSchema = new mongoose.Schema(
  {
    titulo: { type: String, required: true, trim: true },
    autor: { type: String, default: "Archivo en la nube", trim: true },
    categoria: { type: String, default: "General", trim: true },
    saga: { type: String, default: null, trim: true },
    tamano: { type: String, default: "PDF" },
    paginas: { type: Number, default: 1 },
    portadaColorArgb: { type: Number, default: -4696968 },
    pdfUrl: { type: String, required: true },
    cloudinaryPublicId: { type: String, required: true }
  },
  { timestamps: true }
);

const Libro = mongoose.model("Libro", libroSchema);

function subirPdfACloudinary(buffer, nombreBase) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "biblioteca_digital/pdfs",
        resource_type: "raw",
        public_id: `${Date.now()}_${nombreBase.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

app.get("/", (req, res) => {
  res.status(200).json({ ok: true, servicio: "Biblioteca Digital Cloud API" });
});

app.get("/libros", async (req, res) => {
  try {
    const libros = await Libro.find().sort({ createdAt: -1 });
    return res.status(200).json({ ok: true, libros });
  } catch (error) {
    console.error("Error obteniendo libros:", error);
    return res.status(500).json({ ok: false, error: "Error al obtener libros" });
  }
});

app.post("/libros", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "Debes adjuntar un archivo PDF en el campo 'pdf'" });
    }

    const tituloLimpio = (req.body.titulo || req.file.originalname || "Libro PDF")
      .replace(/\.pdf$/i, "")
      .trim();
    const autorLimpio = (req.body.autor || "Archivo en la nube").trim();
    const categoriaLimpia = (req.body.categoria || "General").trim();
    const sagaLimpia = req.body.saga && req.body.saga.trim() !== "" ? req.body.saga.trim() : null;
    const paginasNum = Number(req.body.paginas) > 0 ? Number(req.body.paginas) : 1;
    const colorArgb = req.body.portadaColorArgb ? Number(req.body.portadaColorArgb) : -4696968;

    const resultadoCloud = await subirPdfACloudinary(req.file.buffer, tituloLimpio);

    const nuevoLibro = await Libro.create({
      titulo: tituloLimpio,
      autor: autorLimpio,
      categoria: categoriaLimpia,
      saga: sagaLimpia,
      tamano: "PDF",
      paginas: paginasNum,
      portadaColorArgb: colorArgb,
      pdfUrl: resultadoCloud.secure_url,
      cloudinaryPublicId: resultadoCloud.public_id
    });

    return res.status(201).json({ ok: true, libro: nuevoLibro });
  } catch (error) {
    console.error("Error subiendo libro:", error);
    return res.status(500).json({ ok: false, error: "No se pudo guardar el libro en la nube" });
  }
});

app.delete("/libros/:id", async (req, res) => {
  try {
    const libro = await Libro.findById(req.params.id);
    if (!libro) {
      return res.status(404).json({ ok: false, error: "Libro no encontrado" });
    }

    if (libro.cloudinaryPublicId) {
      await cloudinary.uploader.destroy(libro.cloudinaryPublicId, { resource_type: "raw" });
    }

    await Libro.findByIdAndDelete(req.params.id);
    return res.status(200).json({ ok: true, mensaje: "Libro eliminado" });
  } catch (error) {
    console.error("Error eliminando libro:", error);
    return res.status(500).json({ ok: false, error: "No se pudo eliminar el libro" });
  }
});

const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Conectado a MongoDB Atlas");
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en puerto ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Error conectando a MongoDB Atlas:", error);
  });