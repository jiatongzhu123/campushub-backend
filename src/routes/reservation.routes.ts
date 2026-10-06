import express = require("express");
import reservationController = require("../controllers/reservation.controller");
import resourceController = require("../controllers/resource.controller");

const router: express.Router = express.Router();

router.get("/resources", resourceController.getResources);
router.post("/reservations", reservationController.createReservation);
router.get("/reservations/user/:userId", reservationController.getUserReservations);

export = router;
