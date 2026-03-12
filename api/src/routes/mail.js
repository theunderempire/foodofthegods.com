import express from "express";
import { MailService } from "../services/mail.service.js";

const router = express.Router();
const service = new MailService();

router.post("/", (req, res) => service.register(req, res));
router.get("/approve/:token", (req, res) => service.approve(req, res));
router.post("/set-password", (req, res) => service.setPassword(req, res));

export default router;
