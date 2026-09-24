import express = require("express");
import healthController = require("../controllers/health.controller");

const router: express.Router = express.Router();

router.get("/health", healthController.getHealth);

export = router;
