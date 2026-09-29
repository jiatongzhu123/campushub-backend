import express = require("express");
import campusController = require("../controllers/campus.controller");

const router: express.Router = express.Router();

router.get("/resources", campusController.getResources);
router.post("/reservations", campusController.createReservation);
router.get("/reservations/user/:userId", campusController.getUserReservations);

export = router;
